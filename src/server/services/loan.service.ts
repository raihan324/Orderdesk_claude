import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { loans, lenders, clients } from "@/db/schema";
import { authorize, repScopeUserId, ForbiddenError, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";

/* ----------------------------------------------------------------- inputs */
export const createLoanInput = z.object({
  borrowerClientId: z.string().min(1, "Borrower required"),
  lenderId: z.string().optional(),
  // dollars in; stored as integer cents
  principal: z.coerce.number().positive("Amount must be positive"),
  currency: z.string().min(1).max(10).default("USD"),
  purpose: z.string().max(500).optional(),
  tenureMonths: z.coerce.number().int().positive().max(600),
  // percent in; stored as basis points
  interestRatePct: z.coerce.number().min(0).max(100),
});
export type CreateLoanInput = z.infer<typeof createLoanInput>;

export const sanctionLoanInput = z.object({
  loanId: z.string().min(1),
  lenderId: z.string().optional(),
  sanctionedAmount: z.coerce.number().positive(),
  interestRatePct: z.coerce.number().min(0).max(100),
  tenureMonths: z.coerce.number().int().positive().max(600),
});
export type SanctionLoanInput = z.infer<typeof sanctionLoanInput>;

export const createLenderInput = z.object({
  name: z.string().min(1, "Name required").max(200),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
});
export type CreateLenderInput = z.infer<typeof createLenderInput>;

// Lender portal self-service (excludes status / portal flags).
export const updateOwnLenderInput = z.object({
  name: z.string().min(1, "Name required").max(200),
  contactEmail: z.string().email("Valid email required").optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
});
export type UpdateOwnLenderInput = z.infer<typeof updateOwnLenderInput>;

/* -------------------------------------------------------------- EMI helper */
/** Amortized monthly payment in cents for a sanctioned loan. */
export function emiCents(principalCents: number, annualRateBps: number, months: number): number {
  if (months <= 0) return principalCents;
  const monthlyRate = annualRateBps / 10_000 / 12;
  if (monthlyRate === 0) return Math.round(principalCents / months);
  const factor = Math.pow(1 + monthlyRate, months);
  return Math.round((principalCents * monthlyRate * factor) / (factor - 1));
}

/* ---------------------------------------------------------------- service */
function requireInternal(p: Principal): asserts p is Extract<Principal, { kind: "INTERNAL" }> {
  if (p.kind !== "INTERNAL") throw new ForbiddenError("loan.manage");
}

export const loanService = {
  async list(p: Principal) {
    // Self-ownership clears the own-scoped capability check; rows then filtered.
    authorize(p, "loan.read", { ownerSalesRepId: p.kind === "INTERNAL" ? p.userId : null });
    const ownId = repScopeUserId(p, "loan.read");
    const rows = await db
      .select({
        id: loans.id,
        status: loans.status,
        principalCents: loans.principalCents,
        sanctionedAmountCents: loans.sanctionedAmountCents,
        currency: loans.currency,
        tenureMonths: loans.tenureMonths,
        interestRateBps: loans.interestRateBps,
        createdAt: loans.createdAt,
        borrowerName: clients.name,
        borrowerClientId: loans.borrowerClientId,
        lenderName: lenders.name,
      })
      .from(loans)
      .innerJoin(clients, eq(loans.borrowerClientId, clients.id))
      .leftJoin(lenders, eq(loans.lenderId, lenders.id))
      .where(ownId ? eq(loans.createdByUserId, ownId) : undefined)
      .orderBy(desc(loans.createdAt));
    return rows;
  },

  async detail(p: Principal, loanId: string) {
    const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
    if (!loan) return null;
    // own-scope for loans means "created by me"
    authorize(p, "loan.read", { ownerSalesRepId: loan.createdByUserId });
    const [borrower] = await db.select().from(clients).where(eq(clients.id, loan.borrowerClientId)).limit(1);
    const lender = loan.lenderId
      ? (await db.select().from(lenders).where(eq(lenders.id, loan.lenderId)).limit(1))[0]
      : null;
    return { loan, borrower, lender };
  },

  async createApplication(p: Principal, input: CreateLoanInput) {
    requireInternal(p);
    authorize(p, "loan.manage", { ownerSalesRepId: p.userId });
    const [row] = await db
      .insert(loans)
      .values({
        borrowerClientId: input.borrowerClientId,
        lenderId: input.lenderId || null,
        principalCents: Math.round(input.principal * 100),
        currency: input.currency,
        purpose: input.purpose || null,
        tenureMonths: input.tenureMonths,
        interestRateBps: Math.round(input.interestRatePct * 100),
        status: "APPLIED",
        createdByUserId: p.userId,
      })
      .returning();
    await writeAudit(p, "loan.applied", "Loan", row.id, {
      borrowerClientId: row.borrowerClientId,
      principalCents: row.principalCents,
    });
    return row;
  },

  /** Move APPLIED -> UNDER_REVIEW (optionally assigning a lender). */
  async startReview(p: Principal, loanId: string, lenderId?: string) {
    authorize(p, "loan.sanction");
    const loan = await loadFor(loanId);
    if (loan.status !== "APPLIED") throw new Error("INVALID_TRANSITION");
    await db
      .update(loans)
      .set({ status: "UNDER_REVIEW", lenderId: lenderId || loan.lenderId, updatedAt: new Date() })
      .where(eq(loans.id, loanId));
    await writeAudit(p, "loan.review_started", "Loan", loanId, {});
  },

  async sanction(p: Principal, input: SanctionLoanInput) {
    authorize(p, "loan.sanction");
    requireInternal(p);
    const loan = await loadFor(input.loanId);
    if (loan.status !== "APPLIED" && loan.status !== "UNDER_REVIEW") {
      throw new Error("INVALID_TRANSITION");
    }
    const [row] = await db
      .update(loans)
      .set({
        status: "SANCTIONED",
        lenderId: input.lenderId || loan.lenderId,
        sanctionedAmountCents: Math.round(input.sanctionedAmount * 100),
        interestRateBps: Math.round(input.interestRatePct * 100),
        tenureMonths: input.tenureMonths,
        sanctionedAt: new Date(),
        sanctionedByUserId: p.userId,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, input.loanId))
      .returning();
    await writeAudit(p, "loan.sanctioned", "Loan", row.id, {
      sanctionedAmountCents: row.sanctionedAmountCents,
    });
    return row;
  },

  async reject(p: Principal, loanId: string, reason: string) {
    authorize(p, "loan.sanction");
    const loan = await loadFor(loanId);
    if (loan.status === "DISBURSED" || loan.status === "CLOSED") throw new Error("INVALID_TRANSITION");
    await db
      .update(loans)
      .set({ status: "REJECTED", rejectionReason: reason || "Not specified", updatedAt: new Date() })
      .where(eq(loans.id, loanId));
    await writeAudit(p, "loan.rejected", "Loan", loanId, { reason });
  },

  async disburse(p: Principal, loanId: string) {
    authorize(p, "loan.sanction");
    const loan = await loadFor(loanId);
    if (loan.status !== "SANCTIONED") throw new Error("INVALID_TRANSITION");
    await db
      .update(loans)
      .set({ status: "DISBURSED", disbursedAt: new Date(), updatedAt: new Date() })
      .where(eq(loans.id, loanId));
    await writeAudit(p, "loan.disbursed", "Loan", loanId, {});
  },

  async close(p: Principal, loanId: string) {
    authorize(p, "loan.sanction");
    const loan = await loadFor(loanId);
    if (loan.status !== "DISBURSED") throw new Error("INVALID_TRANSITION");
    await db.update(loans).set({ status: "CLOSED", updatedAt: new Date() }).where(eq(loans.id, loanId));
    await writeAudit(p, "loan.closed", "Loan", loanId, {});
  },

  /* ------------------------------------------------- lender portal (self) */
  /** Loans assigned to the signed-in lender (read-only). */
  async listForLender(p: Principal) {
    if (p.kind !== "LENDER") throw new ForbiddenError("loan.read");
    authorize(p, "loan.read", { ownerLenderId: p.lenderId });
    return db
      .select({
        id: loans.id,
        status: loans.status,
        principalCents: loans.principalCents,
        sanctionedAmountCents: loans.sanctionedAmountCents,
        currency: loans.currency,
        tenureMonths: loans.tenureMonths,
        interestRateBps: loans.interestRateBps,
        createdAt: loans.createdAt,
        borrowerName: clients.name,
      })
      .from(loans)
      .innerJoin(clients, eq(loans.borrowerClientId, clients.id))
      .where(eq(loans.lenderId, p.lenderId))
      .orderBy(desc(loans.createdAt));
  },

  async getOwnLender(p: Principal) {
    if (p.kind !== "LENDER") throw new ForbiddenError("loan.read");
    const [row] = await db.select().from(lenders).where(eq(lenders.id, p.lenderId)).limit(1);
    return row ?? null;
  },

  async updateOwnLender(p: Principal, input: UpdateOwnLenderInput) {
    if (p.kind !== "LENDER") throw new ForbiddenError("loan.read");
    const [row] = await db
      .update(lenders)
      .set({
        name: input.name,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
      })
      .where(eq(lenders.id, p.lenderId))
      .returning();
    await writeAudit(p, "lender.self_updated", "Lender", row.id, {});
    return row;
  },

  /* ------------------------------------------------------------- lenders */
  async listLenders() {
    return db.select().from(lenders).orderBy(desc(lenders.createdAt));
  },

  /**
   * Invite a lender to the lender portal: requires a contact email, flags
   * portal access, and returns the lender so the caller can send the email.
   */
  async invitePortal(p: Principal, lenderId: string) {
    authorize(p, "loan.sanction");
    const [lender] = await db.select().from(lenders).where(eq(lenders.id, lenderId)).limit(1);
    if (!lender) throw new Error("NOT_FOUND");
    if (!lender.contactEmail) throw new Error("LENDER_EMAIL_REQUIRED");
    await db
      .update(lenders)
      .set({ hasPortalAccess: true, portalStatus: "INVITED" })
      .where(eq(lenders.id, lenderId));
    await writeAudit(p, "lender.portal_invited", "Lender", lenderId, { email: lender.contactEmail });
    return lender;
  },

  async createLender(p: Principal, input: CreateLenderInput) {
    authorize(p, "loan.sanction"); // lender registry managed by finance/admin
    const [row] = await db
      .insert(lenders)
      .values({
        name: input.name,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
      })
      .returning();
    await writeAudit(p, "lender.created", "Lender", row.id, { name: row.name });
    return row;
  },
};

async function loadFor(loanId: string) {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId)).limit(1);
  if (!loan) throw new Error("NOT_FOUND");
  return loan;
}
