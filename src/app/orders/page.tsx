import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button, STATUS_STYLE } from "@/components/ui";
import { orderService } from "@/server/services/order.service";
import { clientService } from "@/server/services/client.service";
import { productService } from "@/server/services/product.service";
import { formatCents } from "@/lib/utils";
import { createOrderAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const [orders, clients, products] = await Promise.all([
    orderService.list(p),
    clientService.list(p),
    productService.list(p),
  ]);
  const mayCreate = can(p, "order.manage");

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        {p.role === "SALES_REP" ? "Orders for your assigned clients." : "All orders."}
      </p>

      {mayCreate && clients.length > 0 && (
        <Card className="mt-5 p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">New order</h3>
          <p className="mb-3 text-xs text-slate-400">Line totals are computed server-side from the catalog price — prices are never taken from the request.</p>
          <form action={createOrderAction} className="space-y-2">
            <select name="clientId" required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:w-72">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-2">
                <select name="productId" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <option value="">— select product —</option>
                  {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.name} ({formatCents(pr.unitPriceCents)})</option>)}
                </select>
                <input name="quantity" type="number" min={0} defaultValue={0} className="w-24 rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </div>
            ))}
            <input name="affiliateCode" placeholder="Referral code (optional, e.g. REF-7F3K9Q)" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:w-72" />
            <Button type="submit">Submit order</Button>
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead><tr><Th>Order</Th><Th>Client</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></THead>
          <TBody>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{o.orderNumber}</Td>
                <Td>{o.clientName}</Td>
                <Td><Badge className={STATUS_STYLE[o.status]}>{o.status}</Badge></Td>
                <Td className="text-right font-medium">{formatCents(o.totalCents, o.currency)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No orders in your scope.</p>}
      </Card>
    </AppShell>
  );
}
