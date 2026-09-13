import type { MasteryBand } from "@/lib/mastery/bkt";

/** One vocabulary and one palette for mastery, on the map, the lists and the insights. */

export const BAND_LABEL: Record<MasteryBand, string> = {
  unseen: "Not practised",
  struggling: "Struggling",
  learning: "Learning",
  mastered: "Mastered",
};

export const BAND_FILL: Record<MasteryBand, string> = {
  unseen: "#ffffff",
  struggling: "#fef3f2",
  learning: "#fff7e6",
  mastered: "#ecfdf3",
};

export const BAND_STROKE: Record<MasteryBand, string> = {
  unseen: "#e2e0d8",
  struggling: "#f04438",
  learning: "#f5a524",
  mastered: "#12b76a",
};

export function BandChip({ band }: { band: MasteryBand }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink"
      style={{ background: BAND_FILL[band], borderColor: BAND_STROKE[band] }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: BAND_STROKE[band] }} />
      {BAND_LABEL[band]}
    </span>
  );
}

export function BandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
      {(Object.keys(BAND_LABEL) as MasteryBand[]).map((band) => (
        <BandChip key={band} band={band} />
      ))}
      <span>· ✓ = you marked it done</span>
    </div>
  );
}
