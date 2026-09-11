import { describe, expect, it } from "vitest";

import { ancestors, downstream, prerequisites, topoSort, type Edge } from "../src/lib/graph/algorithms";

// A slice of the real MIT 18.06 extraction.
const ids = ["determinants", "subspaces", "eigen", "diagonalization", "spectral", "svd", "elimination"];
const edges: Edge[] = [
  { from: "elimination", to: "subspaces" },
  { from: "elimination", to: "determinants" },
  { from: "determinants", to: "eigen" },
  { from: "subspaces", to: "eigen" },
  { from: "eigen", to: "diagonalization" },
  { from: "diagonalization", to: "spectral" },
  { from: "spectral", to: "svd" },
];

describe("topoSort", () => {
  it("never places a concept before any of its prerequisites", () => {
    const order = topoSort(ids, edges)!;
    expect(order).toHaveLength(ids.length);
    for (const e of edges) expect(order.indexOf(e.from)).toBeLessThan(order.indexOf(e.to));
  });

  it("is deterministic — ties break by input order", () => {
    expect(topoSort(ids, edges)).toEqual(topoSort(ids, edges));
    expect(topoSort(["b", "a"], [])).toEqual(["b", "a"]);
  });

  it("returns null for a cycle", () => {
    expect(topoSort(["a", "b", "c"], [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "a" },
    ])).toBeNull();
  });

  it("ignores edges that point at unknown concepts", () => {
    expect(topoSort(["a", "b"], [{ from: "a", to: "ghost" }, { from: "a", to: "b" }])).toEqual(["a", "b"]);
  });
});

describe("reachability", () => {
  it("downstream of eigenvectors is everything that depends on it", () => {
    expect(downstream("eigen", edges)).toEqual(new Set(["diagonalization", "spectral", "svd"]));
  });

  it("ancestors of SVD reach back to elimination through both parents", () => {
    expect(ancestors("svd", edges)).toEqual(
      new Set(["spectral", "diagonalization", "eigen", "determinants", "subspaces", "elimination"]),
    );
  });

  it("excludes the concept itself", () => {
    expect(downstream("svd", edges).size).toBe(0);
    expect(ancestors("elimination", edges).size).toBe(0);
  });

  it("prerequisites are direct parents only", () => {
    expect(prerequisites("eigen", edges).sort()).toEqual(["determinants", "subspaces"]);
  });
});
