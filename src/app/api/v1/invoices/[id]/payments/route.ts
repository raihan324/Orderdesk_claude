import { type NextRequest } from "next/server";
import { authenticate, handle, readJson, ok } from "@/server/api/http";
import { invoiceService, recordPaymentInput } from "@/server/services/invoice.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/invoices/{id}/payments — record a (full/partial) payment.
// Body: { amount, method?, reference?, paidAt?, note? }
export const POST = handle<Ctx>(async (req: NextRequest, { params }) => {
  const p = await authenticate(req);
  const { id } = await params;
  const body = (await readJson(req)) as Record<string, unknown>;
  const input = recordPaymentInput.parse({ ...body, invoiceId: id });
  const result = await invoiceService.recordPayment(p, input);
  return ok(result, 201);
});
