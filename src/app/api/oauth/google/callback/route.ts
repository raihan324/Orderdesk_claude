import { NextResponse, type NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/auth/session";
import { exchangeCode, fetchEmail } from "@/lib/oauth/google";
import { smtpSettingsService } from "@/server/services/smtp-settings.service";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "od_google_oauth_state";

function settingsUrl(query: string): URL {
  return new URL(`/settings/smtp?${query}`, process.env.NEXT_PUBLIC_APP_URL);
}

/**
 * Google redirects back here after consent. We verify the CSRF state, swap the
 * code for a refresh token, read which mailbox was connected, and persist it
 * (encrypted) against the current user. No password is ever stored.
 */
export async function GET(request: NextRequest) {
  const principal = await requirePrincipal();
  if (principal.kind !== "INTERNAL") {
    return NextResponse.redirect(settingsUrl("oauth=forbidden"));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(settingsUrl(`oauth=google_denied`));
  }

  // CSRF check: the state we set on /start must match what Google echoed back.
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(settingsUrl("oauth=google_state_mismatch"));
  }

  try {
    const { refreshToken, accessToken } = await exchangeCode(code);
    const email = await fetchEmail(accessToken);
    await smtpSettingsService.saveGoogleOAuth(principal, { refreshToken, email });
  } catch (err) {
    console.error("[oauth/google] callback failed:", err);
    return NextResponse.redirect(settingsUrl("oauth=google_failed"));
  }

  const res = NextResponse.redirect(settingsUrl("oauth=google_connected"));
  res.cookies.delete(STATE_COOKIE); // one-time use
  return res;
}
