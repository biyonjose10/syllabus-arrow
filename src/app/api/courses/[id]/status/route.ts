import { auth } from "@/lib/auth";
import { INGEST_STEPS } from "@/lib/ingest/steps";
import { ensurePersonalWorkspace, getCourseStatus } from "@/lib/tenancy";

/**
 * The processing screen's poll. Another workspace's course is a 404 — the
 * same answer as a course that does not exist.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/courses/[id]/status">) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  const ctx = await ensurePersonalWorkspace(session.user.id, session.user.name);

  const { id } = await params;
  const status = await getCourseStatus(ctx, id);
  if (!status) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json(
    { ...status, steps: INGEST_STEPS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
