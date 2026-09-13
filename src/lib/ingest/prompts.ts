/**
 * The extraction call: one PDF in, concepts + prerequisite edges + assessments out.
 *
 * Lifted from scripts/spike-graph.ts, where this prompt passed on MIT 18.06 and
 * a 23-page NIT scheme. Three things were added for the product, each because
 * code downstream needs it:
 *
 *   - `documentType`   so a lecture slide deck or a timetable gets an honest
 *                      "this isn't a syllabus" instead of a nonsense graph.
 *   - `conceptIds` on each assessment, so the scheduler knows which topics must
 *                      be learned before which deadline.
 *   - `termStart`      so "Week 6" can become a real date — in code, not here.
 *
 * Dates are copied verbatim and never normalised by the model. Parsing them is
 * src/lib/schedule/dates.ts's job, where it can be tested.
 */

export const EXTRACTION_SYSTEM = `You extract a PREREQUISITE DEPENDENCY GRAPH from a course document.

FIRST, CLASSIFY THE DOCUMENT
- "syllabus": a course outline, scheme of study, module handbook or course
  schedule that lists the topics of a course.
- "past_paper": an exam or test paper with questions.
- "other": anything else — lecture slides, notes, a timetable with no topics,
  a textbook chapter, an unrelated PDF.
If it is not a syllabus, return empty concepts, edges and assessments and say
why in one sentence in notSyllabusReason.

A syllabus tells you WHEN topics are taught. It does not tell you what depends
on what. That second thing is what you are for, and you must supply it from
your own knowledge of the subject.

CONCEPTS
- Extract the concepts a student must master. Not chapter headings — capabilities.
- 15-40 of them. Split anything that bundles several distinct skills.
- If the document names a topic vaguely ("Applications"), name the real concept.

EDGES — this is the part that matters
- An edge from A to B means: a student who does not understand A CANNOT
  understand B. Not "A is taught first". Not "A is related to B".
- Derive these from the subject itself. You know that PCA requires
  eigenvectors, that backpropagation requires the chain rule, that
  hypothesis testing requires sampling distributions. The syllabus will not
  tell you any of that. Say it anyway.
- Cross-module edges are expected and wanted. Real dependencies routinely
  jump backwards and forwards across a course calendar.
- Most concepts should have MORE THAN ONE prerequisite. A graph where every
  node has exactly one parent is a timeline, and it is wrong.
- Omit an edge you cannot justify. A sparse correct graph beats a dense guess.

RATIONALE
- State the dependency in terms of capability: "you cannot compute a gradient
  through composed functions without the chain rule".
- NEVER write a rationale that refers to weeks, modules, units or ordering.
  If the only reason you can give is "it comes first", the edge is not real —
  drop it.

ASSESSMENTS
- Every exam, quiz, assignment and project, with dates and weights if stated.
- Copy dates verbatim ("Week 6", "TBA", "15 Oct", "March 3, 2026"). Do not
  invent, normalise or guess a year.
- conceptIds: the concepts that assessment examines. A final exam examines
  everything taught before it. If the document does not say, infer from when
  the assessment falls relative to the topics.

TERM START
- termStart: the first day of classes, verbatim, if the document states one.
  Null otherwise. Never guess.`;

export const EXTRACTION_PROMPT = "Classify this document, then extract the concept dependency graph.";

/**
 * Schema-constrained because every field is read by code, never by a person.
 * Nullable fields use a type union: responseJsonSchema takes the standard JSON
 * Schema dialect, where `nullable` means nothing.
 */
export const EXTRACTION_SCHEMA = {
  type: "object",
  required: ["documentType", "notSyllabusReason", "courseTitle", "termStart", "concepts", "edges", "assessments"],
  properties: {
    documentType: { type: "string", enum: ["syllabus", "past_paper", "other"] },
    notSyllabusReason: {
      type: ["string", "null"],
      description: "One sentence, only when documentType is not syllabus.",
    },
    courseTitle: { type: "string" },
    termStart: {
      type: ["string", "null"],
      description: "First day of classes, verbatim. Null if not stated.",
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "summary", "sourceRef"],
        properties: {
          id: { type: "string", description: 'Stable slug, e.g. "eigenvectors". Referenced by edges.' },
          name: { type: "string", description: "Human label, 1-4 words." },
          summary: { type: "string", description: "One sentence: what a student must be able to DO." },
          sourceRef: {
            type: "string",
            description: 'Where in the document this came from, e.g. "Module II" or "Week 4".',
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from", "to", "rationale"],
        properties: {
          from: { type: "string", description: "Concept id of the PREREQUISITE." },
          to: { type: "string", description: "Concept id that DEPENDS on it." },
          rationale: {
            type: "string",
            description:
              "Why 'to' is not learnable without 'from'. Must be a claim about understanding, never about ordering in the document.",
          },
        },
      },
    },
    assessments: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "dueDate", "weight", "conceptIds"],
        properties: {
          title: { type: "string" },
          dueDate: {
            type: ["string", "null"],
            description: 'Verbatim from the document — "Week 6", "TBA", "15 Oct". Null if absent.',
          },
          weight: {
            type: ["number", "null"],
            description: "Percentage of the final grade, if stated. Null if absent.",
          },
          conceptIds: {
            type: "array",
            items: { type: "string" },
            description: "Concept ids this assessment examines.",
          },
        },
      },
    },
  },
} as const;
