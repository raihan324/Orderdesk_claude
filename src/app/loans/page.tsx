import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Landmark } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { loanService } from "@/server/services/loan.service";
import { clientService } from "@/server/services/client.service";
import { createLoanAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { LOAN_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const [loans, clients, lenders] = await Promise.all([
    loanService.list(p),
    clientService.list(p),
    loanService.listLenders(),
  ]);
  const mayApply = can(p, "loan.manage", { ownerSalesRepId: p.kind === "INTERNAL" ? p.userId : null });
  const maySanction = can(p, "loan.sanction");

  return (
    <AppShell principal={p}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Loans</h1>
          <p className="mt-0.5 text-sm text-slate-500">Loan applications and their sanction status.</p>
        </div>
        {maySanction && (
          <Link href="/lenders" className="shrink-0">
            <Button variant="outline"><Landmark size={14} /> Manage lenders</Button>
          </Link>
        )}
      </div>

      {mayApply && (
        <Card className="mt-5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">New loan application</h3>
          <form action={createLoanAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Borrower</label>
              <select name="borrowerClientId" required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Lender (optional)</label>
              <select name="lenderId" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {lenders.filter((l) => l.isActive).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Amount</label>
              <input name="principal" type="number" step="0.01" min="0" required placeholder="50000" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tenure (months)</label>
              <input name="tenureMonths" type="number" min="1" required placeholder="24" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Interest rate (% / yr)</label>
              <input name="interestRatePct" type="number" step="0.01" min="0" required placeholder="12.5" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Purpose (optional)</label>
              <input name="purpose" placeholder="Working capital" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full justify-center sm:w-auto">Submit application</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead>
            <tr><Th>Borrower</Th><Th>Lender</Th><Th>Status</Th><Th className="text-right">Requested</Th><Th className="text-right">Sanctioned</Th><Th /></tr>
          </THead>
          <TBody>
            {loans.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/loans/${l.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{l.borrowerName}</Link>
                  <div className="text-xs text-slate-400">{l.tenureMonths} mo · {(l.interestRateBps / 100).toFixed(2)}%</div>
                </Td>
                <Td className="text-slate-600">{l.lenderName ?? <span className="text-slate-400">—</span>}</Td>
                <Td><Badge className={LOAN_STATUS_STYLE[l.status]}>{l.status.replace("_", " ")}</Badge></Td>
                <Td className="text-right">{formatCents(l.principalCents, l.currency)}</Td>
                <Td className="text-right">{l.sanctionedAmountCents != null ? formatCents(l.sanctionedAmountCents, l.currency) : <span className="text-slate-400">—</span>}</Td>
                <Td className="text-right"><Link href={`/loans/${l.id}`}><ChevronRight size={16} className="text-slate-300" /></Link></Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {loans.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-14 text-slate-400"><Landmark size={26} /><p className="text-sm">No loan applications yet.</p></div>
        )}
      </Card>
    </AppShell>
  );
}
