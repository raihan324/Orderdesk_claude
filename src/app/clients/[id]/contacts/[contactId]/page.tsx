import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Mail, Check, X, Pencil } from "lucide-react";
import { getPrincipal } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, STATUS_STYLE } from "@/components/ui";
import { clientService, contactTypes } from "@/server/services/client.service";
import { inviteContactAction, updateContactAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const CONTACT_LABEL: Record<string, string> = {
  OWNER: "Owner", DIRECTOR: "Director", MANAGER: "Manager", ACCOUNTS: "Accounts",
  TECHNICAL: "Technical", PROCUREMENT: "Procurement", PRIMARY: "Primary", OTHER: "Other",
};

export default async function ContactDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contactId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { contactId } = await params;
  const { edit } = await searchParams;
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const data = await clientService.contactDetail(p, contactId);
  if (!data) notFound();
  const { contact, client, canManage } = data;
  const editing = canManage && edit === "1";
  const selfUrl = `/clients/${client.id}/contacts/${contact.id}`;

  const initials = contact.name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppShell principal={p}>
      <Link
        href={`/clients/${client.id}`}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={15} /> Back to {client.name}
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-base font-semibold text-indigo-700">
          {initials || "?"}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
            <Badge className="bg-slate-100 text-slate-600">{CONTACT_LABEL[contact.type]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {contact.jobTitle || "—"} · {client.name}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage && !editing && (
            <Link href={`${selfUrl}?edit=1`}>
              <Button variant="outline">
                <Pencil size={14} /> Edit
              </Button>
            </Link>
          )}
          {canManage && !contact.hasPortalAccess && !editing && (
            <form action={inviteContactAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="clientId" value={client.id} />
              <Button type="submit">
                <Mail size={14} /> Invite to portal
              </Button>
            </form>
          )}
        </div>
      </div>

      {editing ? (
        <Card className="mt-5 p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Edit contact</h3>
          <form action={updateContactAction} className="space-y-4">
            <input type="hidden" name="contactId" value={contact.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="name" defaultValue={contact.name} required />
              <Field label="Email" name="email" type="email" defaultValue={contact.email} required />
              <Field label="Job title" name="jobTitle" defaultValue={contact.jobTitle ?? ""} />
              <Field label="Phone" name="phone" defaultValue={contact.phone ?? ""} />
              <Field label="Department" name="department" defaultValue={contact.department ?? ""} />
              <Field label="Position" name="position" defaultValue={contact.position ?? ""} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact type</label>
                <select
                  name="type"
                  defaultValue={contact.type}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  {contactTypes.map((t) => (
                    <option key={t} value={t}>{CONTACT_LABEL[t]}</option>
                  ))}
                </select>
              </div>
            </div>

            {contact.hasPortalAccess && (
              <div className="border-t border-slate-100 pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Portal permissions
                </h4>
                <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="canManageOrgSettings"
                    defaultChecked={contact.canManageOrgSettings}
                    className="rounded border-slate-300"
                  />
                  Can manage organization settings
                </label>
                <label className="flex items-center gap-2 py-1 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="canManagePortalUsers"
                    defaultChecked={contact.canManagePortalUsers}
                    className="rounded border-slate-300"
                  />
                  Can manage portal users
                </label>
              </div>
            )}

            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <Button type="submit">Save changes</Button>
              <Link href={selfUrl}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </form>
        </Card>
      ) : (
      <>{/* read-only view */}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Contact info */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Contact information</h3>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row k="Email" v={contact.email} />
            <Row k="Phone" v={contact.phone} />
            <Row k="Job title" v={contact.jobTitle} />
            <Row k="Type" v={CONTACT_LABEL[contact.type]} />
            <Row k="Department" v={contact.department} />
            <Row k="Position" v={contact.position} />
          </dl>
        </Card>

        {/* Portal access */}
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Portal access</h3>
          {contact.hasPortalAccess ? (
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge className={STATUS_STYLE[contact.portalStatus]}>{contact.portalStatus}</Badge>
                </dd>
              </div>
              <BoolRow k="Manage org settings" v={contact.canManageOrgSettings} />
              <BoolRow k="Manage portal users" v={contact.canManagePortalUsers} />
              <BoolRow k="Onboarding complete" v={contact.onboardingCompleted} />
            </dl>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Lock size={15} /> No portal access yet.
              </div>
              {canManage && (
                <form action={inviteContactAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <Button type="submit" variant="outline">
                    <Mail size={13} /> Send invite
                  </Button>
                </form>
              )}
            </div>
          )}
        </Card>

        {/* Preferences */}
        <Card className="p-5 lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Preference overrides{" "}
            <span className="font-normal text-slate-400">(falls back to {client.name}'s defaults)</span>
          </h3>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Row k="Time zone" v={contact.timezoneOverride} fallback={client.timezone} />
            <Row k="Currency" v={contact.currencyOverride} fallback={client.currency} />
            <Row k="Language" v={contact.languageOverride} fallback={client.language} />
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Added {new Date(contact.createdAt).toLocaleDateString()}
          </p>
        </Card>
      </div>
      </>
      )}
    </AppShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Row({ k, v, fallback }: { k: string; v: string | null; fallback?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-1">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">
        {v || (fallback ? <span className="text-slate-400">{fallback} (inherited)</span> : "—")}
      </dd>
    </div>
  );
}

function BoolRow({ k, v }: { k: string; v: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd>
        {v ? (
          <Check size={15} className="text-emerald-600" />
        ) : (
          <X size={15} className="text-slate-300" />
        )}
      </dd>
    </div>
  );
}
