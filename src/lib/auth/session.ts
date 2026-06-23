import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, contacts, lenders, affiliates } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { Principal } from "./rbac";

export const SESSION_COOKIE = "od_principal";

type UserRow = typeof users.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
type LenderRow = typeof lenders.$inferSelect;
type AffiliateRow = typeof affiliates.$inferSelect;

/**
 * Resolve the current principal (internal User or portal Contact).
 *   AUTH_MODE=clerk -> Clerk verified identity
 *   AUTH_MODE=dev   -> local "login-as" cookie (no external service)
 * Everything downstream (services, RBAC, pages) is identical in both modes.
 */
export async function getPrincipal(): Promise<Principal | null> {
  return process.env.AUTH_MODE === "clerk" ? getClerkPrincipal() : getDevPrincipal();
}

/* -------------------------------------------------------------- dev mode */
async function getDevPrincipal(): Promise<Principal | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [kind, id] = raw.split(":");
  if (!id) return null;

  if (kind === "INTERNAL") {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return u && u.status !== "SUSPENDED" ? toUserPrincipal(u) : null;
  }
  if (kind === "LENDER") {
    const [l] = await db.select().from(lenders).where(eq(lenders.id, id)).limit(1);
    return l && l.hasPortalAccess && l.portalStatus !== "SUSPENDED" ? toLenderPrincipal(l) : null;
  }
  if (kind === "AFFILIATE") {
    const [a] = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
    return a && a.hasPortalAccess && a.portalStatus !== "SUSPENDED" ? toAffiliatePrincipal(a) : null;
  }
  const [c] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return c && c.hasPortalAccess && c.portalStatus !== "SUSPENDED" ? toContactPrincipal(c) : null;
}

/* ------------------------------------------------------------ clerk mode */
async function getClerkPrincipal(): Promise<Principal | null> {
  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) return null;

  // 1) Already linked: match by stored Clerk id.
  const [u1] = await db.select().from(users).where(eq(users.authProviderId, userId)).limit(1);
  if (u1 && u1.status !== "SUSPENDED") return toUserPrincipal(u1);
  const [c1] = await db.select().from(contacts).where(eq(contacts.authProviderId, userId)).limit(1);
  if (c1 && c1.hasPortalAccess && c1.portalStatus !== "SUSPENDED") return toContactPrincipal(c1);
  const [l1] = await db.select().from(lenders).where(eq(lenders.authProviderId, userId)).limit(1);
  if (l1 && l1.hasPortalAccess && l1.portalStatus !== "SUSPENDED") return toLenderPrincipal(l1);
  const [a1] = await db.select().from(affiliates).where(eq(affiliates.authProviderId, userId)).limit(1);
  if (a1 && a1.hasPortalAccess && a1.portalStatus !== "SUSPENDED") return toAffiliatePrincipal(a1);

  // 2) First login: link by Clerk's VERIFIED primary email. Secure because
  //    Clerk has already proven ownership of that address (PRD FR-55/56).
  const cu = await currentUser();
  const email = cu?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return null;

  const [u2] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (u2 && u2.status !== "SUSPENDED") {
    // Link the Clerk identity and activate an invited account on first sign-in.
    await db
      .update(users)
      .set({ authProviderId: userId, status: u2.status === "INVITED" ? "ACTIVE" : u2.status })
      .where(eq(users.id, u2.id));
    return toUserPrincipal({ ...u2, status: u2.status === "INVITED" ? "ACTIVE" : u2.status });
  }
  const [c2] = await db.select().from(contacts).where(eq(contacts.email, email)).limit(1);
  if (c2 && c2.hasPortalAccess && c2.portalStatus !== "SUSPENDED") {
    await db.update(contacts).set({ authProviderId: userId }).where(eq(contacts.id, c2.id));
    return toContactPrincipal(c2);
  }

  // Lender portal: link by the lender's verified contact email and activate the invite.
  const [l2] = await db.select().from(lenders).where(eq(lenders.contactEmail, email)).limit(1);
  if (l2 && l2.hasPortalAccess && l2.portalStatus !== "SUSPENDED") {
    const nextStatus = l2.portalStatus === "INVITED" ? "ACTIVE" : l2.portalStatus;
    await db.update(lenders).set({ authProviderId: userId, portalStatus: nextStatus }).where(eq(lenders.id, l2.id));
    return toLenderPrincipal({ ...l2, portalStatus: nextStatus });
  }

  // Affiliate portal: link by the affiliate's verified email and activate the invite.
  const [a2] = await db.select().from(affiliates).where(eq(affiliates.email, email)).limit(1);
  if (a2 && a2.hasPortalAccess && a2.portalStatus !== "SUSPENDED") {
    const nextStatus = a2.portalStatus === "INVITED" ? "ACTIVE" : a2.portalStatus;
    await db.update(affiliates).set({ authProviderId: userId, portalStatus: nextStatus }).where(eq(affiliates.id, a2.id));
    return toAffiliatePrincipal({ ...a2, portalStatus: nextStatus });
  }

  // 3) No matching record -> self-service provisioning. The configured ADMIN_EMAIL
  //    becomes ADMIN; everyone else becomes MANAGER — the minimal internal role that
  //    can create orders for any client. Creating products stays reserved to
  //    ADMIN/SUPER_ADMIN (see rbac.ts). Safe to grant on a Clerk-VERIFIED email only.
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const role = email === adminEmail ? "ADMIN" : "MANAGER";
  const name =
    [cu?.firstName, cu?.lastName].filter(Boolean).join(" ").trim() ||
    cu?.username ||
    email.split("@")[0];

  // Tolerate a race where a concurrent first request inserted the same email.
  const [inserted] = await db
    .insert(users)
    .values({ authProviderId: userId, email, name, role, status: "ACTIVE" })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const provisioned =
    inserted ?? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!provisioned || provisioned.status === "SUSPENDED") return null;
  if (!provisioned.authProviderId) {
    await db.update(users).set({ authProviderId: userId }).where(eq(users.id, provisioned.id));
  }

  const principal = toUserPrincipal(provisioned);
  if (inserted) await writeAudit(principal, "user.provisioned", "User", provisioned.id, { email, role });
  return principal;
}

/* ----------------------------------------------------------------- maps */
function toUserPrincipal(u: UserRow): Principal {
  return { kind: "INTERNAL", userId: u.id, role: u.role, name: u.name };
}
function toContactPrincipal(c: ContactRow): Principal {
  return {
    kind: "PORTAL",
    contactId: c.id,
    clientId: c.clientId,
    name: c.name,
    canManageOrgSettings: c.canManageOrgSettings,
    canManagePortalUsers: c.canManagePortalUsers,
  };
}
function toLenderPrincipal(l: LenderRow): Principal {
  return { kind: "LENDER", lenderId: l.id, name: l.name };
}
function toAffiliatePrincipal(a: AffiliateRow): Principal {
  return { kind: "AFFILIATE", affiliateId: a.id, name: a.name };
}

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) throw new Error("UNAUTHENTICATED");
  return p;
}
