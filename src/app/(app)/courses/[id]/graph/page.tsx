import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConceptGraph } from "@/components/ConceptGraph";
import { buttonClass, Card } from "@/components/ui";
import { downstream, topoSort } from "@/lib/graph/algorithms";
import { requireWorkspace } from "@/lib/session";
import { getCourseGraph } from "@/lib/tenancy";

export const metadata: Metadata = { title: "Concept map — Syllabus→" };

export default async function GraphPage({ params }: PageProps<"/courses/[id]/graph">) {
  const { id } = await params;
  const { ctx } = await requireWorkspace(`/courses/${id}/graph`);
  const graph = await getCourseGraph(ctx, id);
  if (!graph) notFound();

  if (graph.concepts.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3 p-6">
        <h2 className="text-lg font-semibold">No map yet</h2>
        <p className="text-sm text-ink-2">Upload the syllabus and the map appears here.</p>
        <Link href={`/courses/${id}`} className={buttonClass("primary")}>
          Upload a syllabus
        </Link>
      </Card>
    );
  }

  const edges = graph.edges.map((e) => ({ id: e.id, from: e.fromId, to: e.toId, rationale: e.rationale }));
  const concepts = graph.concepts.map((c) => ({
    id: c.id,
    name: c.name,
    summary: c.summary,
    sourceRef: c.sourceRef,
    downstreamCount: downstream(c.id, edges).size,
  }));

  // The same order the scheduler starts from — readable without the canvas.
  const order = topoSort(concepts.map((c) => c.id), edges) ?? concepts.map((c) => c.id);
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const keystones = [...concepts].sort((a, b) => b.downstreamCount - a.downstreamCount).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm leading-relaxed text-ink-2">
        {concepts.length} topics, {edges.length} prerequisite links. The keystones —{" "}
        {keystones.map((k, i) => (
          <span key={k.id}>
            <strong className="font-semibold text-ink">{k.name}</strong> ({k.downstreamCount})
            {i < keystones.length - 1 ? ", " : ""}
          </span>
        ))}{" "}
        — have the most topics resting on them.
      </p>

      <ConceptGraph concepts={concepts} edges={edges} />

      <Card className="p-5">
        <details>
          <summary className="cursor-pointer font-semibold">All topics in learning order</summary>
          <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-sm">
            {order.map((conceptId) => {
              const c = byId.get(conceptId)!;
              const needs = edges.filter((e) => e.to === conceptId).map((e) => byId.get(e.from)!.name);
              return (
                <li key={conceptId}>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-ink-3"> — {needs.length ? `needs ${needs.join(", ")}` : "starting point"}</span>
                </li>
              );
            })}
          </ol>
        </details>
      </Card>
    </div>
  );
}
