import { getScheduleInputs, replaceSchedule, type WorkspaceContext } from "../tenancy";
import { examWeights } from "./exam-weight";
import { buildSchedule } from "./scheduler";

/**
 * Recomputes and stores a course's schedule from what is in the database now.
 *
 * Called when a syllabus finishes processing and whenever the student changes
 * the exam date or daily minutes. Never calls a model — the schedule is code
 * over the graph, which is why re-planning is instant and free.
 */
export async function rebuildSchedule(
  ctx: WorkspaceContext,
  courseId: string,
  now: Date = new Date(),
  options: { systemRefresh?: boolean } = {},
) {
  const inputs = await getScheduleInputs(ctx, courseId);
  if (!inputs) return null;

  const result = buildSchedule({
    conceptIds: inputs.concepts.map((c) => c.id),
    edges: inputs.edges.map((e) => ({ from: e.fromId, to: e.toId })),
    assessments: inputs.assessments.map((a) => ({ dueDate: a.dueDate, conceptIds: a.conceptIds })),
    examDate: inputs.examDate,
    start: now,
    minutesPerDay: inputs.minutesPerDay,
    examWeight: examWeights(inputs.examQuestions),
  });

  await replaceSchedule(
    ctx,
    courseId,
    {
      status: result.status,
      lateConcepts: result.status === "OK" ? result.lateConcepts : 0,
      items: result.items,
    },
    options,
  );
  return result;
}
