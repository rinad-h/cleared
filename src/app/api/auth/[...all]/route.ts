import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

/**
 * Better Auth's endpoints (sign-up, sign-in, sign-out, change password,
 * sessions). The only mutating route handler in the app: it checks
 * `trustedOrigins` itself (technologies.md §5.4). A new Better Auth instance
 * per request (`getAuth()` reads this request's env and D1).
 */
export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
