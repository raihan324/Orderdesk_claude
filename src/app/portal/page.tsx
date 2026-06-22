import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Building2, User2, Lock, LogOut, ShoppingCart, Settings } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { Card, Table, THead, TBody, Th, Td, Badge, STATUS_STYLE } from "@/components/ui";
import { orderService } from "@/server/services/order.service";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "INTERNAL") redirect("/dashboard");

  const [client] = await db.select().from(clients).where(eq(clients.id, p.clientId)).limit(1);
  const orders = await orderService.list(p); // scoped to this client by the service
  const isB2B = client.type === "B2B";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-white">{isB2B ? <Building2 size={18} /> : <User2 size={18} />}</div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                {client.name}
                <Badge className={isB2B ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"}>{client.type}</Badge>
              </p>
              <p className="text-xs text-slate-500">{p.name} · Customer Portal</p>
            </div>
          </div>
          <Link href="/api/dev-auth?signout=1" className="rounded-md p-2 text-slate-400 hover:bg-slate-100" title="Sign out"><LogOut size={16} /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Hello, {p.name.split(" ")[0]}</h1>
        <p className="mt-0.5 text-sm text-slate-500">Everything here is scoped to {isB2B ? client.name : "your account"} only.</p>

        {isB2B && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <Settings size={15} className="text-slate-400" />
            <span className="text-slate-600">Organization settings</span>
            {p.canManageOrgSettings
              ? <Badge className="bg-emerald-100 text-emerald-700">You can edit</Badge>
              : <Badge className="bg-amber-100 text-amber-700"><Lock size={11} className="mr-1" /> View-only — no permission</Badge>}
          </div>
        )}

        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700"><ShoppingCart size={15} /> My Orders</div>
          <Table>
            <THead><tr><Th>Order</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></THead>
            <TBody>
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50"><Td className="font-medium text-slate-900">{o.orderNumber}</Td><Td><Badge className={STATUS_STYLE[o.status]}>{o.status}</Badge></Td><Td className="text-right font-medium">{formatCents(o.totalCents, o.currency)}</Td></tr>
              ))}
            </TBody>
          </Table>
          {orders.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No orders yet.</p>}
        </Card>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          <p className="flex items-center gap-2"><Lock size={14} className="text-slate-400" /> You can't see internal users, other clients, system administration, or internal notes.</p>
        </div>
      </main>
    </div>
  );
}
