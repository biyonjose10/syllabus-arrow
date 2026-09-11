/**
 * Graph algorithms over the prerequisite DAG.
 *
 * Lifted from scripts/spike-graph.ts, where they decided go/no-go on real
 * syllabi. An edge `from → to` means: `to` is not learnable without `from`.
 *
 * Imports nothing. The schedule, the mastery model and the insights are all
 * built on these, and none of them may depend on a model.
 */

export type Edge = { from: string; to: string };

function adjacency(edges: readonly Edge[], reverse = false): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  }
  return adj;
}

/**
 * Kahn's algorithm. Returns `null` when the graph has a cycle.
 * Edges referring to unknown ids are ignored, so callers must validate first.
 *
 * Ties are broken by the order of `ids`, which makes the result deterministic —
 * the schedule built on it must not reshuffle between two identical requests.
 */
export function topoSort(ids: readonly string[], edges: readonly Edge[]): string[] | null {
  const known = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const e of edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    indeg.set(e.to, indeg.get(e.to)! + 1);
    out.get(e.from)!.push(e.to);
  }

  const position = new Map(ids.map((id, i) => [id, i]));
  const ready = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];

  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!);
    const id = ready.shift()!;
    order.push(id);
    for (const next of out.get(id)!) {
      indeg.set(next, indeg.get(next)! - 1);
      if (indeg.get(next) === 0) ready.push(next);
    }
  }

  return order.length === ids.length ? order : null;
}

function reach(start: string, adj: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adj.get(start) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(adj.get(n) ?? []));
  }
  return seen;
}

/** Everything that depends on `id`, directly or transitively. Excludes `id`. */
export function downstream(id: string, edges: readonly Edge[]): Set<string> {
  return reach(id, adjacency(edges));
}

/** Everything `id` depends on, directly or transitively. Excludes `id`. */
export function ancestors(id: string, edges: readonly Edge[]): Set<string> {
  return reach(id, adjacency(edges, true));
}

/** Direct prerequisites only. */
export function prerequisites(id: string, edges: readonly Edge[]): string[] {
  return edges.filter((e) => e.to === id).map((e) => e.from);
}
