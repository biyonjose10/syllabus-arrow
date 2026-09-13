import { NonRetriableError, RetryAfterError } from "inngest";

import { downstream } from "../graph/algorithms";
import { COURSE_MAP_READY, inngest } from "../inngest";
import { generateJsonCached } from "../llm/cache";
import { LlmBusyError, LlmCapacityError, LlmError } from "../llm/provider";
import { contextForCourse, getCourseGraph, saveCheckQuestions, setChecksStatus } from "../tenancy";
import {
  CONCEPTS_PER_BATCH,
  GENERATE_SCHEMA,
  GENERATE_SYSTEM,
  QUESTIONS_PER_CONCEPT,
  SOLVE_SCHEMA,
  solveSystem,
} from "./prompts";
import { parseGenerated, parseSolved, reconcile, shuffleOptions, solvePrompt } from "./validate";

/**
 * Writes practice questions for a course, then has a second, independent call
 * answer every one blind. Only questions where both agree are verified; only
 * verified questions are ever shown or count toward mastery.
 *
 * Concepts go most-depended-on first, so if the day's model budget runs out
 * part-way, the keystone topics — the ones insights talk about — already have
 * questions. Each batch is generate → solve → save, three memoised steps.
 */

async function loadCourse(courseId: string) {
  const loaded = await contextForCourse(courseId);
  if (!loaded) throw new NonRetriableError(`Course ${courseId} no longer exists.`);
  return loaded;
}

async function callModel(label: string, system: string, prompt: string, schema: object): Promise<string> {
  try {
    const response = await generateJsonCached({ label, system, schema, parts: [{ kind: "text", text: prompt }] });
    return response.raw;
  } catch (err) {
    if (err instanceof LlmBusyError) throw new RetryAfterError(err.message, err.retryAfterMs, { cause: err });
    if (err instanceof LlmCapacityError || err instanceof LlmError) throw new NonRetriableError(err.message, { cause: err });
    throw err;
  }
}

export const generateChecks = inngest.createFunction(
  {
    id: "generate-checks",
    retries: 4,
    triggers: [{ event: COURSE_MAP_READY }],
    concurrency: { limit: 1, key: "event.data.workspaceId" },
    onFailure: async ({ event }) => {
      const courseId = String((event.data.event.data as { courseId?: unknown }).courseId ?? "");
      const loaded = await contextForCourse(courseId);
      if (loaded) await setChecksStatus(loaded.ctx, courseId, "FAILED");
    },
  },
  async ({ event, step }) => {
    const courseId = String((event.data as { courseId?: unknown }).courseId ?? "");

    const plan = await step.run("plan", async () => {
      const { ctx, course } = await loadCourse(courseId);
      await setChecksStatus(ctx, courseId, "PENDING");
      const graph = await getCourseGraph(ctx, courseId);
      if (!graph || graph.concepts.length === 0) throw new NonRetriableError("This course has no map yet.");

      const edges = graph.edges.map((e) => ({ from: e.fromId, to: e.toId }));
      const name = new Map(graph.concepts.map((c) => [c.id, c.name]));
      const concepts = graph.concepts
        .map((c) => ({
          slug: c.slug,
          conceptId: c.id,
          name: c.name,
          summary: c.summary,
          prerequisites: edges.filter((e) => e.to === c.id).map((e) => name.get(e.from) ?? ""),
          dependents: downstream(c.id, edges).size,
        }))
        .sort((a, b) => b.dependents - a.dependents);

      const batches: (typeof concepts)[] = [];
      for (let i = 0; i < concepts.length; i += CONCEPTS_PER_BATCH) batches.push(concepts.slice(i, i + CONCEPTS_PER_BATCH));
      return { title: course.title, batches };
    });

    let verified = 0;
    for (const [index, batch] of plan.batches.entries()) {
      const n = index + 1;
      const prompt =
        `Course: ${plan.title}\n\n` +
        `Write ${QUESTIONS_PER_CONCEPT} questions for EACH concept below (${QUESTIONS_PER_CONCEPT * batch.length} total).\n\n` +
        batch
          .map(
            (c) =>
              `- id: ${c.slug}\n  name: ${c.name}\n  student must be able to: ${c.summary}\n` +
              `  prerequisites: ${c.prerequisites.join(", ") || "none"}`,
          )
          .join("\n");

      const generatedRaw = await step.run(`generate-${n}`, () =>
        callModel("checks-generate", GENERATE_SYSTEM, prompt, GENERATE_SCHEMA),
      );
      const questions = parseGenerated(generatedRaw, new Set(batch.map((c) => c.slug))).map(shuffleOptions);
      if (questions.length === 0) continue;

      const solvedRaw = await step.run(`solve-${n}`, () =>
        callModel("checks-solve", solveSystem(plan.title), solvePrompt(questions), SOLVE_SCHEMA),
      );

      verified += await step.run(`save-${n}`, async () => {
        const { ctx } = await loadCourse(courseId);
        const idOf = new Map(batch.map((c) => [c.slug, c.conceptId]));
        const rows = reconcile(questions, parseSolved(solvedRaw)).flatMap((q) => {
          const conceptId = idOf.get(q.conceptId);
          return conceptId ? [{ ...q, conceptId }] : [];
        });
        return saveCheckQuestions(ctx, courseId, rows);
      });
    }

    await step.run("finish", async () => {
      const { ctx } = await loadCourse(courseId);
      await setChecksStatus(ctx, courseId, verified > 0 ? "READY" : "FAILED");
    });

    return { courseId, verified };
  },
);
