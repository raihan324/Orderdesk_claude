import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { smtpSettingsService } from "@/server/services/smtp-settings.service";
import { SmtpSettingsForm } from "@/components/smtp-settings-form";
import { profileService } from "@/server/services/profile.service";
import { ProfileForm } from "@/components/profile-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

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
          <SmtpSettingsForm initialSettings={settings} userId={p.kind === "INTERNAL" ? p.userId : ""} />
        </Card>
      </div>
    </AppShell>
  );
}
