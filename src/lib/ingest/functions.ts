import { createHash } from "node:crypto";

import { get } from "@vercel/blob";
import { NonRetriableError, RetryAfterError } from "inngest";

import { COURSE_MAP_READY, DOCUMENT_UPLOADED, inngest } from "../inngest";
import { generateJsonCached } from "../llm/cache";
import { LlmBusyError, LlmCapacityError, LlmError, type LlmPart } from "../llm/provider";
import { PAST_PAPER_SCHEMA, PAST_PAPER_SYSTEM } from "../checks/prompts";
import { parseSyllabusDate } from "../schedule/dates";
import { rebuildSchedule } from "../schedule/rebuild";
import {
  contextForJob,
  failJob,
  getCourseGraph,
  persistExamQuestions,
  persistGraph,
  recordJobResult,
  setDocumentHash,
  startJobStep,
  succeedJob,
} from "../tenancy";
import { validatePastPaper, type ExamQuestionRow } from "./past-paper";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM } from "./prompts";
import { INGEST_ERRORS, stepsFor } from "./steps";
import { validateExtraction, type CleanGraph } from "./validate";

/**
 * The ingest job: fetch → extract → validate → save → schedule.
 *
 * One Inngest step per stage. Steps are memoised, so a retry after a busy
 * model resumes at the extraction instead of starting over, and each stage
 * writes its index to IngestJob as it begins — the processing screen shows
 * the job's real position.
 *
 * Two document kinds share the pipeline:
 *   SYLLABUS    → concepts, prerequisite edges, assessments → schedule, then
 *                 asks for practice questions.
 *   PAST_PAPER  → exam questions matched onto the existing map → exam weight
 *                 per concept → schedule re-planned with it. (Pro.)
 *
 * Only the extraction touches a model. Validation, date parsing, weights,
 * saving and the schedule are code.
 */

class JobFailure extends NonRetriableError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function loadJob(jobId: string) {
  const loaded = await contextForJob(jobId);
  if (!loaded) throw new NonRetriableError(`Ingest job ${jobId} no longer exists.`);
  return loaded;
}

async function readBlob(pathname: string): Promise<Uint8Array> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) {
    throw new JobFailure("MISSING_FILE", INGEST_ERRORS.MISSING_FILE.title);
  }
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

/** A PDF starts with "%PDF-" (a few bytes of junk before it are tolerated). */
function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");
}

type Validated = { kind: "SYLLABUS"; graph: CleanGraph } | { kind: "PAST_PAPER"; rows: ExamQuestionRow[] };

export const ingestDocument = inngest.createFunction(
  {
    id: "ingest-document",
    retries: 4,
    triggers: [{ event: DOCUMENT_UPLOADED }],
    // One student cannot occupy every worker with a stack of uploads.
    concurrency: { limit: 2, key: "event.data.workspaceId" },
    onFailure: async ({ event, error }) => {
      const jobId = String((event.data.event.data as { jobId?: unknown }).jobId ?? "");
      const loaded = await contextForJob(jobId);
      if (!loaded) return;
      const code = error instanceof JobFailure ? error.code : "FAILED";
      await failJob(loaded.ctx, jobId, code, error.message);
    },
  },
  async ({ event, step }) => {
    const jobId = String((event.data as { jobId?: unknown }).jobId ?? "");
    const workspaceId = String((event.data as { workspaceId?: unknown }).workspaceId ?? "");

    const fail = async (code: string, message: string): Promise<never> => {
      const { ctx } = await loadJob(jobId);
      await failJob(ctx, jobId, code, message);
      throw new JobFailure(code, message);
    };

    // ── 1. read ─────────────────────────────────────────────────────────────
    const doc = await step.run("read", async () => {
      const { ctx, job } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 1, stepsFor(job.kind)[0]);
      const bytes = await readBlob(job.blobPathname);
      if (!isPdf(bytes)) await fail("WRONG_FORMAT", INGEST_ERRORS.WRONG_FORMAT.title);
      await setDocumentHash(ctx, job.documentId, createHash("sha256").update(bytes).digest("hex"));
      return { courseId: job.courseId, kind: job.kind, documentId: job.documentId };
    });
    const steps = stepsFor(doc.kind);

    // ── 2. extract (the only model call) ────────────────────────────────────
    const raw = await step.run("extract", async () => {
      const { ctx, job } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 2, steps[1]);

      let system = EXTRACTION_SYSTEM;
      let schema: object = EXTRACTION_SCHEMA;
      let instruction = EXTRACTION_PROMPT;
      if (doc.kind === "PAST_PAPER") {
        const graph = await getCourseGraph(ctx, doc.courseId);
        if (!graph || graph.concepts.length === 0) return fail("NEEDS_SYLLABUS", INGEST_ERRORS.NEEDS_SYLLABUS.title);
        system = PAST_PAPER_SYSTEM;
        schema = PAST_PAPER_SCHEMA;
        instruction =
          `Course: ${graph.course.title}\nConcept list:\n` +
          graph.concepts.map((c) => `- id: ${c.slug} — ${c.name}: ${c.summary}`).join("\n") +
          "\n\nClassify this document, then map each exam question onto the concept list.";
      }

      const parts: LlmPart[] = [
        { kind: "pdf", data: await readBlob(job.blobPathname) },
        { kind: "text", text: instruction },
      ];
      try {
        const response = await generateJsonCached({ label: `extract-${doc.kind.toLowerCase()}`, system, schema, parts });
        await recordJobResult(ctx, jobId, { model: response.model });
        return response.raw;
      } catch (err) {
        // Busy: Inngest waits and retries this step — the read above is not repeated.
        if (err instanceof LlmBusyError) throw new RetryAfterError(err.message, err.retryAfterMs, { cause: err });
        if (err instanceof LlmCapacityError) return fail("AT_CAPACITY", err.message);
        if (err instanceof LlmError) return fail("READER_ERROR", err.message);
        throw err;
      }
    });

    // ── 3. validate ─────────────────────────────────────────────────────────
    const validated = await step.run("validate", async (): Promise<Validated> => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 3, steps[2]);

      if (doc.kind === "PAST_PAPER") {
        const graph = await getCourseGraph(ctx, doc.courseId);
        const result = validatePastPaper(raw, new Set(graph?.concepts.map((c) => c.slug) ?? []));
        if (!result.ok) return fail(result.code, result.message);
        await recordJobResult(ctx, jobId, { report: { questions: result.questions, unmatched: result.unmatched } });
        return { kind: "PAST_PAPER", rows: result.rows };
      }

      const result = validateExtraction(raw);
      if (!result.ok) return fail(result.code, result.message);
      await recordJobResult(ctx, jobId, { report: result.report });
      return { kind: "SYLLABUS", graph: result.graph };
    });

    // ── 4. save ─────────────────────────────────────────────────────────────
    await step.run("save", async () => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 4, steps[3]);

      if (validated.kind === "PAST_PAPER") {
        const graph = await getCourseGraph(ctx, doc.courseId);
        const idOf = new Map(graph?.concepts.map((c) => [c.slug, c.id]) ?? []);
        await persistExamQuestions(
          ctx,
          doc.courseId,
          doc.documentId,
          validated.rows.flatMap((r) => {
            const conceptId = idOf.get(r.conceptSlug);
            return conceptId ? [{ conceptId, label: r.label, text: r.text, marks: r.marks }] : [];
          }),
        );
        return;
      }

      // Dates are decided here, in code, against the upload time.
      const reference = new Date();
      const termStart = parseSyllabusDate(validated.graph.termStartRaw, { reference });
      await persistGraph(ctx, doc.courseId, {
        termStart,
        concepts: validated.graph.concepts,
        edges: validated.graph.edges,
        assessments: validated.graph.assessments.map((a) => ({
          ...a,
          dueDate: parseSyllabusDate(a.dueDateRaw, { reference, termStart }),
        })),
      });
    });

    // ── 5. schedule ─────────────────────────────────────────────────────────
    const plan = await step.run("schedule", async () => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 5, steps[4]);
      const result = await rebuildSchedule(ctx, doc.courseId);
      await succeedJob(ctx, jobId, doc.courseId);
      return result?.status ?? "NO_DATES";
    });

    // A new map needs new practice questions. Cached, so re-uploading the same
    // syllabus costs nothing.
    if (validated.kind === "SYLLABUS") {
      await step.sendEvent("request-practice-questions", {
        name: COURSE_MAP_READY,
        data: { courseId: doc.courseId, workspaceId },
      });
    }

    return { courseId: doc.courseId, kind: doc.kind, plan };
  },
);
