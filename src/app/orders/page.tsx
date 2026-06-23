import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button, STATUS_STYLE } from "@/components/ui";
import { orderService } from "@/server/services/order.service";
import { clientService } from "@/server/services/client.service";
import { productService } from "@/server/services/product.service";
import { formatCents } from "@/lib/utils";
import { createInvoiceFromOrderAction } from "@/app/actions";
import { OrderCreateForm } from "@/components/order-create-form";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");

  const [orders, clients, products] = await Promise.all([
    orderService.list(p),
    clientService.list(p),
    productService.list(p),
  ]);
  const mayCreate = can(p, "order.manage");
  const mayInvoice = can(p, "invoice.manage") || p.role === "SALES_REP";

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        {p.role === "SALES_REP" ? "Orders for your assigned clients." : "All orders."}
      </p>

      {mayCreate && clients.length > 0 && (
        <Card className="mt-5 p-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">New order</h3>
          <p className="mb-3 text-xs text-slate-400">Add as many items as you need. Line totals are computed server-side from the catalog price — prices are never taken from the request.</p>
          <OrderCreateForm clients={clients} products={products} />
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead><tr><Th>Order</Th><Th>Client</Th><Th>Status</Th><Th className="text-right">Total</Th>{mayInvoice && <Th className="text-right">Invoice</Th>}</tr></THead>
          <TBody>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{o.orderNumber}</Td>
                <Td>{o.clientName}</Td>
                <Td><Badge className={STATUS_STYLE[o.status]}>{o.status}</Badge></Td>
                <Td className="text-right font-medium">{formatCents(o.totalCents, o.currency)}</Td>
                {mayInvoice && (
                  <Td className="text-right">
                    <form action={createInvoiceFromOrderAction}>
                      <input type="hidden" name="orderId" value={o.id} />
                      <Button type="submit" variant="outline"><FileText size={13} /> Create invoice</Button>
                    </form>
                  </Td>
                )}
              </tr>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No orders in your scope.</p>}
      </Card>
    </AppShell>
  );
}
