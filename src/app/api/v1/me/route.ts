import { NextResponse, type NextRequest } from "next/server";
import { apiKeyService } from "@/server/services/api-key.service";

export const dynamic = "force-dynamic";

/**
 * Sample authenticated REST endpoint. Demonstrates organization API-key auth:
 * send `X-API-Key: odk_<env>_<id>.<secret>` and it returns the resolved
 * organization SERVICE principal. Wire `apiKeyService.resolve` + the existing
 * `authorize()` into real /api/v1 resources the same way.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Provide an X-API-Key header" } },
      { status: 401 },
    );
  }

  const principal = await apiKeyService.resolve(apiKey);
  if (!principal) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Invalid, expired, or revoked API key" } },
      { status: 401 },
    );
  }

  return NextResponse.json({ principal });
}
