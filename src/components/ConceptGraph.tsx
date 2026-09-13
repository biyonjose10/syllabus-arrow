"use client";

import dagre from "@dagrejs/dagre";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MarkDoneButton } from "@/components/MarkDoneButton";
import { BAND_FILL, BAND_STROKE, BandChip, BandLegend } from "@/components/mastery";
import { buttonClass } from "@/components/ui";
import type { MasteryBand } from "@/lib/mastery/bkt";

export type GraphConcept = {
  id: string;
  name: string;
  summary: string;
  sourceRef: string;
  /** How many topics depend on this one, directly or transitively. */
  downstreamCount: number;
  band: MasteryBand;
  pKnown: number | null;
  attempts: number;
  markedDone: boolean;
  questions: number;
  /** Share of past-paper marks, when past papers exist. */
  examWeight: number | null;
};

export type GraphEdge = { id: string; from: string; to: string; rationale: string };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

/** Top-to-bottom prerequisite layout: foundations at the top. */
function layout(concepts: GraphConcept[], edges: GraphEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 28, ranksep: 64, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const c of concepts) g.setNode(c.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.from, e.to);
  dagre.layout(g);
  return new Map(
    concepts.map((c) => {
      const p = g.node(c.id);
      return [c.id, { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 }];
    }),
  );
}

function reach(start: string, adjacency: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(adjacency.get(n) ?? []));
  }
  return seen;
}

export function ConceptGraph({
  courseId,
  concepts,
  edges,
  demo,
}: {
  courseId: string;
  concepts: GraphConcept[];
  edges: GraphEdge[];
  demo: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Layout depends only on structure, so marking a topic done never moves the map.
  const structure = useMemo(() => concepts.map((c) => c.id).join("|"), [concepts]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const positions = useMemo(() => layout(concepts, edges), [structure, edges]);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const { down, up } = useMemo(() => {
    const down = new Map<string, string[]>();
    const up = new Map<string, string[]>();
    for (const e of edges) {
      down.set(e.from, [...(down.get(e.from) ?? []), e.to]);
      up.set(e.to, [...(up.get(e.to) ?? []), e.from]);
    }
    return { down, up };
  }, [edges]);

  const ancestors = useMemo(() => (selected ? reach(selected, up) : new Set<string>()), [selected, up]);
  const descendants = useMemo(() => (selected ? reach(selected, down) : new Set<string>()), [selected, down]);

  const nodes: Node[] = concepts.map((c) => {
    const isSelected = c.id === selected;
    const related = ancestors.has(c.id) || descendants.has(c.id);
    const dimmed = selected !== null && !isSelected && !related;
    return {
      id: c.id,
      position: positions.get(c.id)!,
      data: { label: `${c.markedDone ? "✓ " : ""}${c.name}` },
      connectable: false,
      draggable: false,
      ariaLabel: `${c.name}. ${c.downstreamCount} topics depend on it.${c.markedDone ? " Marked done." : ""}`,
      style: {
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.25,
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "var(--color-ink)",
        background: BAND_FILL[c.band],
        border: `${isSelected ? 2.5 : 1.5}px solid ${isSelected ? "var(--color-accent)" : BAND_STROKE[c.band]}`,
        boxShadow: isSelected ? "0 0 0 4px var(--color-accent-soft)" : undefined,
        opacity: dimmed ? 0.35 : 1,
        fontWeight: isSelected ? 600 : 500,
      },
    };
  });

  const flowEdges: Edge[] = edges.map((e) => {
    const onPath =
      selected !== null &&
      (((e.to === selected || ancestors.has(e.to)) && (ancestors.has(e.from) || e.from === selected)) ||
        ((e.from === selected || descendants.has(e.from)) && descendants.has(e.to)));
    const color = onPath ? "var(--color-accent)" : "var(--color-ink-3)";
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: onPath ? 2 : 1, opacity: selected && !onPath ? 0.25 : 0.8 },
    };
  });

  const active = selected ? byId.get(selected) : null;
  const prerequisites = active ? edges.filter((e) => e.to === active.id) : [];
  const unlocks = active ? edges.filter((e) => e.from === active.id) : [];

  return (
    <div className="flex flex-col gap-3">
      <BandLegend />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[65vh] min-h-96 overflow-hidden rounded-xl border border-line bg-white">
          <ReactFlow
            nodes={nodes}
            edges={flowEdges}
            onNodeClick={(_, node) => setSelected((current) => (current === node.id ? null : node.id))}
            onPaneClick={() => setSelected(null)}
            nodesConnectable={false}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            // The first fit can run before the container has its final size (slow phones,
            // late CSS), leaving the graph off-centre. Fit again once layout has settled.
            onInit={(instance) => requestAnimationFrame(() => void instance.fitView({ padding: 0.15 }))}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="var(--color-line)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5" aria-live="polite">
          {active ? (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-ink-3">{active.sourceRef}</p>
                <h2 className="text-lg font-semibold">{active.name}</h2>
                <p className="text-sm leading-relaxed text-ink-2">{active.summary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <BandChip band={active.band} />
                {active.attempts ? (
                  <span className="text-ink-3">
                    {Math.round((active.pKnown ?? 0) * 100)}% after {active.attempts} answer{active.attempts === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink">
                {active.downstreamCount === 0
                  ? "Nothing else in this course depends on it."
                  : `${active.downstreamCount} topic${active.downstreamCount === 1 ? "" : "s"} depend${active.downstreamCount === 1 ? "s" : ""} on this, directly or further down.`}
                {active.examWeight ? ` Worth ${Math.round(active.examWeight * 100)}% of past-paper marks.` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <MarkDoneButton key={`${active.id}-${active.markedDone}`} conceptId={active.id} done={active.markedDone} demo={demo} />
                {active.questions > 0 ? (
                  <Link href={`/courses/${courseId}/check?concept=${active.id}`} className={buttonClass("secondary")}>
                    Practise ({active.questions})
                  </Link>
                ) : null}
              </div>
              <RelationList
                title="Needs first"
                empty="A starting point — no prerequisites in this course."
                items={prerequisites.map((e) => ({ id: e.from, name: byId.get(e.from)?.name ?? "", rationale: e.rationale }))}
                onSelect={setSelected}
              />
              <RelationList
                title="Unlocks"
                empty="Nothing directly."
                items={unlocks.map((e) => ({ id: e.to, name: byId.get(e.to)?.name ?? "", rationale: e.rationale }))}
                onSelect={setSelected}
              />
            </>
          ) : (
            <div className="flex flex-col gap-2 text-sm text-ink-2">
              <h2 className="text-base font-semibold text-ink">How to read this</h2>
              <p>Foundations are at the top. An arrow means the lower topic can&apos;t be understood without the upper one.</p>
              <p>Tap a topic to see what it needs, what it unlocks, and why — then mark it done or practise it.</p>
              <p>Colours come from your practice answers, not from what you marked done.</p>
              <p className="text-ink-3">
                The syllabus lists when things are taught. These links are inferred from the subject itself, and every one
                carries its reason.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function RelationList({
  title,
  empty,
  items,
  onSelect,
}: {
  title: string;
  empty: string;
  items: { id: string; name: string; rationale: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="w-full rounded-lg border border-line px-3 py-2 text-left hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-ink"
              >
                <span className="block text-sm font-medium">{item.name}</span>
                <span className="block text-xs leading-relaxed text-ink-2">{item.rationale}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
