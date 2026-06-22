import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Building2 } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Badge } from "@/components/ui";
import { clientService } from "@/server/services/client.service";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const clients = await clientService.list(p);
  const reps = await clientService.reps();
  const repName = (id: string | null) => reps.find((r) => r.id === id)?.name ?? "—";

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        {p.role === "SALES_REP" ? "Only clients assigned to you." : "All B2B companies and B2C individuals."}
      </p>
      <Card className="mt-5 overflow-hidden">
        <Table>
          <THead>
            <tr><Th>Name</Th><Th>Type</Th><Th>Account manager</Th><Th /></tr>
          </THead>
          <TBody>
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{c.name}</Link>
                  {c.type === "B2B" && c.industry && <span className="ml-2 text-xs text-slate-400">{c.industry}</span>}
                </Td>
                <Td><Badge className={c.type === "B2B" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"}>{c.type}</Badge></Td>
                <Td>{c.salesRepId ? repName(c.salesRepId) : <span className="text-slate-400">Unassigned</span>}</Td>
                <Td className="text-right"><Link href={`/clients/${c.id}`}><ChevronRight size={16} className="text-slate-300" /></Link></Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {clients.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-14 text-slate-400"><Building2 size={26} /><p className="text-sm">No clients in your scope.</p></div>
        )}
      </Card>
    </AppShell>
  );
}
