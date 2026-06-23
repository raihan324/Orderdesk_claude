import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { Card } from "@/components/ui";
import { apiKeyService } from "@/server/services/api-key.service";
import { ApiKeysManager } from "@/components/api-keys-manager";

export const dynamic = "force-dynamic";

export default async function ApiKeysSettingsPage() {
  const p = await getPrincipal();
  if (!p || p.kind !== "INTERNAL") redirect("/sign-in");
  // Organization API keys are SUPER_ADMIN only.
  if (!can(p, "apikey.manage")) redirect("/settings/profile");

  const keys = await apiKeyService.list(p);

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-1">API Keys</h2>
      <p className="text-sm text-slate-600 mb-4">
        Organization API keys for machine-to-machine access. Send as{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">X-API-Key</code>. Only a Super Admin
        can create or revoke keys.
      </p>
      <ApiKeysManager keys={keys} />
    </Card>
  );
}
