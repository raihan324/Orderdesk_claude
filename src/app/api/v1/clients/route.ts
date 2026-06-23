import { type NextRequest } from "next/server";
import { authenticate, handle, readJson, ok } from "@/server/api/http";
import { clientService, createClientInput } from "@/server/services/client.service";

export const dynamic = "force-dynamic";

// GET /api/v1/clients — list clients in scope (requires client.read).
export const GET = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const data = await clientService.list(p);
  return ok({ data });
});

// POST /api/v1/clients — create a client (requires client.manage / self for reps).
export const POST = handle(async (req: NextRequest) => {
  const p = await authenticate(req);
  const input = createClientInput.parse(await readJson(req));
  const client = await clientService.create(p, input);
  return ok(client, 201);
});
