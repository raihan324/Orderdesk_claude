import { NextResponse, type NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { exchangeCode, fetchEmail } from "@/lib/oauth/google";
import { smtpSettingsService, orgSmtpService } from "@/server/services/smtp-settings.service";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "od_google_oauth_state";
const TARGET_COOKIE = "od_google_oauth_target"; // "user" (default) | "org"

/**
 * Google redirects back here after consent. We verify the CSRF state, swap the
 * code for a refresh token, read which mailbox was connected, and persist it
 * (encrypted) — against the current user, or the organization if the flow was
 * started from the org settings. No password is ever stored.
 */
export async function GET(request: NextRequest) {
  const principal = await requirePrincipal();
  const isOrg = request.cookies.get(TARGET_COOKIE)?.value === "org";
  const base = isOrg ? "/settings/org-smtp" : "/settings/smtp";
  const settingsUrl = (query: string) => new URL(`${base}?${query}`, process.env.NEXT_PUBLIC_APP_URL);

  const finish = (query: string) => {
    const res = NextResponse.redirect(settingsUrl(query));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(TARGET_COOKIE);
    return res;
  };

  if (principal.kind !== "INTERNAL" || (isOrg && !can(principal, "org.manage"))) {
    return finish("oauth=forbidden");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return finish("oauth=google_denied");

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return finish("oauth=google_state_mismatch");
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode(code);
    const email = await fetchEmail(accessToken);
    if (isOrg) {
      await orgSmtpService.saveGoogleOAuth(principal, { refreshToken, email });
    } else {
      await smtpSettingsService.saveGoogleOAuth(principal, { refreshToken, email });
    }
  } catch (err) {
    console.error("[oauth/google] callback failed:", err);
    return finish("oauth=google_failed");
  }

  return finish("oauth=google_connected");
}
