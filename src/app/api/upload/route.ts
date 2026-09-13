import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { auth } from "@/lib/auth";
import { FeatureLockedError, LimitExceededError, PLANS } from "@/lib/plans";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { assertCanUpload, DemoReadOnlyError, ensurePersonalWorkspace, NotFoundError, uploadPrefix } from "@/lib/tenancy";

/**
 * Issues a short-lived token for the browser to upload a PDF straight to
 * private Blob storage — large past papers never pass through a function,
 * which caps request bodies at 4.5 MB.
 *
 * Every check happens BEFORE the token exists: signed in, owns the course,
 * within the plan's document limit, Pro for past papers, PDF only, and a
 * pathname inside this workspace's own prefix.
 */

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });
  const ctx = await ensurePersonalWorkspace(session.user.id, session.user.name);

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload ?? "{}") as { courseId?: unknown; kind?: unknown };
        const courseId = typeof payload.courseId === "string" ? payload.courseId : "";
        const kind = payload.kind === "PAST_PAPER" ? "PAST_PAPER" : "SYLLABUS";

        await assertCanUpload(ctx, courseId, kind);
        if (!pathname.startsWith(uploadPrefix(ctx, courseId))) throw new NotFoundError("That upload location");

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof LimitExceededError) {
      return Response.json(
        {
          error: `The ${PLANS[error.plan].name} plan includes ${error.max} documents. Pro removes the limit.`,
          limitHit: true,
        },
        { status: 403 },
      );
    }
    if (error instanceof FeatureLockedError) {
      return Response.json({ error: "Past papers are part of Pro.", limitHit: true }, { status: 403 });
    }
    if (error instanceof NotFoundError) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof DemoReadOnlyError) return Response.json({ error: error.message }, { status: 403 });
    console.error("[upload]", error);
    return Response.json({ error: "The upload couldn't start. Try again." }, { status: 400 });
  }
}
