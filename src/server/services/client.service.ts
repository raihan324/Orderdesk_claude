import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { clients, contacts, orders, users } from "@/db/schema";
import { authorize, can, repScopeUserId, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";

export const clientService = {
  /** Internal listing, scoped to the rep's own clients when applicable. */
  async list(p: Principal) {
    authorize(p, "client.read");
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

  async inviteContact(p: Principal, contactId: string) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    if (!contact) throw new Error("NOT_FOUND");
    const [client] = await db.select().from(clients).where(eq(clients.id, contact.clientId)).limit(1);
    authorize(p, "portal.invite", { ownerSalesRepId: client?.salesRepId });
    await db
      .update(contacts)
      .set({ hasPortalAccess: true, portalStatus: "INVITED" })
      .where(eq(contacts.id, contactId));
    await writeAudit(p, "portal.invited", "Contact", contactId, { email: contact.email });
  },
};
