import { createHash } from "node:crypto";

import { get } from "@vercel/blob";
import { NonRetriableError, RetryAfterError } from "inngest";

import { DOCUMENT_UPLOADED, inngest } from "../inngest";
import { generateJsonCached } from "../llm/cache";
import { LlmBusyError, LlmCapacityError, LlmError } from "../llm/provider";
import { parseSyllabusDate } from "../schedule/dates";
import { rebuildSchedule } from "../schedule/rebuild";
import {
  contextForJob,
  failJob,
  persistGraph,
  recordJobResult,
  setDocumentHash,
  startJobStep,
  succeedJob,
} from "../tenancy";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM } from "./prompts";
import { INGEST_ERRORS, INGEST_STEPS } from "./steps";
import { validateExtraction, type CleanGraph } from "./validate";

/**
 * The ingest job: fetch → extract → validate → save → schedule.
 *
 * One Inngest step per stage. Steps are memoised, so a retry after a busy
 * model resumes at the extraction instead of starting over, and each stage
 * writes its index to IngestJob as it begins — the processing screen shows
 * the job's real position.
 *
 * Only the extraction touches a model. Validation, date parsing, saving and
 * the schedule are code.
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
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

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

    const fail = async (code: string, message: string): Promise<never> => {
      const { ctx } = await loadJob(jobId);
      await failJob(ctx, jobId, code, message);
      throw new JobFailure(code, message);
    };

    // ── 1. read ─────────────────────────────────────────────────────────────
    const courseId = await step.run("read", async () => {
      const { ctx, job } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 1, INGEST_STEPS[0]);
      const bytes = await readBlob(job.blobPathname);
      if (!isPdf(bytes)) await fail("WRONG_FORMAT", INGEST_ERRORS.WRONG_FORMAT.title);
      await setDocumentHash(ctx, job.documentId, createHash("sha256").update(bytes).digest("hex"));
      return job.courseId;
    });

    // ── 2. extract (the only model call) ────────────────────────────────────
    const raw = await step.run("extract", async () => {
      const { ctx, job } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 2, INGEST_STEPS[1]);
      const bytes = await readBlob(job.blobPathname);
      try {
        const response = await generateJsonCached({
          label: "extract",
          system: EXTRACTION_SYSTEM,
          schema: EXTRACTION_SCHEMA,
          parts: [
            { kind: "pdf", data: bytes },
            { kind: "text", text: EXTRACTION_PROMPT },
          ],
        });
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
    const graph = await step.run("validate", async (): Promise<CleanGraph> => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 3, INGEST_STEPS[2]);
      const result = validateExtraction(raw);
      if (!result.ok) return fail(result.code, result.message);
      await recordJobResult(ctx, jobId, { report: result.report });
      return result.graph;
    });

    // ── 4. save ─────────────────────────────────────────────────────────────
    await step.run("save", async () => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 4, INGEST_STEPS[3]);
      // Dates are decided here, in code, against the upload time.
      const reference = new Date();
      const termStart = parseSyllabusDate(graph.termStartRaw, { reference });
      await persistGraph(ctx, courseId, {
        termStart,
        concepts: graph.concepts,
        edges: graph.edges,
        assessments: graph.assessments.map((a) => ({
          ...a,
          dueDate: parseSyllabusDate(a.dueDateRaw, { reference, termStart }),
        })),
      });
    });

    // ── 5. schedule ─────────────────────────────────────────────────────────
    const plan = await step.run("schedule", async () => {
      const { ctx } = await loadJob(jobId);
      await startJobStep(ctx, jobId, 5, INGEST_STEPS[4]);
      const result = await rebuildSchedule(ctx, courseId);
      await succeedJob(ctx, jobId, courseId);
      return result?.status ?? "NO_DATES";
    });

    return { courseId, concepts: graph.concepts.length, edges: graph.edges.length, plan };
  },
);
