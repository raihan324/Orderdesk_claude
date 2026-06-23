import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, Banknote } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button } from "@/components/ui";
import { loanService, emiCents } from "@/server/services/loan.service";
import { sanctionLoanAction, rejectLoanAction, disburseLoanAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { LOAN_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function LoanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const data = await loanService.detail(p, id);
  if (!data) notFound();
  const { loan, borrower, lender } = data;
  const lenders = await loanService.listLenders();
  const maySanction = can(p, "loan.sanction");

  const ratePct = (loan.interestRateBps / 100).toFixed(2);
  const isOpen = loan.status === "APPLIED" || loan.status === "UNDER_REVIEW";
  const emi =
    loan.status === "SANCTIONED" || loan.status === "DISBURSED" || loan.status === "CLOSED"
      ? emiCents(loan.sanctionedAmountCents ?? loan.principalCents, loan.interestRateBps, loan.tenureMonths)
      : null;

  return (
    <AppShell principal={p}>
      <Link href="/loans" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to loans
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{borrower?.name ?? "Loan"}</h1>
        <Badge className={LOAN_STATUS_STYLE[loan.status]}>{loan.status.replace("_", " ")}</Badge>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        {formatCents(loan.principalCents, loan.currency)} requested · {loan.tenureMonths} months · {ratePct}% / yr
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Loan details</h3>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Borrower" v={borrower?.name ?? "—"} />
            <Row k="Lender" v={lender?.name ?? "Unassigned"} />
            <Row k="Requested amount" v={formatCents(loan.principalCents, loan.currency)} />
            <Row k="Sanctioned amount" v={loan.sanctionedAmountCents != null ? formatCents(loan.sanctionedAmountCents, loan.currency) : "—"} />
            <Row k="Tenure" v={`${loan.tenureMonths} months`} />
            <Row k="Interest rate" v={`${ratePct}% / yr`} />
            <Row k="Est. monthly payment" v={emi != null ? formatCents(emi, loan.currency) : "—"} />
            <Row k="Purpose" v={loan.purpose ?? "—"} />
          </dl>
          {loan.status === "REJECTED" && loan.rejectionReason && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              Rejected: {loan.rejectionReason}
            </div>
          )}
        </Card>

        {/* Actions */}
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Sanction</h3>
          {!maySanction ? (
            <p className="text-sm text-slate-500">Only Finance / Admin can sanction loans.</p>
          ) : (
            <div className="space-y-4">
              {isOpen && (
                <form action={sanctionLoanAction} className="space-y-2">
                  <input type="hidden" name="loanId" value={loan.id} />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Lender</label>
                    <select name="lenderId" defaultValue={loan.lenderId ?? ""} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <option value="">Unassigned</option>
                      {lenders.filter((l) => l.isActive).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Sanctioned amount</label>
                    <input name="sanctionedAmount" type="number" step="0.01" min="0" defaultValue={(loan.principalCents / 100).toString()} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Rate (%/yr)</label>
                      <input name="interestRatePct" type="number" step="0.01" min="0" defaultValue={ratePct} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Tenure (mo)</label>
                      <input name="tenureMonths" type="number" min="1" defaultValue={loan.tenureMonths} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full justify-center"><CheckCircle2 size={15} /> Sanction</Button>
                </form>
              )}

              {isOpen && (
                <form action={rejectLoanAction} className="space-y-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="loanId" value={loan.id} />
                  <input name="reason" placeholder="Rejection reason" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <Button type="submit" variant="outline" className="w-full justify-center"><XCircle size={15} /> Reject</Button>
                </form>
              )}

              {loan.status === "SANCTIONED" && (
                <form action={disburseLoanAction}>
                  <input type="hidden" name="loanId" value={loan.id} />
                  <Button type="submit" className="w-full justify-center"><Banknote size={15} /> Mark disbursed</Button>
                </form>
              )}

              {(loan.status === "DISBURSED" || loan.status === "CLOSED" || loan.status === "REJECTED") && (
                <p className="text-sm text-slate-500">No further actions — loan is {loan.status.toLowerCase()}.</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}
