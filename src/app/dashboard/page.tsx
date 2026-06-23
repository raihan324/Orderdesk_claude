import { redirect } from "next/navigation";
import { Building2, ShoppingCart, Users, Package } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell, ROLE_LABEL } from "@/components/app-shell";
import { Card } from "@/components/ui";
import { clientService } from "@/server/services/client.service";
import { orderService } from "@/server/services/order.service";
import { productService } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");

  const [clients, orders, products] = await Promise.all([
    clientService.list(p),
    orderService.list(p),
    productService.list(p),
  ]);
  const b2b = clients.filter((c) => c.type === "B2B").length;
  const b2c = clients.filter((c) => c.type === "B2C").length;

  const stats = [
    { label: p.role === "SALES_REP" ? "My clients" : "Clients", value: clients.length, sub: `${b2b} B2B · ${b2c} B2C`, icon: Building2 },
    { label: "Orders", value: orders.length, icon: ShoppingCart },
    { label: "Products", value: products.length, icon: Package },
    { label: "Sales reps", value: (await clientService.reps()).length, icon: Users },
  ];

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Welcome, {p.name.split(" ")[0]}</h1>
      <p className="mt-0.5 text-sm text-slate-500">{ROLE_LABEL[p.role]} — data below is scoped to your role.</p>
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">{s.label}</p>
              <s.icon size={16} className="text-slate-300" />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</p>
            {s.sub && <p className="mt-0.5 text-xs text-slate-400">{s.sub}</p>}
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5 text-sm text-slate-500">
        Use the navigation to manage clients, products, and orders. Authorization is enforced
        server-side in the service layer for every action.
      </Card>
    </AppShell>
  );
}
