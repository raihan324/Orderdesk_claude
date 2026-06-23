import { type NextRequest } from "next/server";
import { authenticate, handle, readJson, ok } from "@/server/api/http";
import { productService, createProductInput } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

// GET /api/v1/products — list the active catalog (requires product.read).
export const GET = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const data = await productService.list(p);
  return ok({ data });
});

// POST /api/v1/products — create a product (requires product.manage).
export const POST = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const input = createProductInput.parse(await readJson(req));
  const product = await productService.create(p, input);
  return ok(product, 201);
});
