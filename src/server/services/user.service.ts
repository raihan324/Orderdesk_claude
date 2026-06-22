import { z } from "zod";
import { and, eq, ne, asc, count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authorize, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import { sendInviteEmail, isMailEnabled } from "@/server/mailer";

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "SALES_REP",
  "SUPPORT_AGENT",
  "FINANCE_USER",
  "STAFF",
] as const;
const STATUSES = ["ACTIVE", "INVITED", "PENDING", "SUSPENDED"] as const;

export const inviteUserInput = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  name: z.string().min(1).max(200),
  role: z.enum(ROLES),
});

export const updateUserRoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});
export const updateUserStatusInput = z.object({
  userId: z.string().min(1),
  status: z.enum(STATUSES),
});

export type UserDTO = {
  id: string;
  email: string;
  name: string;
  role: (typeof ROLES)[number];
  status: (typeof STATUSES)[number];
  linked: boolean;
  createdAt: Date;
};

/** Acting principal must be an internal user with user.manage (SUPER_ADMIN). */
function requireInternal(p: Principal): asserts p is Extract<Principal, { kind: "INTERNAL" }> {
  authorize(p, "user.manage");
  if (p.kind !== "INTERNAL") throw new Error("FORBIDDEN");
}

export const userService = {
  async list(p: Principal): Promise<UserDTO[]> {
    requireInternal(p);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        authProviderId: users.authProviderId,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.name));
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      status: r.status,
      linked: r.authProviderId != null,
      createdAt: r.createdAt,
    }));
  },

  /**
   * Invite a new internal user by email. Creates an INVITED record with no Clerk
   * link yet; when the person signs in via Clerk with this verified email, the
   * session layer links them to this row and they get the assigned role.
   */
  async invite(
    p: Principal,
    raw: unknown,
  ): Promise<{ user: UserDTO; emailed: boolean }> {
    requireInternal(p);
    const input = inviteUserInput.parse(raw);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) throw new Error("EMAIL_EXISTS");

    const [row] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role: input.role,
        status: "INVITED",
      })
      .returning();

    await writeAudit(p, "user.invited", "User", row.id, { email: row.email, role: row.role });

    // Best-effort notification: a delivery failure must not roll back the invite.
    let emailed = false;
    if (isMailEnabled()) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await sendInviteEmail({
          to: row.email,
          name: row.name,
          role: row.role,
          signInUrl: `${base}/sign-in`,
          userId: p.userId, // Use the inviter's SMTP settings if configured
        });
        emailed = true;
      } catch (err) {
        console.error("[invite] email send failed:", err);
      }
    }

    const user: UserDTO = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      linked: row.authProviderId != null,
      createdAt: row.createdAt,
    };
    return { user, emailed };
  },

  async updateRole(p: Principal, raw: unknown): Promise<void> {
    requireInternal(p);
    const input = updateUserRoleInput.parse(raw);
    // You cannot change your own role (prevents locking yourself out).
    if (input.userId === p.userId) throw new Error("CANNOT_CHANGE_OWN_ROLE");

    // Never leave the system without an active SUPER_ADMIN: if this change
    // demotes the last remaining one, refuse.
    const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(users)
        .where(and(eq(users.role, "SUPER_ADMIN"), ne(users.id, input.userId)));
      if (remaining === 0) throw new Error("LAST_SUPER_ADMIN");
    }

    await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
    await writeAudit(p, "user.role_changed", "User", input.userId, {
      from: target.role,
      to: input.role,
    });
  },

  async updateStatus(p: Principal, raw: unknown): Promise<void> {
    requireInternal(p);
    const input = updateUserStatusInput.parse(raw);
    if (input.userId === p.userId) throw new Error("CANNOT_SUSPEND_SELF");

    const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.role === "SUPER_ADMIN" && input.status === "SUSPENDED") {
      const [{ remaining }] = await db
        .select({ remaining: count() })
        .from(users)
        .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.status, "ACTIVE"), ne(users.id, input.userId)));
      if (remaining === 0) throw new Error("LAST_SUPER_ADMIN");
    }

    await db.update(users).set({ status: input.status }).where(eq(users.id, input.userId));
    await writeAudit(p, "user.status_changed", "User", input.userId, {
      from: target.status,
      to: input.status,
    });
  },
};
