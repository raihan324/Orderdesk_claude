import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { SettingsNav } from "@/components/settings-nav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");
  if (p.kind === "SERVICE") redirect("/sign-in");

  const showApiKeys = can(p, "apikey.manage");

  return (
    <AppShell principal={p}>
      <div className="max-w-4xl">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Manage your profile, email, and integrations.</p>
        <div className="mt-6 flex flex-col gap-6 sm:flex-row">
          <SettingsNav showApiKeys={showApiKeys} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </AppShell>
  );
}
