/**
 * Exam weight per concept: its share of the marks on the past papers mapped to
 * the course. A question with no marks shown counts as one mark, so an
 * unmarked paper still weights by how often a topic comes up.
 *
 * Pure arithmetic — the model only matched questions to concepts.
 */
export function examWeights(rows: readonly { conceptId: string; marks: number | null }[]): Map<string, number> {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const row of rows) {
    const marks = row.marks !== null && Number.isFinite(row.marks) && row.marks > 0 ? row.marks : 1;
    totals.set(row.conceptId, (totals.get(row.conceptId) ?? 0) + marks);
    sum += marks;
  }
  if (sum === 0) return new Map();
  return new Map([...totals].map(([id, marks]) => [id, marks / sum]));
}
