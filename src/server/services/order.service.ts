import { z } from "zod";
import { and, eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, products, clients } from "@/db/schema";
import { authorize, can, repScopeUserId, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import { createId } from "@/lib/id";
import { affiliateService } from "@/server/services/affiliate.service";

export const createOrderInput = z.object({
  clientId: z.string().min(1),
  affiliateCode: z.string().max(40).optional(), // optional referral attribution
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive().max(10_000),
      }),
    )
    .min(1),
});
export type CreateOrderInput = z.infer<typeof createOrderInput>;

async function ownershipForClient(clientId: string) {
  const [c] = await db
    .select({ salesRepId: clients.salesRepId, id: clients.id, currency: clients.currency })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return c;
}

export const orderService = {
  async list(p: Principal) {
    // A listing is allowed when the principal can read orders in *some* scope;
    // the query below restricts rows to that scope. Pass self-ownership so
    // own-scoped roles (Sales Rep) and portal contacts clear the capability
    // check instead of being treated as accessing an unowned resource.
    authorize(
      p,
      "order.read",
      p.kind === "PORTAL" ? { ownerClientId: p.clientId } : { ownerSalesRepId: p.userId },
    );
    const repId = repScopeUserId(p, "order.read");
    let scopedClientIds: string[] | null = null;
    if (repId) {
      const myClients = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.salesRepId, repId));
      scopedClientIds = myClients.map((c) => c.id);
      if (scopedClientIds.length === 0) return [];
    }
    if (p.kind === "PORTAL") scopedClientIds = [p.clientId];

    const rows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        clientId: orders.clientId,
        clientName: clients.name,
        status: orders.status,
        totalCents: orders.totalCents,
        currency: orders.currency,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .where(scopedClientIds ? inArray(orders.clientId, scopedClientIds) : undefined)
      .orderBy(desc(orders.createdAt));
    return rows;
  },

  async detail(p: Principal, orderId: string) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return null;
    const owner = await ownershipForClient(order.clientId);
    authorize(p, "order.read", {
      ownerSalesRepId: owner?.salesRepId,
      ownerClientId: order.clientId,
    });
    const items = await db
      .select({
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        lineTotalCents: orderItems.lineTotalCents,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));
    return { order, items };
  },

  /**
   * Create an order. ALL pricing is computed server-side from the current
   * catalog price — the client supplies only productId + quantity.
   */
  async create(p: Principal, input: CreateOrderInput) {
    const owner = await ownershipForClient(input.clientId);
    if (!owner) throw new Error("CLIENT_NOT_FOUND");
    authorize(p, "order.manage", {
      ownerSalesRepId: owner.salesRepId,
      ownerClientId: input.clientId,
    });

    const ids = input.items.map((i) => i.productId);
    const cat = await db.select().from(products).where(inArray(products.id, ids));
    const priceMap = new Map(cat.map((c) => [c.id, c]));

    let totalCents = 0;
    const lines = input.items.map((it) => {
      const prod = priceMap.get(it.productId);
      if (!prod || !prod.isActive) throw new Error(`INVALID_PRODUCT:${it.productId}`);
      const lineTotal = prod.unitPriceCents * it.quantity; // server price, never client
      totalCents += lineTotal;
      return {
        productId: it.productId,
        quantity: it.quantity,
        unitPriceCents: prod.unitPriceCents,
        lineTotalCents: lineTotal,
      };
    });

    const orderNumber = "ORD-" + new Date().getFullYear() + "-" + createId().slice(-6).toUpperCase();

    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          clientId: input.clientId,
          createdByUserId: p.kind === "INTERNAL" ? p.userId : null,
          createdByContactId: p.kind === "PORTAL" ? p.contactId : null,
          status: "SUBMITTED",
          currency: owner.currency,
          totalCents,
        })
        .returning();
      await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));

      // Optional affiliate attribution — records a PENDING commission and stamps
      // the order. No-op for an unknown/suspended code; never blocks the order.
      if (input.affiliateCode) {
        const affiliateId = await affiliateService.attributeOrder(
          tx,
          order.id,
          input.affiliateCode,
          totalCents,
          owner.currency,
        );
        if (affiliateId) {
          await tx.update(orders).set({ affiliateId }).where(eq(orders.id, order.id));
        }
      }
      return order;
    });

    await writeAudit(p, "order.created", "Order", created.id, {
      orderNumber,
      totalCents,
    });
    return created;
  },
};
