/** "0 of 1 courses" — the limit a free plan enforces, shown before it is hit. */
export function UsageMeter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const full = max !== null && used >= max;
  const pct = max === null ? 0 : Math.min(100, Math.round((used / Math.max(1, max)) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-2">{label}</span>
        <span className={`font-mono tabular-nums ${full ? "text-accent" : "text-ink"}`}>
          {max === null ? `${used} · unlimited` : `${used} of ${max}`}
        </span>
      </div>
      {max === null ? null : (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-paper-2"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={used}
        >
          <div className={`h-full rounded-full ${full ? "bg-accent" : "bg-ink"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
