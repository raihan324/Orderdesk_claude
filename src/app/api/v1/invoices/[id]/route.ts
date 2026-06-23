import { type NextRequest } from "next/server";
import { authenticate, handle, ApiError, ok } from "@/server/api/http";
import { invoiceService } from "@/server/services/invoice.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/invoices/{id} — invoice with items, client, and order.
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const p = await authenticate(req);
  const { id } = await params;
  const data = await invoiceService.detail(p, id);
  if (!data) throw new ApiError(404, "NOT_FOUND", "Invoice not found");
  return ok(data);
});
