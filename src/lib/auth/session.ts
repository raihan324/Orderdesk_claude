import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, contacts } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { Principal } from "./rbac";

export const SESSION_COOKIE = "od_principal";

type UserRow = typeof users.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;

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

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) throw new Error("UNAUTHENTICATED");
  return p;
}
