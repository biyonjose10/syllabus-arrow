import { auth } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/demo";
import { rebuildSchedule } from "@/lib/schedule/rebuild";
import { contextForCourse, findDemoCourse, refreshDemoDates } from "@/lib/tenancy";

/**
 * "Try the demo course": signs the visitor in as the shared, view-only demo
 * student and drops them on the map.
 *
 * The fallback for a judge whose verification email lands in spam — they
 * still see the whole product. Every write path refuses the demo workspace,
 * so no visitor can change what the next one sees.
 */
export async function GET(request: Request) {
  const unavailable = () => Response.redirect(new URL("/?demo=unavailable", request.url), 303);

  const password = process.env.DEMO_USER_PASSWORD;
  const course = await findDemoCourse();
  if (!password || !course) return unavailable();

  // Keep the demo's dates relative to today, so its schedule never shows the past.
  if (await refreshDemoDates(course.id)) {
    const loaded = await contextForCourse(course.id);
    if (loaded) await rebuildSchedule(loaded.ctx, course.id, new Date(), { systemRefresh: true });
  }

  const signIn = await auth.api.signInEmail({
    body: { email: DEMO_EMAIL, password },
    headers: request.headers,
    asResponse: true,
  });
  if (!signIn.ok) {
    console.error("[demo] sign-in failed", signIn.status);
    return unavailable();
  }

  const response = new Response(null, {
    status: 303,
    headers: { Location: new URL(`/courses/${course.id}/graph`, request.url).toString() },
  });
  for (const cookie of signIn.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
  return response;
}
