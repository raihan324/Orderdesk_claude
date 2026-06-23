import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell, ROLE_LABEL } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Button, Badge, STATUS_STYLE } from "@/components/ui";
import { userService, ROLES } from "@/server/services/user.service";
import { inviteUserAction, updateUserRoleAction, updateUserStatusAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE: Record<string, string> = {
  email_exists: "A user with that email already exists.",
  invite_failed: "Could not invite that user. Check the email and try again.",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string; mail?: string }>;
}) {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");
  if (p.kind === "LENDER") redirect("/portal/lender");
  if (p.kind === "AFFILIATE") redirect("/portal/affiliate");
  if (p.kind === "SERVICE") redirect("/sign-in");
  if (!can(p, "user.manage")) redirect("/dashboard");

  const users = await userService.list(p);
  const selfId = p.userId;
  const sp = await searchParams;

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Users &amp; Roles</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Invite staff and manage their roles. The invitee gets the assigned role when
        they first sign in with that email. Changes are recorded to the audit log.
      </p>

      {sp.invited && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Invited <span className="font-medium">{sp.invited}</span>. They&apos;ll get their role on first sign-in.
          {sp.mail === "sent" && " An invitation email was sent."}
          {sp.mail === "off" && " (Email not sent — SMTP is not configured or the send failed.)"}
        </div>
      )}
      {sp.error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {ERROR_MESSAGE[sp.error] ?? "Something went wrong."}
        </div>
      )}

      <Card className="mt-5 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Invite user</h3>
        <form action={inviteUserAction} className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          <input
            name="email"
            type="email"
            placeholder="email@example.com"
            required
            className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-3"
          />
          <input
            name="name"
            placeholder="Full name"
            required
            className="rounded-md border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            name="role"
            defaultValue="STAFF"
            className="rounded-md border border-slate-200 px-2 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <Button type="submit" className="justify-center">
            Invite
          </Button>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </THead>
          <TBody>
            {users.map((u) => {
              const isSelf = u.id === selfId;
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <Td>
                    <div className="font-medium text-slate-900">
                      {u.name} {isSelf && <span className="text-xs font-normal text-slate-400">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </Td>
                  <Td>
                    {isSelf ? (
                      <span className="text-sm text-slate-600">{ROLE_LABEL[u.role]}</span>
                    ) : (
                      <form action={updateUserRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" variant="outline" className="px-2 py-1 text-xs">
                          Save
                        </Button>
                      </form>
                    )}
                  </Td>
                  <Td>
                    <Badge className={STATUS_STYLE[u.status]}>{u.status}</Badge>
                  </Td>
                  <Td className="text-right">
                    {isSelf ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <form action={updateUserStatusAction} className="inline">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}
                        />
                        <Button
                          type="submit"
                          variant={u.status === "SUSPENDED" ? "outline" : "ghost"}
                          className={u.status === "SUSPENDED" ? "text-xs" : "text-xs text-rose-600 hover:bg-rose-50"}
                        >
                          {u.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                        </Button>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </AppShell>
  );
}
