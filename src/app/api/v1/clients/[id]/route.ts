import { type NextRequest } from "next/server";
import { authenticate, handle, ApiError, ok } from "@/server/api/http";
import { clientService } from "@/server/services/client.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/clients/{id} — client detail with contacts, orders, capability flags.
export const GET = handle<Ctx>(async (req: NextRequest, { params }) => {
  const p = await authenticate(req);
  const { id } = await params;
  const data = await clientService.detail(p, id);
  if (!data) throw new ApiError(404, "NOT_FOUND", "Client not found");
  return ok(data);
});
