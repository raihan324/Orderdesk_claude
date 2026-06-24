import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Lock, ShoppingCart, Settings, UserCog } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { db } from "@/db";
import { clients, contacts } from "@/db/schema";
import { Card, Table, THead, TBody, Th, Td, Badge, STATUS_STYLE } from "@/components/ui";
import { PortalShell } from "@/components/portal-shell";
import { orderService } from "@/server/services/order.service";
import { PortalProfileForm } from "@/components/portal-profile-form";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Portal({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "INTERNAL") redirect("/dashboard");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");
  if (p.kind === "SERVICE") redirect("/sign-in");

  const [client] = await db.select().from(clients).where(eq(clients.id, p.clientId)).limit(1);
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, p.contactId)).limit(1);
  const orders = await orderService.list(p); // scoped to this client by the service
  const isB2B = client.type === "B2B";
  const section = (await searchParams).section ?? "orders";

  return (
    <PortalShell
      brandLabel="Customer Portal"
      title={client.name}
      userName={p.name}
      nav={[
        { href: "/portal?section=orders", label: "My Orders", icon: "orders" },
        { href: "/portal?section=details", label: "My Details", icon: "details" },
      ]}
    >
      <h1 className="text-xl font-semibold tracking-tight">
        {section === "details" ? "My details" : "My orders"}
      </h1>
      <p className="mt-0.5 text-sm text-slate-500">Everything here is scoped to {isB2B ? client.name : "your account"} only.</p>

      <div className="mt-5 space-y-4">
        {section === "orders" && (
          <>
            {isB2B && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <Settings size={15} className="text-slate-400" />
                <span className="text-slate-600">Organization settings</span>
                {p.canManageOrgSettings
                  ? <Badge className="bg-emerald-100 text-emerald-700">You can edit</Badge>
                  : <Badge className="bg-amber-100 text-amber-700"><Lock size={11} className="mr-1" /> View-only — no permission</Badge>}
              </div>
            )}
            <Card className="overflow-hidden">
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
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
              <p className="flex items-center gap-2"><Lock size={14} className="text-slate-400" /> You can't see internal users, other clients, system administration, or internal notes.</p>
            </div>
          </>
        )}

        {section === "details" && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
              <UserCog size={15} /> My details
            </div>
            <div className="p-5">
              <PortalProfileForm
                contact={contact}
                clientDefaults={{ timezone: client.timezone, currency: client.currency, language: client.language }}
              />
            </div>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
