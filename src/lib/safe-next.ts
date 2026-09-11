/**
 * A post-sign-in redirect target from the query string, or the dashboard.
 *
 * Only same-origin paths are allowed. `//evil.com` and `/\evil.com` are both
 * treated by browsers as protocol-relative URLs to another host, so they are
 * rejected along with anything absolute.
 */
export function safeNext(value: string | string[] | undefined | null): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}
