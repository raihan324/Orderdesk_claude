import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Users2, Receipt } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { affiliateService } from "@/server/services/affiliate.service";
import { createAffiliateAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { AFFILIATE_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function AffiliatesPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (!can(p, "affiliate.read")) redirect("/dashboard");

  const affiliates = await affiliateService.list(p);
  const mayManage = can(p, "affiliate.manage");
  const mayPayouts = can(p, "commission.manage");

  return (
    <AppShell principal={p}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Affiliates</h1>
          <p className="mt-0.5 text-sm text-slate-500">Referral partners and the commissions they earn.</p>
        </div>
        {mayPayouts && (
          <Link href="/commissions" className="shrink-0">
            <Button variant="outline"><Receipt size={14} /> Payout queue</Button>
          </Link>
        )}
      </div>

      {mayManage && (
        <Card className="mt-5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">New affiliate</h3>
          <form action={createAffiliateAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input name="name" required placeholder="Affiliate name" className="rounded-md border border-slate-200 px-3 py-2 text-sm lg:col-span-2" />
            <input name="email" type="email" required placeholder="email@partner.com" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input name="commissionRatePct" type="number" step="0.01" min="0" max="100" defaultValue="5" placeholder="Rate %" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <Button type="submit" className="justify-center sm:col-span-2 lg:col-span-1">Create</Button>
          </form>
          <p className="mt-2 text-xs text-slate-400">A unique referral code is generated automatically.</p>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead>
            <tr><Th>Affiliate</Th><Th>Referral code</Th><Th>Rate</Th><Th className="text-right">Orders</Th><Th className="text-right">Earned</Th><Th>Status</Th><Th /></tr>
          </THead>
          <TBody>
            {affiliates.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/affiliates/${a.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{a.name}</Link>
                  <div className="text-xs text-slate-400">{a.email}</div>
                </Td>
                <Td><span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{a.referralCode}</span></Td>
                <Td className="text-slate-600">{(a.commissionRateBps / 100).toFixed(2)}%</Td>
                <Td className="text-right">{Number(a.orderCount)}</Td>
                <Td className="text-right font-medium">{formatCents(Number(a.earnedCents))}</Td>
                <Td><Badge className={AFFILIATE_STATUS_STYLE[a.status]}>{a.status}</Badge></Td>
                <Td className="text-right"><Link href={`/affiliates/${a.id}`}><ChevronRight size={16} className="text-slate-300" /></Link></Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {affiliates.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-14 text-slate-400"><Users2 size={26} /><p className="text-sm">No affiliates yet.</p></div>
        )}
      </Card>
    </AppShell>
  );
}
