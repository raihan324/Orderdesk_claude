import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { affiliates, affiliateCommissions, orders } from "@/db/schema";
import { authorize, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import { randomBytes } from "node:crypto";

/* ----------------------------------------------------------------- inputs */
export const createAffiliateInput = z.object({
  name: z.string().min(1, "Name required").max(200),
  email: z.string().email("Valid email required"),
  // percent in; stored as basis points
  commissionRatePct: z.coerce.number().min(0).max(100).default(5),
});
export type CreateAffiliateInput = z.infer<typeof createAffiliateInput>;

export const updateAffiliateInput = z.object({
  affiliateId: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  commissionRatePct: z.coerce.number().min(0).max(100),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});
export type UpdateAffiliateInput = z.infer<typeof updateAffiliateInput>;

/** Human-friendly unique referral code, e.g. "REF-7F3K9Q". */
function genReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return `REF-${code}`;
}

export const affiliateService = {
  async list(p: Principal) {
    authorize(p, "affiliate.read");
    // Aggregate earnings per affiliate (paid + approved + pending, excl. reversed).
    const rows = await db
      .select({
        id: affiliates.id,
        name: affiliates.name,
        email: affiliates.email,
        referralCode: affiliates.referralCode,
        commissionRateBps: affiliates.commissionRateBps,
        status: affiliates.status,
        createdAt: affiliates.createdAt,
        earnedCents: sql<number>`coalesce(sum(case when ${affiliateCommissions.status} <> 'REVERSED' then ${affiliateCommissions.commissionCents} else 0 end), 0)`,
        orderCount: sql<number>`count(${affiliateCommissions.id})`,
      })
      .from(affiliates)
      .leftJoin(affiliateCommissions, eq(affiliateCommissions.affiliateId, affiliates.id))
      .groupBy(affiliates.id)
      .orderBy(desc(affiliates.createdAt));
    return rows;
  },

  async detail(p: Principal, affiliateId: string) {
    authorize(p, "affiliate.read");
    const [affiliate] = await db.select().from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1);
    if (!affiliate) return null;
    const commissions = await db
      .select({
        id: affiliateCommissions.id,
        orderId: affiliateCommissions.orderId,
        orderNumber: orders.orderNumber,
        orderTotalCents: affiliateCommissions.orderTotalCents,
        commissionRateBps: affiliateCommissions.commissionRateBps,
        commissionCents: affiliateCommissions.commissionCents,
        currency: affiliateCommissions.currency,
        status: affiliateCommissions.status,
        createdAt: affiliateCommissions.createdAt,
      })
      .from(affiliateCommissions)
      .leftJoin(orders, eq(affiliateCommissions.orderId, orders.id))
      .where(eq(affiliateCommissions.affiliateId, affiliateId))
      .orderBy(desc(affiliateCommissions.createdAt));
    return { affiliate, commissions };
  },

  async create(p: Principal, input: CreateAffiliateInput) {
    authorize(p, "affiliate.manage");
    // Retry on the rare referral-code collision (unique constraint).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [row] = await db
          .insert(affiliates)
          .values({
            name: input.name,
            email: input.email,
            referralCode: genReferralCode(),
            commissionRateBps: Math.round(input.commissionRatePct * 100),
          })
          .returning();
        await writeAudit(p, "affiliate.created", "Affiliate", row.id, { code: row.referralCode });
        return row;
      } catch (err) {
        if (attempt === 4) throw err;
      }
    }
    throw new Error("AFFILIATE_CREATE_FAILED");
  },

  async update(p: Principal, input: UpdateAffiliateInput) {
    authorize(p, "affiliate.manage");
    const [row] = await db
      .update(affiliates)
      .set({
        name: input.name,
        email: input.email,
        commissionRateBps: Math.round(input.commissionRatePct * 100),
        status: input.status,
      })
      .where(eq(affiliates.id, input.affiliateId))
      .returning();
    if (!row) throw new Error("NOT_FOUND");
    await writeAudit(p, "affiliate.updated", "Affiliate", row.id, { status: row.status });
    return row;
  },

  /* ----------------------------------------------------------- commissions */
  async listCommissions(p: Principal) {
    authorize(p, "affiliate.read");
    return db
      .select({
        id: affiliateCommissions.id,
        affiliateId: affiliateCommissions.affiliateId,
        affiliateName: affiliates.name,
        orderId: affiliateCommissions.orderId,
        orderNumber: orders.orderNumber,
        commissionCents: affiliateCommissions.commissionCents,
        currency: affiliateCommissions.currency,
        status: affiliateCommissions.status,
        createdAt: affiliateCommissions.createdAt,
      })
      .from(affiliateCommissions)
      .innerJoin(affiliates, eq(affiliateCommissions.affiliateId, affiliates.id))
      .leftJoin(orders, eq(affiliateCommissions.orderId, orders.id))
      .orderBy(desc(affiliateCommissions.createdAt));
  },

  async setCommissionStatus(
    p: Principal,
    commissionId: string,
    status: "APPROVED" | "PAID" | "REVERSED",
  ) {
    authorize(p, "commission.manage");
    const [row] = await db
      .update(affiliateCommissions)
      .set({ status })
      .where(eq(affiliateCommissions.id, commissionId))
      .returning();
    if (!row) throw new Error("NOT_FOUND");
    await writeAudit(p, "commission.status_changed", "Commission", row.id, { status });
    return row;
  },

  /**
   * Attribute an order to an affiliate by referral code and record a PENDING
   * commission. Called inside order.create's transaction. No-op for an unknown
   * or suspended code. Returns the affiliateId to stamp on the order, or null.
   */
  async attributeOrder(
    tx: PgTransaction<any, any, any>,
    orderId: string,
    referralCode: string,
    orderTotalCents: number,
    currency: string,
  ): Promise<string | null> {
    const code = referralCode.trim().toUpperCase();
    if (!code) return null;
    const [affiliate] = await tx
      .select()
      .from(affiliates)
      .where(eq(affiliates.referralCode, code))
      .limit(1);
    if (!affiliate || affiliate.status !== "ACTIVE") return null;

    const commissionCents = Math.round((orderTotalCents * affiliate.commissionRateBps) / 10_000);
    await tx.insert(affiliateCommissions).values({
      affiliateId: affiliate.id,
      orderId,
      orderTotalCents,
      commissionRateBps: affiliate.commissionRateBps,
      commissionCents,
      currency,
    });
    return affiliate.id;
  },
};
