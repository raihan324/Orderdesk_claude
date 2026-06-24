import { redirect } from "next/navigation";
import { UserCog } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { Card, Table, THead, TBody, Th, Td, Badge } from "@/components/ui";
import { PortalShell } from "@/components/portal-shell";
import { affiliateService } from "@/server/services/affiliate.service";
import { AffiliatePortalForm } from "@/components/affiliate-portal-form";
import { formatCents } from "@/lib/utils";
import { COMMISSION_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function AffiliatePortal({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "INTERNAL") redirect("/dashboard");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");

  const data = await affiliateService.selfDetail(p);
  if (!data) redirect("/sign-in");
  const { affiliate, commissions } = data;

  const earned = commissions.filter((c) => c.status !== "REVERSED").reduce((s, c) => s + c.commissionCents, 0);
  const paid = commissions.filter((c) => c.status === "PAID").reduce((s, c) => s + c.commissionCents, 0);
  const section = (await searchParams).section ?? "summary";

  const TITLE: Record<string, string> = { summary: "Dashboard", commissions: "Commissions", details: "My details" };

  return (
    <PortalShell
      brandLabel="Affiliate Portal"
      title={affiliate.name}
      userName={p.name}
      nav={[
        { href: "/portal/affiliate?section=summary", label: "Dashboard", icon: "dashboard" },
        { href: "/portal/affiliate?section=commissions", label: "Commissions", icon: "commissions" },
        { href: "/portal/affiliate?section=details", label: "My Details", icon: "details" },
      ]}
    >
      <h1 className="text-xl font-semibold tracking-tight">{TITLE[section] ?? "Dashboard"}</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Your referral code: <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{affiliate.referralCode}</span>
        {" "}· {(affiliate.commissionRateBps / 100).toFixed(2)}% commission
      </p>

      <div className="mt-5 space-y-4">
        {section === "summary" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total earned</p><p className="mt-1 text-2xl font-semibold">{formatCents(earned)}</p></Card>
            <Card className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Paid out</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{formatCents(paid)}</p></Card>
            <Card className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding</p><p className="mt-1 text-2xl font-semibold text-amber-700">{formatCents(earned - paid)}</p></Card>
          </div>
        )}

        {section === "commissions" && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">My Commissions ({commissions.length})</div>
            <Table>
              <THead><tr><Th>Order</Th><Th className="text-right">Order total</Th><Th className="text-right">Commission</Th><Th>Status</Th><Th>Date</Th></tr></THead>
              <TBody>
                {commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{c.orderNumber ?? "—"}</Td>
                    <Td className="text-right">{formatCents(c.orderTotalCents, c.currency)}</Td>
                    <Td className="text-right font-medium">{formatCents(c.commissionCents, c.currency)}</Td>
                    <Td><Badge className={COMMISSION_STATUS_STYLE[c.status]}>{c.status}</Badge></Td>
                    <Td className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
            {commissions.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No commissions yet.</p>}
          </Card>
        )}

        {section === "details" && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"><UserCog size={15} /> My details</div>
            <div className="p-5">
              <AffiliatePortalForm affiliate={{ name: affiliate.name, email: affiliate.email }} />
            </div>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
