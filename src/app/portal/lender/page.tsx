import { redirect } from "next/navigation";
import Link from "next/link";
import { Landmark, LogOut, UserCog } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { Card, Table, THead, TBody, Th, Td, Badge } from "@/components/ui";
import { ClerkSignOutButton } from "@/components/sign-out-button";
import { loanService } from "@/server/services/loan.service";
import { LenderPortalForm } from "@/components/lender-portal-form";
import { formatCents } from "@/lib/utils";
import { LOAN_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function LenderPortal() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "INTERNAL") redirect("/dashboard");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");

  const [lender, loans] = await Promise.all([
    loanService.getOwnLender(p),
    loanService.listForLender(p),
  ]);
  if (!lender) redirect("/sign-in");

  const isClerk = process.env.AUTH_MODE === "clerk";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-white"><Landmark size={18} /></div>
            <div>
              <p className="text-sm font-semibold tracking-tight">{lender.name}</p>
              <p className="text-xs text-slate-500">Lender Portal</p>
            </div>
          </div>
          {isClerk ? (
            <ClerkSignOutButton />
          ) : (
            <Link href="/api/dev-auth?signout=1" className="rounded-md p-2 text-slate-400 hover:bg-slate-100" title="Sign out"><LogOut size={16} /></Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Hello, {p.name.split(" ")[0]}</h1>
        <p className="mt-0.5 text-sm text-slate-500">Loans assigned to you. This view is read-only.</p>

        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"><Landmark size={15} /> My Loans</div>
          <Table>
            <THead><tr><Th>Borrower</Th><Th>Status</Th><Th className="text-right">Requested</Th><Th className="text-right">Sanctioned</Th><Th>Terms</Th></tr></THead>
            <TBody>
              {loans.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{l.borrowerName}</Td>
                  <Td><Badge className={LOAN_STATUS_STYLE[l.status]}>{l.status.replace("_", " ")}</Badge></Td>
                  <Td className="text-right">{formatCents(l.principalCents, l.currency)}</Td>
                  <Td className="text-right">{l.sanctionedAmountCents != null ? formatCents(l.sanctionedAmountCents, l.currency) : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-slate-500">{l.tenureMonths} mo · {(l.interestRateBps / 100).toFixed(2)}%</Td>
                </tr>
              ))}
            </TBody>
          </Table>
          {loans.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No loans assigned to you yet.</p>}
        </Card>

        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"><UserCog size={15} /> My details</div>
          <div className="p-5">
            <LenderPortalForm lender={{ name: lender.name, contactEmail: lender.contactEmail, contactPhone: lender.contactPhone }} />
          </div>
        </Card>
      </main>
    </div>
  );
}
