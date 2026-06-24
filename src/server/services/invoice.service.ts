import "server-only";
import { z } from "zod";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  invoices,
  invoiceItems,
  invoicePayments,
  orders,
  orderItems,
  products,
  clients,
  contacts,
} from "@/db/schema";
import { authorize, repScopeUserId, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import { createId } from "@/lib/id";
import { sendInvoiceEmail } from "@/server/mailer";

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "PAYPAL", "OTHER"] as const;

export const recordPaymentInput = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be positive"), // major units → cents
  method: z.enum(PAYMENT_METHODS).default("BANK_TRANSFER"),
  reference: z.string().max(120).optional(),
  paidAt: z.string().optional(),
  note: z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInput>;

/**
 * Display status incl. derived OVERDUE (an issued/partly-paid invoice past its
 * due date with a balance). OVERDUE is computed, never persisted.
 */
export function effectiveInvoiceStatus(inv: {
  status: string;
  dueAt: Date | null;
  totalCents: number;
  amountPaidCents: number;
}): string {
  const balance = inv.totalCents - inv.amountPaidCents;
  const open = inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID";
  if (open && inv.dueAt && inv.dueAt.getTime() < Date.now() && balance > 0) return "OVERDUE";
  return inv.status;
}

export const createInvoiceInput = z.object({
  orderId: z.string().min(1, "Order required"),
  notes: z.string().max(1000).optional(),
  dueAt: z.string().optional(), // ISO date; optional at draft time
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceInput>;

export const issueInvoiceInput = z.object({
  invoiceId: z.string().min(1),
  dueAt: z.string().optional(),
});
export type IssueInvoiceInput = z.infer<typeof issueInvoiceInput>;

/** Pick the best billing recipient for a client (Accounts → Primary → Owner → any). */
async function billingEmail(clientId: string): Promise<{ email: string; name: string } | null> {
  const rows = await db.select().from(contacts).where(eq(contacts.clientId, clientId));
  if (rows.length === 0) return null;
  const order = ["ACCOUNTS", "PRIMARY", "OWNER", "DIRECTOR"];
  const sorted = [...rows].sort(
    (a, b) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b.type) + 1 || 99),
  );
  const pick = sorted[0];
  return pick.email ? { email: pick.email, name: pick.name } : null;
}

export const invoiceService = {
  async list(p: Principal) {
    authorize(p, "invoice.read", { ownerSalesRepId: p.kind === "INTERNAL" ? p.userId : null });
    const repId = repScopeUserId(p, "invoice.read");
    let clientIds: string[] | null = null;
    if (repId) {
      const mine = await db.select({ id: clients.id }).from(clients).where(eq(clients.salesRepId, repId));
      clientIds = mine.map((c) => c.id);
      if (clientIds.length === 0) return [];
    }
    return db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        clientName: clients.name,
        orderNumber: orders.orderNumber,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        currency: invoices.currency,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .innerJoin(orders, eq(invoices.orderId, orders.id))
      .where(clientIds ? inArray(invoices.clientId, clientIds) : undefined)
      .orderBy(desc(invoices.createdAt));
  },

  async detail(p: Principal, invoiceId: string) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) return null;
    const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
    authorize(p, "invoice.read", { ownerSalesRepId: client?.salesRepId });
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    const [order] = await db.select().from(orders).where(eq(orders.id, invoice.orderId)).limit(1);
    const payments = await db
      .select()
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, invoiceId))
      .orderBy(desc(invoicePayments.paidAt));
    const recipient = await billingEmail(invoice.clientId);
    const clientContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.clientId, invoice.clientId));
    return {
      invoice,
      items,
      client,
      order,
      payments,
      recipientEmail: recipient?.email ?? null,
      contacts: clientContacts,
    };
  },

  /** Snapshot an order into a new DRAFT invoice with tax from the client default. */
  async createFromOrder(p: Principal, input: CreateInvoiceInput) {
    const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId)).limit(1);
    if (!client) throw new Error("NOT_FOUND");
    authorize(p, "invoice.manage", { ownerSalesRepId: client.salesRepId });

    const lines = await db
      .select({
        productId: orderItems.productId,
        name: products.name,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, order.id));

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const taxRateBps = client.defaultTaxRate ?? 0;
    const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
    const totalCents = subtotalCents + taxCents;
    const invoiceNumber = "INV-" + new Date().getFullYear() + "-" + createId().slice(-6).toUpperCase();

    const created = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          orderId: order.id,
          clientId: client.id,
          currency: order.currency,
          subtotalCents,
          taxRateBps,
          taxCents,
          totalCents,
          status: "DRAFT",
          notes: input.notes || null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          createdByUserId: p.kind === "INTERNAL" ? p.userId : null,
        })
        .returning();
      if (lines.length > 0) {
        await tx.insert(invoiceItems).values(
          lines.map((l) => ({
            invoiceId: inv.id,
            productId: l.productId,
            description: l.name,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            lineTotalCents: l.lineTotalCents,
          })),
        );
      }
      return inv;
    });

    await writeAudit(p, "invoice.created", "Invoice", created.id, {
      invoiceNumber,
      orderId: order.id,
      totalCents,
    });
    return created;
  },

  /** DRAFT → ISSUED, set due date, and email the invoice (best-effort). */
  async issue(p: Principal, input: IssueInvoiceInput): Promise<{ emailed: boolean }> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!invoice) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
    authorize(p, "invoice.manage", { ownerSalesRepId: client?.salesRepId });
    if (invoice.status !== "DRAFT") throw new Error("INVALID_TRANSITION");

    await db
      .update(invoices)
      .set({
        status: "ISSUED",
        issuedAt: new Date(),
        dueAt: input.dueAt ? new Date(input.dueAt) : invoice.dueAt,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));
    await writeAudit(p, "invoice.issued", "Invoice", invoice.id, {});

    let emailed = false;
    try {
      const recipient = await billingEmail(invoice.clientId);
      if (recipient) {
        const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
        await sendInvoiceEmail({
          to: recipient.email,
          recipientName: recipient.name,
          clientName: client?.name ?? "Customer",
          invoiceNumber: invoice.invoiceNumber,
          currency: invoice.currency,
          subtotalCents: invoice.subtotalCents,
          taxCents: invoice.taxCents,
          totalCents: invoice.totalCents,
          dueAt: input.dueAt ? new Date(input.dueAt) : invoice.dueAt,
          items: items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            lineTotalCents: i.lineTotalCents,
          })),
          userId: p.kind === "INTERNAL" ? p.userId : undefined,
        });
        emailed = true;
      }
    } catch (err) {
      console.error("[invoice] email failed:", err);
    }
    return { emailed };
  },

  /**
   * Record a (full or partial) payment. Advances the invoice to PARTIALLY_PAID
   * or PAID and reduces the balance. Only ISSUED / PARTIALLY_PAID invoices.
   */
  async recordPayment(p: Principal, input: RecordPaymentInput) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
    if (!invoice) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
    authorize(p, "invoice.manage", { ownerSalesRepId: client?.salesRepId });
    if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") {
      throw new Error("INVALID_TRANSITION"); // must be issued and not fully paid/void
    }

    const amountCents = Math.round(input.amount * 100);
    const balance = invoice.totalCents - invoice.amountPaidCents;
    if (amountCents <= 0) throw new Error("INVALID_AMOUNT");
    if (amountCents > balance) throw new Error("OVERPAYMENT"); // can't exceed balance due

    const newPaid = invoice.amountPaidCents + amountCents;
    const fullyPaid = newPaid >= invoice.totalCents;

    await db.transaction(async (tx) => {
      await tx.insert(invoicePayments).values({
        invoiceId: invoice.id,
        amountCents,
        method: input.method,
        reference: input.reference || null,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        note: input.note || null,
        recordedByUserId: p.kind === "INTERNAL" ? p.userId : null,
      });
      await tx
        .update(invoices)
        .set({
          amountPaidCents: newPaid,
          status: fullyPaid ? "PAID" : "PARTIALLY_PAID",
          paidAt: fullyPaid ? new Date() : invoice.paidAt,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));
    });

    await writeAudit(p, "invoice.payment_recorded", "Invoice", invoice.id, {
      amountCents,
      method: input.method,
      fullyPaid,
    });
    return { fullyPaid, balanceCents: invoice.totalCents - newPaid };
  },

  async voidInvoice(p: Principal, invoiceId: string) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, invoice.clientId)).limit(1);
    authorize(p, "invoice.manage", { ownerSalesRepId: client?.salesRepId });
    if (invoice.status === "PAID") throw new Error("INVALID_TRANSITION");
    await db.update(invoices).set({ status: "VOID", updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
    await writeAudit(p, "invoice.voided", "Invoice", invoiceId, {});
  },
};
