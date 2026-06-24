"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ShoppingCart,
  UserCog,
  Landmark,
  LayoutDashboard,
  Receipt,
  Circle,
  type LucideIcon,
} from "lucide-react";

// Icons are resolved here (client side) by key — components can't be passed
// across the server→client boundary as props.
const ICONS: Record<string, LucideIcon> = {
  orders: ShoppingCart,
  details: UserCog,
  loans: Landmark,
  dashboard: LayoutDashboard,
  commissions: Receipt,
};

export type PortalNavItem = { href: string; label: string; icon: string };

/** Sidebar nav for the portals with active-tab highlighting (driven by ?section). */
export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  const current = useSearchParams().get("section");

  return (
    <nav className="flex-1 px-3">
      {items.map((n, i) => {
        const url = new URL(n.href, "http://local");
        const section = url.searchParams.get("section");
        const active = url.pathname === pathname && (section === current || (!current && i === 0));
        const Icon = ICONS[n.icon] ?? Circle;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
              active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={17} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
