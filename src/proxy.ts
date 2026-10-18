// Sends visitors without a session cookie to the login page before any protected page renders.
// This is a convenience only: every page and action still checks the session against the database.
import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = ["/dashboard", "/onboarding", "/brain"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (!request.cookies.has("ph_session")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/brain/:path*"],
};
