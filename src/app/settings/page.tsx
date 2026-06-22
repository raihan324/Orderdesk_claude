import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { smtpSettingsService } from "@/server/services/smtp-settings.service";
import { SmtpSettingsForm } from "@/components/smtp-settings-form";
import { TestEmailComposer } from "@/components/test-email-composer";
import { isMailEnabled } from "@/server/mailer";
import { profileService } from "@/server/services/profile.service";
import { ProfileForm } from "@/components/profile-form";

export const dynamic = "force-dynamic";

// Human-readable banners for the ?oauth=... status the Google callback sets.
const OAUTH_MESSAGES: Record<string, { type: "success" | "error"; text: string }> = {
  google_connected: { type: "success", text: "Gmail connected successfully via OAuth2." },
  google_denied: { type: "error", text: "Google connection was cancelled." },
  google_failed: { type: "error", text: "Could not connect Gmail. Please try again." },
  google_state_mismatch: { type: "error", text: "Security check failed. Please retry the connection." },
  google_not_configured: { type: "error", text: "Google OAuth is not configured on the server." },
  forbidden: { type: "error", text: "Only internal users can connect a mailbox." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string }>;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const { oauth } = await searchParams;
  const oauthBanner = oauth ? OAUTH_MESSAGES[oauth] : undefined;
  const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  const [settings, profile] =
    p.kind === "INTERNAL"
      ? await Promise.all([
          smtpSettingsService.getSettings(p.userId),
          profileService.getProfile(p.userId),
        ])
      : [null, null];

  return (
    <AppShell principal={p}>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage your profile and email sending configuration.
          </p>
        </div>

        {profile && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-1">Profile</h2>
            <p className="text-sm text-slate-500 mb-6">
              Update your personal information visible to administrators.
            </p>
            <ProfileForm profile={profile} />
          </Card>
        )}

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">SMTP Configuration</h2>
          <p className="text-sm text-slate-600 mb-4">
            Configure your own SMTP account to send invitations and emails from OrderDesk.
          </p>
          {oauthBanner && (
            <div
              className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
                oauthBanner.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {oauthBanner.text}
            </div>
          )}
          <SmtpSettingsForm
            initialSettings={settings}
            userId={p.kind === "INTERNAL" ? p.userId : ""}
            googleOAuthEnabled={googleOAuthEnabled}
          />
        </Card>

        {(settings || isMailEnabled()) && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-1">Send a test email</h2>
            <p className="text-sm text-slate-600 mb-4">
              Compose and send a real email through your configured mailbox
              {settings ? "" : " (using the global fallback)"} to verify everything works.
            </p>
            <TestEmailComposer defaultTo={settings?.fromEmail ?? ""} />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
