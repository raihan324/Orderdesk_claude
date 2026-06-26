import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, type Principal } from "@/lib/auth/rbac";
import { getPrincipal } from "@/lib/auth/session";
import { apiKeyService } from "@/server/services/api-key.service";

/** Error with an explicit HTTP status + machine code. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * Resolve the request's principal. Prefers an `X-API-Key` (organization SERVICE
 * principal); otherwise falls back to the signed-in session (Clerk / dev cookie)
 * so first-party callers work too. Throws 401 if neither is present/valid.
 */
export async function authenticate(req: NextRequest): Promise<Principal> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    const p = await apiKeyService.resolve(apiKey);
    if (!p) throw new ApiError(401, "UNAUTHENTICATED", "Invalid, expired, or revoked API key");
    return p;
  }
  const p = await getPrincipal();
  if (!p) throw new ApiError(401, "UNAUTHENTICATED", "Provide an X-API-Key header or sign in");
  return p;
}

/** Parse a JSON body, mapping malformed JSON to a clean 400. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

function mapError(err: unknown): { status: number; body: unknown } {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  if (err instanceof ForbiddenError) {
    return { status: 403, body: { error: { code: "FORBIDDEN", message: err.message } } };
  }
  if (err instanceof ZodError) {
    return {
      status: 422,
      body: { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: err.issues } },
    };
  }
  const msg = err instanceof Error ? err.message : "Unexpected error";
  const known: Record<string, [number, string]> = {
    NOT_FOUND: [404, "NOT_FOUND"],
    CLIENT_NOT_FOUND: [404, "NOT_FOUND"],
    UNAUTHENTICATED: [401, "UNAUTHENTICATED"],
    FORBIDDEN: [403, "FORBIDDEN"],
    EMAIL_EXISTS: [409, "CONFLICT"],
    INVALID_TRANSITION: [409, "CONFLICT"],
    LAST_SUPER_ADMIN: [409, "CONFLICT"],
    LENDER_EMAIL_REQUIRED: [409, "CONFLICT"],
    OVERPAYMENT: [409, "CONFLICT"],
    INVALID_AMOUNT: [422, "VALIDATION_ERROR"],
    INVALID_SALES_REP: [422, "VALIDATION_ERROR"],
  };
  const hit = known[msg];
  if (hit) return { status: hit[0], body: { error: { code: hit[1], message: msg } } };
  if (msg.startsWith("INVALID_PRODUCT")) return { status: 409, body: { error: { code: "CONFLICT", message: msg } } };

  console.error("[api] unhandled error:", err);
  return { status: 500, body: { error: { code: "INTERNAL", message: "Internal server error" } } };
}

/** Wrap a route handler so thrown errors become the standard error envelope. */
export function handle<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const { status, body } = mapError(err);
      return NextResponse.json(body, { status });
    }
  };
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
