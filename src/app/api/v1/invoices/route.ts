import { type NextRequest } from "next/server";
import { authenticate, handle, readJson, ok } from "@/server/api/http";
import { invoiceService, createInvoiceInput } from "@/server/services/invoice.service";

export const dynamic = "force-dynamic";

// GET /api/v1/invoices — list invoices in scope (requires invoice.read).
export const GET = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const data = await invoiceService.list(p);
  return ok({ data });
});

// POST /api/v1/invoices — create an invoice from an order (requires invoice.manage).
// Body: { orderId, notes?, dueAt? }
export const POST = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const input = createInvoiceInput.parse(await readJson(req));
  const invoice = await invoiceService.createFromOrder(p, input);
  return ok(invoice, 201);
});
