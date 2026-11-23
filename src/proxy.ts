import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Cheap redirect for signed-out visitors: if there's no Better Auth session
 * cookie, send them to /sign-in?next=<path>. It only checks that the cookie
 * exists. Real session checks happen in server code (`requireUser()`).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Phase 1 sets the protected routes (member app and console) once sign-in exists.
  // Until then this matches nothing, so every placeholder page stays reachable.
  matcher: ["/__proxy-disabled-until-phase-1"],
};
