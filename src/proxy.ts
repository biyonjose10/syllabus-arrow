import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Signed-out visitors to app pages go to sign-in.
 *
 * UX only, NOT a security boundary: this checks that a session cookie exists,
 * not that it is valid, and it never touches the database (proxy runs on every
 * matched request, prefetches included). Every page and route validates the
 * session itself through `requireWorkspace()`. Deleting this file must not let
 * anyone read anything new.
 *
 * API routes are not matched — a redirect to an HTML form is useless to a JSON
 * client, so they answer 401 themselves.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/dashboard/:path*", "/courses/:path*", "/onboarding/:path*", "/billing/:path*"],
};
