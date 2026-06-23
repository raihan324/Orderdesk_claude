import { type NextRequest } from "next/server";
import { authenticate, handle, readJson, ok } from "@/server/api/http";
import { orderService, createOrderInput } from "@/server/services/order.service";

export const dynamic = "force-dynamic";

// GET /api/v1/orders — list orders in scope (requires order.read).
export const GET = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const data = await orderService.list(p);
  return ok({ data });
});

// POST /api/v1/orders — create an order; server prices from the live catalog.
export const POST = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const input = createOrderInput.parse(await readJson(req));
  const order = await orderService.create(p, input);
  return ok(order, 201);
});
