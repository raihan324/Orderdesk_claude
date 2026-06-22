import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePrincipal } from "@/lib/auth/session";
import { buildAuthUrl, googleOAuthConfigured } from "@/lib/oauth/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "od_google_oauth_state";

/**
 * Kick off the Google OAuth2 consent flow. Only internal (authenticated) users
 * may connect a mailbox. We stash a random `state` in an httpOnly cookie and
 * verify it on the callback to defend against CSRF.
 */
export async function GET() {
  const principal = await requirePrincipal();
  if (principal.kind !== "INTERNAL") {
    return NextResponse.redirect(new URL("/settings", process.env.NEXT_PUBLIC_APP_URL));
  }

  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?oauth=google_not_configured", process.env.NEXT_PUBLIC_APP_URL),
    );
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete consent
  });
  return res;
}
