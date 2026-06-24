import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send, CheckCircle2, XCircle, Mail } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { invoiceService, effectiveInvoiceStatus, PAYMENT_METHODS } from "@/server/services/invoice.service";
import { issueInvoiceAction, recordInvoicePaymentAction, voidInvoiceAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";
import { INVOICE_STATUS_STYLE } from "@/lib/status-badges";
import { SendMailButton } from "@/components/send-mail-button";

export const dynamic = "force-dynamic";

const CONTACT_LABEL: Record<string, string> = {
  OWNER: "Owner", DIRECTOR: "Director", MANAGER: "Manager", ACCOUNTS: "Accounts",
  TECHNICAL: "Technical", PROCUREMENT: "Procurement", PRIMARY: "Primary", OTHER: "Other",
};

export default async function InvoiceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ issued?: string }>;
}) {
  const { id } = await params;
  const { issued } = await searchParams;
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind !== "INTERNAL") redirect("/dashboard");

  const data = await invoiceService.detail(p, id);
  if (!data) notFound();
  const { invoice, items, client, payments, recipientEmail, contacts } = data;
  const mayManage = can(p, "invoice.manage", { ownerSalesRepId: client?.salesRepId });
  const effStatus = effectiveInvoiceStatus(invoice);
  const balanceCents = invoice.totalCents - invoice.amountPaidCents;
  const canPay = invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID";

  // Client contacts offered in the "To" dropdown of the email composer.
  const mailRecipients = contacts
    .filter((c) => c.email)
    .map((c) => ({
      email: c.email,
      name: c.name,
      label: `${c.name} · ${CONTACT_LABEL[c.type] ?? c.type} — ${c.email}`,
    }));

  // Record-level merge fields the user can drop into the email.
  const mailVariables = [
    { key: "invoice.number", label: "Invoice number", value: invoice.invoiceNumber },
    { key: "invoice.total", label: "Invoice total", value: formatCents(invoice.totalCents, invoice.currency) },
    { key: "invoice.balance", label: "Balance due", value: formatCents(balanceCents, invoice.currency) },
    { key: "invoice.status", label: "Status", value: effStatus.replace("_", " ") },
    { key: "invoice.dueDate", label: "Due date", value: invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—" },
    { key: "invoice.issueDate", label: "Issue date", value: invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "—" },
    { key: "client.name", label: "Client name", value: client?.name ?? "" },
  ];

  return (
    <AppShell principal={p}>
      <Link href="/invoices" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to invoices
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="font-mono text-xl font-semibold tracking-tight">{invoice.invoiceNumber}</h1>
        <Badge className={INVOICE_STATUS_STYLE[effStatus]}>{effStatus.replace("_", " ")}</Badge>
        {mayManage && (
          <div className="ml-auto">
            <SendMailButton
              to={recipientEmail ?? ""}
              subjectDefault={`Invoice ${invoice.invoiceNumber}`}
              label="Send mail"
              recipients={mailRecipients}
              variables={mailVariables}
            />
          </div>
        )}
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        {client?.name} · {formatCents(invoice.totalCents, invoice.currency)} total
        {balanceCents > 0 && invoice.status !== "DRAFT" && invoice.status !== "VOID" && (
          <span className="font-medium text-rose-600"> · {formatCents(balanceCents, invoice.currency)} due</span>
        )}
      </p>

      {issued === "emailed" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><Mail size={15} /> Invoice issued and emailed.</div>
      )}
      {issued === "no_email" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"><Mail size={15} /> Invoice issued, but no billing contact email was found to send it.</div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Line items</div>
          <Table>
            <THead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Unit</Th><Th className="text-right">Amount</Th></tr></THead>
            <TBody>
              {items.map((it) => (
                <tr key={it.id}>
                  <Td className="font-medium text-slate-900">{it.description}</Td>
                  <Td className="text-right">{it.quantity}</Td>
                  <Td className="text-right">{formatCents(it.unitPriceCents, invoice.currency)}</Td>
                  <Td className="text-right font-medium">{formatCents(it.lineTotalCents, invoice.currency)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
          <div className="border-t border-slate-100 px-5 py-3">
            <dl className="ml-auto max-w-xs space-y-1 text-sm">
              <Row k="Subtotal" v={formatCents(invoice.subtotalCents, invoice.currency)} />
              <Row k={`Tax (${(invoice.taxRateBps / 100).toFixed(2)}%)`} v={formatCents(invoice.taxCents, invoice.currency)} />
              <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold"><dt>Total</dt><dd>{formatCents(invoice.totalCents, invoice.currency)}</dd></div>
              <Row k="Paid" v={formatCents(invoice.amountPaidCents, invoice.currency)} />
              <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-rose-600"><dt>Balance due</dt><dd>{formatCents(balanceCents, invoice.currency)}</dd></div>
            </dl>
          </div>
        </Card>

        {/* Payments history */}
        {payments.length > 0 && (
          <Card className="overflow-hidden lg:col-span-3">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Payments ({payments.length})</div>
            <Table>
              <THead><tr><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></THead>
              <TBody>
                {payments.map((pay) => (
                  <tr key={pay.id}>
                    <Td className="text-slate-600">{new Date(pay.paidAt).toLocaleDateString()}</Td>
                    <Td>{pay.method.replace("_", " ")}</Td>
                    <Td className="text-slate-500">{pay.reference ?? "—"}</Td>
                    <Td className="text-right font-medium">{formatCents(pay.amountCents, invoice.currency)}</Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Details & actions</h3>
          <dl className="space-y-1.5 text-sm">
            <Row k="Status" v={invoice.status} />
            <Row k="Issued" v={invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "—"} />
            <Row k="Due" v={invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"} />
            <Row k="Paid" v={invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : "—"} />
          </dl>

          {mayManage && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {invoice.status === "DRAFT" && (
                <form action={issueInvoiceAction} className="space-y-2">
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <label className="block text-xs font-medium text-slate-600">Due date (optional)</label>
                  <input name="dueAt" type="date" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <Button type="submit" className="w-full justify-center"><Send size={14} /> Issue & email</Button>
                </form>
              )}

              {canPay && (
                <form action={recordInvoicePaymentAction} className="space-y-2">
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record payment</p>
                  <div className="flex gap-2">
                    <input name="amount" type="number" step="0.01" min="0" defaultValue={(balanceCents / 100).toFixed(2)} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                    <select name="method" defaultValue="BANK_TRANSFER" className="rounded-md border border-slate-200 px-2 py-2 text-sm">
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                    </select>
                  </div>
                  <input name="reference" placeholder="Reference (optional)" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <input name="paidAt" type="date" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  <Button type="submit" className="w-full justify-center"><CheckCircle2 size={14} /> Record payment</Button>
                  <p className="text-xs text-slate-400">Defaults to the full balance due. Enter a smaller amount for a partial payment.</p>
                </form>
              )}

              {invoice.status !== "PAID" && invoice.status !== "VOID" && (
                <form action={voidInvoiceAction}>
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <Button type="submit" variant="outline" className="w-full justify-center"><XCircle size={14} /> Void</Button>
                </form>
              )}
              {(invoice.status === "PAID" || invoice.status === "VOID") && (
                <p className="text-sm text-slate-500">No further actions — invoice is {invoice.status.toLowerCase()}.</p>
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
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="font-medium text-slate-800">{v}</dd>
    </div>
  );
}
