import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Mail, Check } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button, STATUS_STYLE } from "@/components/ui";
import { clientService } from "@/server/services/client.service";
import { formatCents } from "@/lib/utils";
import { assignRepAction, inviteContactAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const CONTACT_LABEL: Record<string, string> = {
  OWNER: "Owner", DIRECTOR: "Director", MANAGER: "Manager", ACCOUNTS: "Accounts",
  TECHNICAL: "Technical", PROCUREMENT: "Procurement", PRIMARY: "Primary", OTHER: "Other",
};

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const data = await clientService.detail(p, id);
  if (!data) notFound();
  const { client, contacts, orders, canManage, canAssign } = data;
  const reps = await clientService.reps();

  return (
    <AppShell principal={p}>
      <Link href="/clients" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={15} /> Back to clients</Link>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{client.name}</h1>
        <Badge className={client.type === "B2B" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"}>{client.type}</Badge>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{client.type === "B2B" ? client.industry : "Individual customer"}</p>

      {!canManage && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Lock size={15} /> View-only — not your assigned client (or your role can't modify).
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{client.type === "B2B" ? "Company profile" : "Individual"}</h3>
          <dl className="space-y-1.5 text-sm">
            {client.type === "B2B" && (<>
              <Row k="Website" v={client.website} /><Row k="Reg. number" v={client.registrationNumber} />
              <Row k="Tax / VAT" v={client.taxNumber} /><Row k="Address" v={client.companyAddress} />
            </>)}
            <Row k="Country" v={client.country} /><Row k="Currency" v={client.currency} /><Row k="Time zone" v={client.timezone} />
          </dl>
          {canAssign && (
            <form action={assignRepAction} className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="clientId" value={client.id} />
              <label className="mb-1 block text-xs font-medium text-slate-600">Assign sales rep</label>
              <div className="flex gap-2">
                <select name="repId" defaultValue={client.salesRepId ?? ""} className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <Button type="submit">Save</Button>
              </div>
            </form>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-700">{client.type === "B2B" ? `Contacts (${contacts.length})` : "Contact"}</h3>
            <span className="text-xs text-slate-400">Portal access is per contact</span>
          </div>
          <Table>
            <THead><tr><Th>Name</Th><Th>Type</Th><Th>Portal</Th><Th>Org settings</Th><Th /></tr></THead>
            <TBody>
              {contacts.map((ct) => (
                <tr key={ct.id} className="hover:bg-slate-50">
                  <Td><div className="font-medium text-slate-900">{ct.name}</div><div className="text-xs text-slate-400">{ct.jobTitle || ct.email}</div></Td>
                  <Td><Badge className="bg-slate-100 text-slate-600">{CONTACT_LABEL[ct.type]}</Badge></Td>
                  <Td>{ct.hasPortalAccess ? <Badge className={STATUS_STYLE[ct.portalStatus]}>{ct.portalStatus}</Badge> : <span className="text-xs text-slate-400">No access</span>}</Td>
                  <Td>{client.type === "B2B" && ct.hasPortalAccess ? (ct.canManageOrgSettings ? <Check size={15} className="text-emerald-600" /> : <span className="text-slate-300">—</span>) : ""}</Td>
                  <Td className="text-right">
                    {canManage && !ct.hasPortalAccess && (
                      <form action={inviteContactAction}>
                        <input type="hidden" name="contactId" value={ct.id} />
                        <input type="hidden" name="clientId" value={client.id} />
                        <Button type="submit" variant="outline"><Mail size={13} /> Invite</Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3"><h3 className="text-sm font-semibold text-slate-700">Orders ({orders.length})</h3></div>
        <Table>
          <THead><tr><Th>Order</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></THead>
          <TBody>
            {orders.map((o) => (
              <tr key={o.id}><Td className="font-medium text-slate-900">{o.orderNumber}</Td><Td><Badge className={STATUS_STYLE[o.status]}>{o.status}</Badge></Td><Td className="text-right font-medium">{formatCents(o.totalCents, o.currency)}</Td></tr>
            ))}
          </TBody>
        </Table>
        {orders.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No orders.</p>}
      </Card>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return <div className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v || "—"}</dd></div>;
}
