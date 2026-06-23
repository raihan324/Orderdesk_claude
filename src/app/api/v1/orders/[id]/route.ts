import { type NextRequest } from "next/server";
import { authenticate, handle, ApiError, ok } from "@/server/api/http";
import { orderService } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/orders/{id} — order with its line items.
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const p = await authenticate(req);
  const { id } = await params;
  const data = await orderService.detail(p, id);
  if (!data) throw new ApiError(404, "NOT_FOUND", "Order not found");
  return ok(data);
});
