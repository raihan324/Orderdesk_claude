import Link from "next/link";
import { eq } from "drizzle-orm";
import { Boxes, ShieldCheck, Building2, User2 } from "lucide-react";
import { db } from "@/db";
import { users, contacts, clients } from "@/db/schema";
import { Card } from "@/components/ui";
import { ROLE_LABEL } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function SignIn() {
  // Production: Clerk's hosted login UI.
  if (process.env.AUTH_MODE === "clerk") {
    const { SignIn } = await import("@clerk/nextjs");
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <SignIn />
      </div>
    );
  }

  // Development: pick a seeded principal (no external service).
  const staff = await db.select().from(users).orderBy(users.role);
  const portal = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      clientName: clients.name,
      clientType: clients.type,
      hasPortalAccess: contacts.hasPortalAccess,
    })
    .from(contacts)
    .innerJoin(clients, eq(contacts.clientId, clients.id));

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white"><Boxes size={24} /></div>
          <h1 className="text-2xl font-semibold tracking-tight">OrderDesk</h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <ShieldCheck size={14} /> Development sign-in — choose a principal
          </p>
        </div>
        <Card className="p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Internal staff</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {staff.map((u) => (
              <Link key={u.id} href={`/api/dev-auth?as=INTERNAL:${u.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-indigo-50/40">
                <span className="font-medium text-slate-800">{u.name}</span>
                <span className="text-xs text-slate-400">{ROLE_LABEL[u.role]}</span>
              </Link>
            ))}
          </div>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Customer portal</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {portal.filter((c) => c.hasPortalAccess).map((c) => (
              <Link key={c.id} href={`/api/dev-auth?as=PORTAL:${c.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-indigo-50/40">
                <span className="flex items-center gap-1.5 font-medium text-slate-800">
                  {c.clientType === "B2B" ? <Building2 size={14} className="text-violet-500" /> : <User2 size={14} className="text-teal-500" />}
                  {c.name}
                </span>
                <span className="text-xs text-slate-400">{c.clientName}</span>
              </Link>
            ))}
          </div>
        </Card>
        <p className="mt-3 text-center text-xs text-slate-400">
          Production uses Clerk — set AUTH_MODE=clerk to switch this screen to Clerk login.
        </p>
      </div>
    </div>
  );
}
