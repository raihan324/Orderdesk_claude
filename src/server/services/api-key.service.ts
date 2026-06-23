import "server-only";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { authorize, type Principal, type InternalRole } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";

const ROLES = [
  "SUPER_ADMIN", "ADMIN", "MANAGER", "SALES_REP",
  "SUPPORT_AGENT", "FINANCE_USER", "STAFF",
] as const;

export const createApiKeyInput = z.object({
  name: z.string().min(1, "Name required").max(120),
  role: z.enum(ROLES).default("ADMIN"),
  // optional expiry as an ISO date (yyyy-mm-dd or full ISO); empty = never
  expiresAt: z.string().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInput>;

export type ApiKeyDTO = {
  id: string;
  name: string;
  role: InternalRole;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Generate a key: prefix is stored clear, secret is hashed. Plaintext shown once. */
function generate(): { keyPrefix: string; secret: string; plaintext: string; secretHash: string } {
  const env = process.env.NODE_ENV === "production" ? "live" : "test";
  const keyPrefix = `odk_${env}_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(24).toString("hex"); // 48 hex chars
  return { keyPrefix, secret, plaintext: `${keyPrefix}.${secret}`, secretHash: sha256(secret) };
}

function toDTO(row: typeof apiKeys.$inferSelect): ApiKeyDTO {
  const { secretHash, createdByUserId, ...rest } = row;
  return { ...rest, role: rest.role as InternalRole };
}

export const apiKeyService = {
  async list(p: Principal): Promise<ApiKeyDTO[]> {
    authorize(p, "apikey.manage");
    const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
    return rows.map(toDTO);
  },

  /** Create a key. Returns the metadata DTO plus the one-time plaintext. */
  async create(p: Principal, input: CreateApiKeyInput): Promise<{ key: ApiKeyDTO; plaintext: string }> {
    authorize(p, "apikey.manage");
    if (p.kind !== "INTERNAL") throw new Error("FORBIDDEN");

    const { keyPrefix, plaintext, secretHash } = generate();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    const [row] = await db
      .insert(apiKeys)
      .values({
        name: input.name,
        role: input.role,
        keyPrefix,
        secretHash,
        createdByUserId: p.userId,
        expiresAt,
      })
      .returning();

    await writeAudit(p, "apikey.created", "ApiKey", row.id, { name: row.name, role: row.role });
    return { key: toDTO(row), plaintext };
  },

  /** Rotate: new secret for the same key id; old secret immediately invalid. */
  async rotate(p: Principal, id: string): Promise<{ key: ApiKeyDTO; plaintext: string }> {
    authorize(p, "apikey.manage");
    const { keyPrefix, plaintext, secretHash } = generate();
    const [row] = await db
      .update(apiKeys)
      .set({ keyPrefix, secretHash, revokedAt: null })
      .where(eq(apiKeys.id, id))
      .returning();
    if (!row) throw new Error("NOT_FOUND");
    await writeAudit(p, "apikey.rotated", "ApiKey", row.id, {});
    return { key: toDTO(row), plaintext };
  },

  async revoke(p: Principal, id: string): Promise<void> {
    authorize(p, "apikey.manage");
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    if (!row) throw new Error("NOT_FOUND");
    await writeAudit(p, "apikey.revoked", "ApiKey", row.id, {});
  },

  /**
   * Resolve a raw `X-API-Key` header into an organization SERVICE principal.
   * Returns null if unknown / revoked / expired / bad secret. No auth (this IS auth).
   */
  async resolve(raw: string): Promise<Principal | null> {
    const dot = raw.indexOf(".");
    if (dot < 0) return null;
    const keyPrefix = raw.slice(0, dot);
    const secret = raw.slice(dot + 1);
    if (!keyPrefix || !secret) return null;

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, keyPrefix)).limit(1);
    if (!row || row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    // Constant-time comparison of the hashed secret.
    const provided = Buffer.from(sha256(secret), "hex");
    const stored = Buffer.from(row.secretHash, "hex");
    if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) return null;

    // Fire-and-forget last-used stamp.
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id)).catch(() => {});

    return { kind: "SERVICE", apiKeyId: row.id, role: row.role as InternalRole, name: `API: ${row.name}` };
  },
};
