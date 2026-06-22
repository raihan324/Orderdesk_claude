import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { clients, contacts, orders, users } from "@/db/schema";
import { authorize, can, repScopeUserId, ForbiddenError, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import { sendPortalInviteEmail, isMailEnabled } from "@/server/mailer";

export const createClientInput = z.object({
  type: z.enum(["B2B", "B2C"]),
  name: z.string().min(1, "Name required").max(200),
  // B2B-only profile fields (ignored for B2C)
  industry: z.string().max(120).optional(),
  website: z.string().max(200).optional(),
  // optional rep assignment (elevated roles only)
  salesRepId: z.string().optional(),
});
export type CreateClientInput = z.infer<typeof createClientInput>;

export const contactTypes = [
  "OWNER", "DIRECTOR", "MANAGER", "ACCOUNTS",
  "TECHNICAL", "PROCUREMENT", "PRIMARY", "OTHER",
] as const;

export const addContactInput = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1, "Name required").max(200),
  email: z.string().email("Valid email required"),
  type: z.enum(contactTypes).default("OTHER"),
  jobTitle: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
});
export type AddContactInput = z.infer<typeof addContactInput>;

export const updateContactInput = z.object({
  contactId: z.string().min(1),
  name: z.string().min(1, "Name required").max(200),
  email: z.string().email("Valid email required"),
  type: z.enum(contactTypes),
  jobTitle: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  department: z.string().max(120).optional(),
  position: z.string().max(120).optional(),
  // portal permissions (only meaningful once the contact has portal access)
  canManageOrgSettings: z.boolean().default(false),
  canManagePortalUsers: z.boolean().default(false),
});
export type UpdateContactInput = z.infer<typeof updateContactInput>;

// Self-service fields a portal contact may edit about themselves. Deliberately
// excludes email (login identity), type, and portal permissions.
export const updateOwnContactInput = z.object({
  name: z.string().min(1, "Name required").max(200),
  phone: z.string().max(40).optional(),
  jobTitle: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  position: z.string().max(120).optional(),
  timezone: z.string().max(60).optional(),
  currency: z.string().max(10).optional(),
  language: z.string().max(20).optional(),
});
export type UpdateOwnContactInput = z.infer<typeof updateOwnContactInput>;

export const clientService = {
  /**
   * Create a B2B company or B2C individual. Managers/Admins may assign any rep
   * (or leave unassigned); a Sales Rep may create only self-owned clients.
   */
  async create(p: Principal, input: CreateClientInput) {
    if (p.kind !== "INTERNAL") throw new ForbiddenError("client.manage");
    const elevated = can(p, "salesrep.assign"); // ADMIN / MANAGER / SUPER_ADMIN
    if (!elevated && p.role !== "SALES_REP") throw new ForbiddenError("client.manage");

    // Reps can only create clients owned by themselves; elevated roles choose.
    const salesRepId = elevated ? input.salesRepId || null : p.userId;
    const isB2B = input.type === "B2B";

    const [row] = await db
      .insert(clients)
      .values({
        type: input.type,
        name: input.name,
        industry: isB2B ? input.industry || null : null,
        website: isB2B ? input.website || null : null,
        salesRepId,
      })
      .returning();

    await writeAudit(p, "client.created", "Client", row.id, { type: row.type, name: row.name });
    return row;
  },

  /** Internal listing, scoped to the rep's own clients when applicable. */
  async list(p: Principal) {
    // Self-ownership lets own-scoped roles (Sales Rep) clear the capability
    // check; repScopeUserId then restricts the returned rows to their clients.
    authorize(p, "client.read", { ownerSalesRepId: p.kind === "INTERNAL" ? p.userId : null });
    const repId = repScopeUserId(p, "client.read");
    const rows = await db
      .select()
      .from(clients)
      .where(repId ? eq(clients.salesRepId, repId) : undefined)
      .orderBy(desc(clients.createdAt));
    return rows;
  },

  async detail(p: Principal, clientId: string) {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!client) return null;
    // ownership-aware read check
    authorize(p, "client.read", { ownerSalesRepId: client.salesRepId });
    const [clientContacts, clientOrders] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.clientId, clientId)),
      db.select().from(orders).where(eq(orders.clientId, clientId)).orderBy(desc(orders.createdAt)),
    ]);
    const canManage = can(p, "client.manage", { ownerSalesRepId: client.salesRepId });
    const canAssign = can(p, "salesrep.assign");
    return { client, contacts: clientContacts, orders: clientOrders, canManage, canAssign };
  },

  /**
   * Add a contact to a client. Gated by contact.manage and the client's
   * ownership (a Sales Rep may only add to their own clients).
   */
  async addContact(p: Principal, input: AddContactInput) {
    const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
    if (!client) throw new Error("NOT_FOUND");
    authorize(p, "contact.manage", { ownerSalesRepId: client.salesRepId });

    const [row] = await db
      .insert(contacts)
      .values({
        clientId: input.clientId,
        name: input.name,
        email: input.email,
        type: input.type,
        jobTitle: input.jobTitle || null,
        phone: input.phone || null,
      })
      .returning();

    await writeAudit(p, "contact.created", "Contact", row.id, {
      email: row.email,
      clientId: input.clientId,
    });
    return row;
  },

  /**
   * Update a contact's details and portal permissions. Gated by contact.manage
   * and the parent client's ownership.
   */
  async updateContact(p: Principal, input: UpdateContactInput) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
    if (!contact) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, contact.clientId)).limit(1);
    if (!client) throw new Error("NOT_FOUND");
    authorize(p, "contact.manage", { ownerSalesRepId: client.salesRepId });

    const [row] = await db
      .update(contacts)
      .set({
        name: input.name,
        email: input.email,
        type: input.type,
        jobTitle: input.jobTitle || null,
        phone: input.phone || null,
        department: input.department || null,
        position: input.position || null,
        // permissions only apply to portal-enabled contacts
        canManageOrgSettings: contact.hasPortalAccess ? input.canManageOrgSettings : false,
        canManagePortalUsers: contact.hasPortalAccess ? input.canManagePortalUsers : false,
      })
      .where(eq(contacts.id, input.contactId))
      .returning();

    await writeAudit(p, "contact.updated", "Contact", row.id, { email: row.email });
    return row;
  },

  /**
   * Portal self-service: a contact updates their own profile. The WHERE clause
   * is pinned to p.contactId, so a contact can only ever edit themselves.
   */
  async updateOwnContact(p: Principal, input: UpdateOwnContactInput) {
    if (p.kind !== "PORTAL") throw new ForbiddenError("contact.manage");

    const [row] = await db
      .update(contacts)
      .set({
        name: input.name,
        phone: input.phone || null,
        jobTitle: input.jobTitle || null,
        department: input.department || null,
        position: input.position || null,
        timezoneOverride: input.timezone || null,
        currencyOverride: input.currency || null,
        languageOverride: input.language || null,
      })
      .where(eq(contacts.id, p.contactId))
      .returning();

    await writeAudit(p, "contact.self_updated", "Contact", row.id, {});
    return row;
  },

  /** Full detail for a single contact, scoped by its parent client's ownership. */
  async contactDetail(p: Principal, contactId: string) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) return null;
    const [client] = await db.select().from(clients).where(eq(clients.id, contact.clientId)).limit(1);
    if (!client) return null;
    authorize(p, "client.read", { ownerSalesRepId: client.salesRepId });
    const canManage = can(p, "client.manage", { ownerSalesRepId: client.salesRepId });
    return { contact, client, canManage };
  },

  async reps() {
    return db.select().from(users).where(eq(users.role, "SALES_REP"));
  },

  async assignRep(p: Principal, clientId: string, repId: string | null) {
    authorize(p, "salesrep.assign");
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!client) throw new Error("NOT_FOUND");
    await db.update(clients).set({ salesRepId: repId }).where(eq(clients.id, clientId));
    await writeAudit(p, "salesrep.assigned", "Client", clientId, { repId });
  },

  async inviteContact(p: Principal, contactId: string): Promise<{ emailed: boolean }> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, contact.clientId)).limit(1);
    authorize(p, "portal.invite", { ownerSalesRepId: client?.salesRepId });
    await db
      .update(contacts)
      .set({ hasPortalAccess: true, portalStatus: "INVITED" })
      .where(eq(contacts.id, contactId));
    await writeAudit(p, "portal.invited", "Contact", contactId, { email: contact.email });

    // Best-effort portal invite email — a delivery failure must not undo the invite.
    let emailed = false;
    if (isMailEnabled() || p.kind === "INTERNAL") {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await sendPortalInviteEmail({
          to: contact.email,
          name: contact.name,
          clientName: client?.name ?? "your account",
          signUpUrl: `${base}/sign-up`,
          userId: p.kind === "INTERNAL" ? p.userId : undefined,
        });
        emailed = true;
      } catch (err) {
        console.error("[portal-invite] email send failed:", err);
      }
    }
    return { emailed };
  },
};
