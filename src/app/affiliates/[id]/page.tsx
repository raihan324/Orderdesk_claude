import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { affiliateService } from "@/server/services/affiliate.service";
import { updateAffiliateAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { AFFILIATE_STATUS_STYLE, COMMISSION_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function AffiliateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (!can(p, "affiliate.read")) redirect("/dashboard");

  const data = await affiliateService.detail(p, id);
  if (!data) notFound();
  const { affiliate, commissions } = data;
  const mayManage = can(p, "affiliate.manage");

  const earned = commissions
    .filter((c) => c.status !== "REVERSED")
    .reduce((sum, c) => sum + c.commissionCents, 0);
  const paid = commissions
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + c.commissionCents, 0);

  return (
    <AppShell principal={p}>
      <Link href="/affiliates" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to affiliates
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{affiliate.name}</h1>
        <Badge className={AFFILIATE_STATUS_STYLE[affiliate.status]}>{affiliate.status}</Badge>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        {affiliate.email} · code <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{affiliate.referralCode}</span>
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total earned</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCents(earned)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Paid out</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{formatCents(paid)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{formatCents(earned - paid)}</p>
        </Card>
      </div>

      {mayManage && (
        <Card className="mt-4 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Edit affiliate</h3>
          <form action={updateAffiliateAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="affiliateId" value={affiliate.id} />
            <input name="name" required defaultValue={affiliate.name} className="rounded-md border border-slate-200 px-3 py-2 text-sm lg:col-span-2" />
            <input name="email" type="email" required defaultValue={affiliate.email} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input name="commissionRatePct" type="number" step="0.01" min="0" max="100" defaultValue={(affiliate.commissionRateBps / 100).toString()} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <select name="status" defaultValue={affiliate.status} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <Button type="submit" className="justify-center lg:col-span-1">Save changes</Button>
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3"><h3 className="text-sm font-semibold text-slate-700">Commissions ({commissions.length})</h3></div>
        <Table>
          <THead><tr><Th>Order</Th><Th>Order total</Th><Th>Rate</Th><Th className="text-right">Commission</Th><Th>Status</Th><Th>Date</Th></tr></THead>
          <TBody>
            {commissions.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{c.orderNumber ?? "—"}</Td>
                <Td>{formatCents(c.orderTotalCents, c.currency)}</Td>
                <Td className="text-slate-600">{(c.commissionRateBps / 100).toFixed(2)}%</Td>
                <Td className="text-right font-medium">{formatCents(c.commissionCents, c.currency)}</Td>
                <Td><Badge className={COMMISSION_STATUS_STYLE[c.status]}>{c.status}</Badge></Td>
                <Td className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {commissions.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No commissions yet.</p>}
      </Card>
    </AppShell>
  );
}
