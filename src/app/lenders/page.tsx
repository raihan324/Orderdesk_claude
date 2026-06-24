import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Landmark } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge, Button } from "@/components/ui";
import { loanService } from "@/server/services/loan.service";
import { createLenderAction, inviteLenderPortalAction } from "@/app/actions";
import { Mail } from "lucide-react";
import { SendMailButton } from "@/components/send-mail-button";

export const dynamic = "force-dynamic";

const INVITE_MSG: Record<string, { type: "success" | "error"; text: string }> = {
  sent: { type: "success", text: "Lender portal invite sent." },
  off: { type: "error", text: "Lender marked invited, but the email could not be sent (check SMTP)." },
  no_email: { type: "error", text: "Add a contact email to the lender before inviting." },
  failed: { type: "error", text: "Could not invite the lender." },
};

export default async function LendersPage({
  searchParams,
}: {
  searchParams: Promise<{ portal_invite?: string }>;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  // Lender registry is managed by the sanction authority (Finance / Admin).
  if (!can(p, "loan.sanction")) redirect("/loans");

  const { portal_invite } = await searchParams;
  const banner = portal_invite ? INVITE_MSG[portal_invite] : undefined;
  const lenders = await loanService.listLenders();

  return (
    <AppShell principal={p}>
      <Link href="/loans" className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={15} /> Back to loans
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Lenders</h1>
      <p className="mt-0.5 text-sm text-slate-500">Institutions and individuals that fund loans.</p>

      {banner && (
        <div className={`mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          <Mail size={15} /> {banner.text}
        </div>
      )}

      <Card className="mt-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Add lender</h3>
        <form action={createLenderAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="name" required placeholder="Lender name" className="rounded-md border border-slate-200 px-3 py-2 text-sm lg:col-span-2" />
          <input name="contactEmail" type="email" placeholder="Email (optional)" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="contactPhone" placeholder="Phone (optional)" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <Button type="submit" className="justify-center sm:col-span-2 lg:col-span-1">Add lender</Button>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead><tr><Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Status</Th><Th>Portal</Th><Th className="text-right">Actions</Th></tr></THead>
          <TBody>
            {lenders.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td className="font-medium text-slate-900">{l.name}</Td>
                <Td className="text-slate-600">{l.contactEmail ?? <span className="text-slate-400">—</span>}</Td>
                <Td className="text-slate-600">{l.contactPhone ?? <span className="text-slate-400">—</span>}</Td>
                <Td><Badge className={l.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}>{l.isActive ? "Active" : "Inactive"}</Badge></Td>
                <Td>{l.hasPortalAccess ? <Badge className="bg-indigo-100 text-indigo-700">{l.portalStatus}</Badge> : <span className="text-xs text-slate-400">No access</span>}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    {l.contactEmail && <SendMailButton to={l.contactEmail} subjectDefault={`Hello ${l.name}`} label="Mail" />}
                    {!l.hasPortalAccess && (
                      <form action={inviteLenderPortalAction}>
                        <input type="hidden" name="lenderId" value={l.id} />
                        <Button type="submit" variant="outline"><Mail size={13} /> Invite</Button>
                      </form>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {lenders.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-14 text-slate-400"><Landmark size={26} /><p className="text-sm">No lenders yet.</p></div>
        )}
      </Card>
    </AppShell>
  );
}
