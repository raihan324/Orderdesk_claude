import Link from "next/link";
import { LayoutDashboard, Building2, Package, ShoppingCart, UserCog, ScrollText, Boxes, ShieldCheck, LogOut, Settings, Landmark, Users2, FileText } from "lucide-react";
import type { Principal } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/rbac";
import { ClerkSignOutButton } from "@/components/sign-out-button";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", ADMIN: "Admin", MANAGER: "Manager", SALES_REP: "Sales Rep",
  SUPPORT_AGENT: "Support Agent", FINANCE_USER: "Finance User", STAFF: "Staff",
};

export function AppShell({ principal, children }: { principal: Principal; children: React.ReactNode }) {
  if (principal.kind !== "INTERNAL") return <>{children}</>;
  const role = principal.role;
  const nav = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/clients", label: "Clients", icon: Building2, show: true },
    { href: "/products", label: "Products", icon: Package, show: true },
    { href: "/orders", label: "Orders", icon: ShoppingCart, show: true },
    { href: "/invoices", label: "Invoices", icon: FileText, show: can(principal, "invoice.read") },
    { href: "/loans", label: "Loans", icon: Landmark, show: can(principal, "loan.read") },
    { href: "/affiliates", label: "Affiliates", icon: Users2, show: can(principal, "affiliate.read") },
    { href: "/users", label: "Users & Roles", icon: UserCog, show: can(principal, "user.manage") },
    { href: "/dashboard", label: "Audit Log", icon: ScrollText, show: can(principal, "audit.read") },
    { href: "/settings", label: "Settings", icon: Settings, show: true },
  ].filter((n) => n.show);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><Boxes size={18} /></div>
          <span className="font-semibold tracking-tight text-white">OrderDesk</span>
        </div>
        <nav className="flex-1 px-3">
          {nav.map((n, i) => (
            <Link key={i} href={n.href} className="mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-slate-800 hover:text-white">
              <n.icon size={17} />{n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <p className="flex items-center gap-1.5"><ShieldCheck size={13} /> {ROLE_LABEL[role]} · RBAC enforced</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-6">
          <span className="text-sm font-medium text-slate-500 lg:hidden">OrderDesk</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight text-slate-800">{principal.name}</p>
              <p className="text-xs leading-tight text-slate-400">{ROLE_LABEL[role]}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
              {principal.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
            </div>
            {process.env.AUTH_MODE === "clerk" ? (
              <ClerkSignOutButton />
            ) : (
              <Link href="/api/dev-auth?signout=1" className="rounded-md p-2 text-slate-400 hover:bg-slate-100" title="Sign out"><LogOut size={16} /></Link>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

export { ROLE_LABEL };
