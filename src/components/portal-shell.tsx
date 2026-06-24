import Link from "next/link";
import { Boxes, ShieldCheck, LogOut } from "lucide-react";
import { ClerkSignOutButton } from "@/components/sign-out-button";
import { PortalNav, type PortalNavItem } from "@/components/portal-nav";

type NavItem = PortalNavItem;

/**
 * Shared chrome for the customer / lender / affiliate portals — mirrors the
 * internal AppShell (dark left sidebar + sticky top header) so portals match
 * the rest of the app. Nav items are usually in-page anchors.
 */
export function PortalShell({
  brandLabel,
  title,
  userName,
  nav,
  children,
}: {
  brandLabel: string;
  title: string;
  userName: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const isClerk = process.env.AUTH_MODE === "clerk";
  const initials = userName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><Boxes size={18} /></div>
          <div className="leading-tight">
            <span className="block font-semibold tracking-tight text-white">OrderDesk</span>
            <span className="block text-xs text-slate-400">{brandLabel}</span>
          </div>
        </div>
        <PortalNav items={nav} />
        <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
          <p className="flex items-center gap-1.5"><ShieldCheck size={13} /> {brandLabel}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-6">
          <span className="text-sm font-medium text-slate-500 lg:hidden">{title}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight text-slate-800">{userName}</p>
              <p className="text-xs leading-tight text-slate-400">{title}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
              {initials}
            </div>
            {isClerk ? (
              <ClerkSignOutButton />
            ) : (
              <Link href="/api/dev-auth?signout=1" className="rounded-md p-2 text-slate-400 hover:bg-slate-100" title="Sign out">
                <LogOut size={16} />
              </Link>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-6 [&_[id]]:scroll-mt-20">{children}</main>
      </div>
    </div>
  );
}
