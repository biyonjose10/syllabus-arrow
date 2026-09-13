/** Shared by the upload token route and the browser's pre-check. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Above this, the browser uploads in parts. */
export const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;

/** Keeps the name readable in storage without trusting it for anything. */
export function safeFilename(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${(base || "document").slice(0, 60)}.pdf`;
}
