import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { Principal } from "@/lib/auth/rbac";

export async function writeAudit(
  actor: Principal | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: actor ? actorIdOf(actor) : null,
      actorType: actor ? actorTypeOf(actor) : "SYSTEM",
      actorName: actor?.name ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] failed:", action, err);
  }
}

function actorIdOf(a: Principal): string {
  if (a.kind === "INTERNAL") return a.userId;
  if (a.kind === "PORTAL") return a.contactId;
  if (a.kind === "LENDER") return a.lenderId;
  if (a.kind === "AFFILIATE") return a.affiliateId;
  return a.apiKeyId; // SERVICE
}

function actorTypeOf(a: Principal): string {
  if (a.kind === "INTERNAL") return "USER";
  if (a.kind === "PORTAL") return "CONTACT";
  return a.kind; // "LENDER" | "AFFILIATE"
}
