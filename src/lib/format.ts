/**
 * Dates in the product are calendar days stored as midnight UTC, so they are
 * always formatted in UTC — formatting in the viewer's zone would show
 * "14 Oct" as "13 Oct" to anyone west of Greenwich.
 */

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export const formatDay = (d: Date | string) => dayFormat.format(new Date(d));
export const formatWeekday = (d: Date | string) => weekdayFormat.format(new Date(d));

/** "2026-10-15" for <input type="date">. */
export const toDateInput = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
