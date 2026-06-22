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
      actorId: actor ? ("userId" in actor ? actor.userId : actor.contactId) : null,
      actorType: actor ? (actor.kind === "INTERNAL" ? "USER" : "CONTACT") : "SYSTEM",
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
