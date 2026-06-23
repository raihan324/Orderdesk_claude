import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Serves the OpenAPI spec (docs/api/openapi.yaml) as raw YAML for the Swagger UI
 * at /api-docs. Protected by middleware (requires a signed-in session in Clerk mode).
 */
export async function GET() {
  try {
    const file = path.join(process.cwd(), "docs", "api", "openapi.yaml");
    const yaml = await readFile(file, "utf8");
    return new NextResponse(yaml, {
      headers: { "content-type": "application/yaml; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "OpenAPI spec not found on server" }, { status: 404 });
  }
}
