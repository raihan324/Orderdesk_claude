import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Card } from "@/components/ui";
import { orgSmtpService } from "@/server/services/smtp-settings.service";
import { OrgSmtpForm } from "@/components/org-smtp-form";

export const dynamic = "force-dynamic";

const OAUTH_MESSAGES: Record<string, { type: "success" | "error"; text: string }> = {
  google_connected: { type: "success", text: "Organization Gmail connected via OAuth2." },
  google_denied: { type: "error", text: "Google connection was cancelled." },
  google_failed: { type: "error", text: "Could not connect Gmail. Please try again." },
  google_state_mismatch: { type: "error", text: "Security check failed. Please retry." },
  google_not_configured: { type: "error", text: "Google OAuth is not configured on the server." },
  forbidden: { type: "error", text: "Only a Super Admin can connect the org mailbox." },
};

export default async function OrgSmtpSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string }>;
}) {
  const p = await getPrincipal();
  if (!p || p.kind !== "INTERNAL") redirect("/sign-in");
  // Organization SMTP is SUPER_ADMIN only.
  if (!can(p, "org.manage")) redirect("/settings/profile");

  const { oauth } = await searchParams;
  const banner = oauth ? OAUTH_MESSAGES[oauth] : undefined;
  const googleOAuthEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const initial = await orgSmtpService.get();

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-1">Organization Email (SMTP)</h2>
      <p className="text-sm text-slate-600 mb-4">
        The organization-wide mailbox used to send system emails (invites, invoices, notifications)
        when a user hasn&apos;t configured their own. Managed by Super Admins only.
      </p>
      {banner && (
        <div className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {banner.text}
        </div>
      )}
      <OrgSmtpForm initial={initial} googleOAuthEnabled={googleOAuthEnabled} />
    </Card>
  );
}
