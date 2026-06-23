import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge } from "@/components/ui";
import { invoiceService, effectiveInvoiceStatus } from "@/server/services/invoice.service";
import { formatCents } from "@/lib/utils";
import { INVOICE_STATUS_STYLE } from "@/lib/status-badges";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");
  if (p.kind === "SERVICE") redirect("/sign-in");
  if (!can(p, "invoice.read")) redirect("/dashboard");

  const invoices = await invoiceService.list(p);

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Invoices</h1>
      <p className="mt-0.5 text-sm text-slate-500">Generated from orders. Create an invoice from the Orders page.</p>

      <Card className="mt-5 overflow-hidden">
        <Table>
          <THead>
            <tr><Th>Invoice</Th><Th>Client</Th><Th>Order</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th /></tr>
          </THead>
          <TBody>
            {invoices.map((inv) => {
              const eff = effectiveInvoiceStatus(inv);
              const balance = inv.totalCents - inv.amountPaidCents;
              return (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/invoices/${inv.id}`} className="font-mono text-xs font-medium text-slate-900 hover:text-indigo-600">{inv.invoiceNumber}</Link>
                    <div className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</div>
                  </Td>
                  <Td>{inv.clientName}</Td>
                  <Td className="font-mono text-xs text-slate-500">{inv.orderNumber}</Td>
                  <Td><Badge className={INVOICE_STATUS_STYLE[eff]}>{eff.replace("_", " ")}</Badge></Td>
                  <Td className="text-right font-medium">{formatCents(inv.totalCents, inv.currency)}</Td>
                  <Td className="text-right">{balance > 0 ? formatCents(balance, inv.currency) : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-right"><Link href={`/invoices/${inv.id}`}><ChevronRight size={16} className="text-slate-300" /></Link></Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
        {invoices.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-14 text-slate-400"><FileText size={26} /><p className="text-sm">No invoices yet.</p></div>
        )}
      </Card>
    </AppShell>
  );
}
