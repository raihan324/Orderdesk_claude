import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Receipt, Check, BadgeDollarSign, Undo2 } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { affiliateService } from "@/server/services/affiliate.service";
import { setCommissionStatusAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { COMMISSION_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (!can(p, "affiliate.read")) redirect("/dashboard");

  const commissions = await affiliateService.listCommissions(p);
  const mayManage = can(p, "commission.manage");

  const pending = commissions
    .filter((c) => c.status === "PENDING" || c.status === "APPROVED")
    .reduce((sum, c) => sum + c.commissionCents, 0);

  return (
    <AppShell principal={p}>
      <Link href="/affiliates" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to affiliates
      </Link>
      <div className="flex items-center gap-2">
        <Receipt size={20} />
        <h1 className="text-xl font-semibold tracking-tight">Commission payouts</h1>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        {formatCents(pending)} outstanding across pending and approved commissions.
      </p>

      <Card className="mt-5 overflow-hidden">
        <Table>
          <THead>
            <tr><Th>Affiliate</Th><Th>Order</Th><Th className="text-right">Commission</Th><Th>Status</Th><Th>Date</Th>{mayManage && <Th className="text-right">Actions</Th>}</tr>
          </THead>
          <TBody>
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/affiliates/${c.affiliateId}`} className="font-medium text-slate-900 hover:text-indigo-600">{c.affiliateName}</Link>
                </Td>
                <Td className="text-slate-600">{c.orderNumber ?? "—"}</Td>
                <Td className="text-right font-medium">{formatCents(c.commissionCents, c.currency)}</Td>
                <Td><Badge className={COMMISSION_STATUS_STYLE[c.status]}>{c.status}</Badge></Td>
                <Td className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</Td>
                {mayManage && (
                  <Td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {c.status === "PENDING" && (
                        <StatusButton commissionId={c.id} status="APPROVED" label="Approve" icon={<Check size={13} />} />
                      )}
                      {c.status === "APPROVED" && (
                        <StatusButton commissionId={c.id} status="PAID" label="Mark paid" icon={<BadgeDollarSign size={13} />} />
                      )}
                      {(c.status === "PENDING" || c.status === "APPROVED") && (
                        <StatusButton commissionId={c.id} status="REVERSED" label="Reverse" icon={<Undo2 size={13} />} variant="outline" />
                      )}
                      {(c.status === "PAID" || c.status === "REVERSED") && (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
        {commissions.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No commissions yet.</p>}
      </Card>
    </AppShell>
  );
}

function StatusButton({
  commissionId,
  status,
  label,
  icon,
  variant,
}: {
  commissionId: string;
  status: string;
  label: string;
  icon: React.ReactNode;
  variant?: "outline";
}) {
  return (
    <form action={setCommissionStatusAction}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={variant}>{icon} {label}</Button>
    </form>
  );
}
