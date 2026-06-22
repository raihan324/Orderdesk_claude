import "server-only";

/**
 * Minimal Google OAuth2 helper for obtaining a Gmail-send refresh token.
 *
 * Flow:
 *  1. buildAuthUrl()  -> redirect the user to Google's consent screen
 *  2. user approves   -> Google redirects back to our callback with a code
 *  3. exchangeCode()  -> swap the code for tokens (incl. refresh_token)
 *  4. fetchEmail()    -> read which Gmail address was connected
 *
 * The refresh token is long-lived; nodemailer uses it (plus the client id/secret)
 * to mint short-lived access tokens at send time. We never store a password.
 */

// Scope to send mail over SMTP/XOAUTH2, plus read the account's email address.
const SCOPES = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/userinfo.email",
];

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The redirect URI registered in the Google Cloud console. */
export function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/oauth/google/callback`;
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");
  return secret;
}

/** Build the consent URL. `state` is an opaque CSRF token we verify on callback. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // force a refresh token even on re-consent
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange an authorization code for tokens. Returns the refresh token. */
export async function exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED: ${detail}`);
  }

  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data.refresh_token) {
    // Happens if the user previously consented and Google withheld a new refresh
    // token. prompt=consent should prevent this, but guard anyway.
    throw new Error("GOOGLE_NO_REFRESH_TOKEN");
  }
  return { refreshToken: data.refresh_token, accessToken: data.access_token ?? "" };
}

/** Read the connected Gmail address using a fresh access token. */
export async function fetchEmail(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("GOOGLE_USERINFO_FAILED");
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("GOOGLE_USERINFO_NO_EMAIL");
  return data.email.toLowerCase();
}
