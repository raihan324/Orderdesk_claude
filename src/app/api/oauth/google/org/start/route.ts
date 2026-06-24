import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { buildAuthUrl, googleOAuthConfigured } from "@/lib/oauth/google";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "od_google_oauth_state";
const TARGET_COOKIE = "od_google_oauth_target";

/**
 * Begin the Google OAuth2 flow for the ORGANIZATION mailbox (SUPER_ADMIN only).
 * Reuses the shared /api/oauth/google/callback; a `target=org` cookie tells the
 * callback to save the connection to the org settings instead of the user.
 */
export async function GET() {
  const principal = await requirePrincipal();
  const orgUrl = (q = "") => new URL(`/settings/org-smtp${q}`, process.env.NEXT_PUBLIC_APP_URL);

  if (principal.kind !== "INTERNAL" || !can(principal, "org.manage")) {
    return NextResponse.redirect(orgUrl("?oauth=forbidden"));
  }
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(orgUrl("?oauth=google_not_configured"));
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set(STATE_COOKIE, state, cookieOpts);
  res.cookies.set(TARGET_COOKIE, "org", cookieOpts);
  return res;
}
