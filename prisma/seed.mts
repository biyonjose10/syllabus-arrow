/**
 * Seeds the demo workspace: MIT 18.06 Linear Algebra, view-only.
 *
 * Costs nothing. The map comes from the spike's cached extraction and the
 * practice questions from the spike's cached generate + blind solve — the
 * very run that proved the method (.cache/spike, .cache/spike-checks).
 *
 * Then it plays out the product's central story so a judge can see it without
 * practising for a week: the demo student has marked a keystone topic done,
 * and has been getting the topics that depend on it wrong. The insights page
 * says so, with numbers.
 *
 * Usage: DEMO_USER_PASSWORD must be set (.env.local), then `npx prisma db seed`.
 * Re-running replaces the demo workspace completely.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";

import { DEMO_ASSESSMENTS, DEMO_DATE_LABEL, DEMO_EMAIL, DEMO_EXAM_IN_DAYS } from "../src/lib/demo";
import { downstream, topoSort } from "../src/lib/graph/algorithms";
import { slugify } from "../src/lib/ingest/validate";
import { loadEnv } from "../src/lib/load-env";
import { bktReplay } from "../src/lib/mastery/bkt";
import { addDays, utcDay } from "../src/lib/schedule/dates";
import { buildSchedule } from "../src/lib/schedule/scheduler";

loadEnv();

const GRAPH_CACHE = join(".cache", "spike", "0f92716101bfa5c8e2b5f5d6ad4685af.json");
const CHECKS_DIR = join(".cache", "spike-checks");
const GENERATED = join(CHECKS_DIR, "1b750837aecfa1cbb4bd7b4ffa08ca0e.json");
const SOLVED = join(CHECKS_DIR, "ac227a7ee4c21c4651a894440fad0255.json");

type SpikeGraph = {
  courseTitle: string;
  concepts: { id: string; name: string; summary: string; sourceRef: string }[];
  edges: { from: string; to: string; rationale: string }[];
};
type SpikeQuestion = { conceptId: string; stem: string; options: string[]; answerIndex: number; explanation: string };

const readCached = <T,>(path: string): T => JSON.parse((JSON.parse(readFileSync(path, "utf8")) as { raw: string }).raw) as T;

/** scripts/spike-checks.ts's exact shuffle, so the cached blind answers line up. */
function spikeShuffle(q: SpikeQuestion): SpikeQuestion {
  const h = createHash("sha256").update(q.stem).update(" ").digest("hex").slice(0, 32);
  const order = q.options.map((_, i) => i);
  let seed = parseInt(h.slice(0, 8), 16);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) };
}

async function main() {
  const password = process.env.DEMO_USER_PASSWORD;
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!password || !url) throw new Error("Set DEMO_USER_PASSWORD and DATABASE_URL in .env.local first.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const today = utcDay(new Date());

  // ── wipe ──────────────────────────────────────────────────────────────────
  await db.workspace.deleteMany({ where: { isDemo: true } });
  await db.user.deleteMany({ where: { email: DEMO_EMAIL } });

  // ── the demo student ──────────────────────────────────────────────────────
  const user = await db.user.create({
    data: { id: randomUUID(), name: "Demo Student", email: DEMO_EMAIL, emailVerified: true },
  });
  await db.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: await hashPassword(password),
    },
  });
  const workspace = await db.workspace.create({
    data: { name: "Demo workspace", isDemo: true, memberships: { create: { userId: user.id, role: "OWNER" } } },
  });
  const ws = workspace.id;

  // ── the map ───────────────────────────────────────────────────────────────
  const graph = readCached<SpikeGraph>(GRAPH_CACHE);
  const course = await db.course.create({
    data: {
      workspaceId: ws,
      title: "18.06 Linear Algebra",
      status: "READY",
      examDate: addDays(today, DEMO_EXAM_IN_DAYS),
      minutesPerDay: 60,
      checksStatus: "READY",
    },
  });
  const document = await db.document.create({
    data: {
      workspaceId: ws,
      courseId: course.id,
      kind: "SYLLABUS",
      filename: "MIT-18.06-syllabus.pdf",
      blobPathname: "demo/MIT-18.06-syllabus.pdf",
      mimeType: "application/pdf",
      sizeBytes: 95_000,
    },
  });
  await db.ingestJob.create({
    data: {
      workspaceId: ws,
      documentId: document.id,
      status: "SUCCEEDED",
      stepIndex: 5,
      stepCount: 5,
      model: "cache",
      finishedAt: new Date(),
    },
  });

  const slugOf = new Map(graph.concepts.map((c) => [c.id, slugify(c.id)]));
  await db.concept.createMany({
    data: graph.concepts.map((c, position) => ({
      workspaceId: ws,
      courseId: course.id,
      slug: slugOf.get(c.id)!,
      position,
      name: c.name,
      summary: c.summary,
      sourceRef: c.sourceRef,
    })),
  });
  const rows = await db.concept.findMany({ where: { courseId: course.id }, select: { id: true, slug: true } });
  const idOfSpike = new Map(graph.concepts.map((c) => [c.id, rows.find((r) => r.slug === slugOf.get(c.id))!.id]));
  const validEdges = graph.edges.filter((e) => idOfSpike.has(e.from) && idOfSpike.has(e.to));
  await db.edge.createMany({
    data: validEdges.map((e) => ({
      workspaceId: ws,
      courseId: course.id,
      fromId: idOfSpike.get(e.from)!,
      toId: idOfSpike.get(e.to)!,
      rationale: e.rationale,
    })),
    skipDuplicates: true,
  });

  const conceptIds = graph.concepts.map((c) => idOfSpike.get(c.id)!);
  const edges = validEdges.map((e) => ({ from: idOfSpike.get(e.from)!, to: idOfSpike.get(e.to)! }));
  const order = topoSort(conceptIds, edges) ?? conceptIds;

  // Midterms examine the first third / two thirds of the course in learning order.
  for (const a of DEMO_ASSESSMENTS) {
    const covered = order.slice(0, Math.max(1, Math.round(order.length * a.share)));
    await db.assessment.create({
      data: {
        workspaceId: ws,
        courseId: course.id,
        title: a.title,
        dueDateRaw: DEMO_DATE_LABEL,
        dueDate: addDays(today, a.inDays),
        weight: a.weight,
        concepts: { create: covered.map((conceptId) => ({ conceptId, workspaceId: ws })) },
      },
    });
  }

  // ── practice questions: the spike's blind double-solve, replayed ─────────
  const generated = readCached<{ questions: SpikeQuestion[] }>(GENERATED).questions;
  const solved = new Map(readCached<{ answers: { id: number; answerIndex: number }[] }>(SOLVED).answers.map((a) => [a.id, a.answerIndex]));
  const questions = generated
    .filter((q) => q.options.length === 4 && q.answerIndex >= 0 && q.answerIndex <= 3 && idOfSpike.has(q.conceptId))
    .map(spikeShuffle)
    .map((q, i) => ({ ...q, verified: solved.get(i) === q.answerIndex }));

  for (const q of questions) {
    await db.checkQuestion.create({
      data: {
        workspaceId: ws,
        courseId: course.id,
        conceptId: idOfSpike.get(q.conceptId)!,
        stem: q.stem,
        options: q.options,
        answerIndex: q.answerIndex,
        explanation: q.explanation,
        verified: q.verified,
      },
    });
  }
  const verified = await db.checkQuestion.findMany({
    where: { courseId: course.id, verified: true },
    select: { id: true, conceptId: true, answerIndex: true },
    orderBy: { createdAt: "asc" },
  });
  const questionsFor = (conceptId: string) => verified.filter((q) => q.conceptId === conceptId);

  // ── the story ─────────────────────────────────────────────────────────────
  // The marked-done keystone: the concept with the most dependents that have
  // verified questions. It "feels done" and isn't.
  const keystone = [...conceptIds]
    .map((id) => ({ id, dependents: [...downstream(id, edges)].filter((d) => questionsFor(d).length >= 2) }))
    .filter((c) => c.dependents.length >= 2)
    .sort((a, b) => b.dependents.length - a.dependents.length)[0];
  if (!keystone) throw new Error("No concept has enough verified dependents for the demo story.");

  const answers: { questionId: string; conceptId: string; chosenIndex: number; correct: boolean }[] = [];
  const answer = (q: { id: string; conceptId: string; answerIndex: number }, correct: boolean) =>
    answers.push({ questionId: q.id, conceptId: q.conceptId, chosenIndex: correct ? q.answerIndex : (q.answerIndex + 1) % 4, correct });

  // Wrong on the topics that need the keystone (one right answer among them).
  keystone.dependents.slice(0, 3).forEach((dependent, i) => {
    questionsFor(dependent).slice(0, 2).forEach((q, j) => answer(q, i === 0 && j === 1));
  });
  // Solid on two foundations that genuinely are done.
  const foundations = order.filter((id) => id !== keystone.id && !keystone.dependents.includes(id) && questionsFor(id).length >= 3).slice(0, 2);
  for (const id of foundations) questionsFor(id).slice(0, 3).forEach((q) => answer(q, true));

  let minute = 0;
  for (const a of answers) {
    await db.attempt.create({
      data: {
        workspaceId: ws,
        userId: user.id,
        questionId: a.questionId,
        chosenIndex: a.chosenIndex,
        correct: a.correct,
        createdAt: new Date(Date.now() - (answers.length - minute++) * 60_000),
      },
    });
  }
  const byConcept = new Map<string, boolean[]>();
  for (const a of answers) byConcept.set(a.conceptId, [...(byConcept.get(a.conceptId) ?? []), a.correct]);
  for (const [conceptId, results] of byConcept) {
    await db.masteryState.create({
      data: {
        workspaceId: ws,
        userId: user.id,
        conceptId,
        pKnown: bktReplay(results),
        attempts: results.length,
        correct: results.filter(Boolean).length,
      },
    });
  }
  for (const conceptId of [keystone.id, ...foundations]) {
    await db.selfReport.create({ data: { workspaceId: ws, userId: user.id, conceptId } });
  }

  // ── the schedule ──────────────────────────────────────────────────────────
  const assessments = await db.assessment.findMany({
    where: { courseId: course.id },
    select: { dueDate: true, concepts: { select: { conceptId: true } } },
  });
  const plan = buildSchedule({
    conceptIds,
    edges,
    assessments: assessments.map((a) => ({ dueDate: a.dueDate, conceptIds: a.concepts.map((c) => c.conceptId) })),
    examDate: addDays(today, DEMO_EXAM_IN_DAYS),
    start: today,
    minutesPerDay: 60,
  });
  if (plan.status === "OK") {
    await db.scheduleItem.createMany({
      data: plan.items.map((i) => ({ ...i, workspaceId: ws, courseId: course.id })),
    });
  }
  await db.course.update({
    where: { id: course.id },
    data: {
      planStatus: plan.status,
      plannedAt: new Date(),
      lateConcepts: plan.status === "OK" ? plan.lateConcepts : 0,
    },
  });

  const name = new Map(graph.concepts.map((c) => [idOfSpike.get(c.id)!, c.name]));
  console.log(`\ndemo seeded — course ${course.id}`);
  console.log(`  ${conceptIds.length} concepts, ${edges.length} edges, ${verified.length}/${questions.length} verified questions`);
  console.log(`  marked done: ${[keystone.id, ...foundations].map((id) => name.get(id)).join(", ")}`);
  console.log(`  wrong downstream of ${name.get(keystone.id)}: ${keystone.dependents.slice(0, 3).map((id) => name.get(id)).join(", ")}`);
  console.log(`  ${answers.length} answers, ${plan.status === "OK" ? plan.items.length : 0} schedule items\n`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
