"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Mail, KeyRound, Building2, type LucideIcon } from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon };

const BASE: Item[] = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/smtp", label: "Email & SMTP", icon: Mail },
];

export function SettingsNav({
  showApiKeys,
  showOrgSmtp,
}: {
  showApiKeys: boolean;
  showOrgSmtp: boolean;
}) {
  const pathname = usePathname();
  const items: Item[] = [
    ...BASE,
    ...(showOrgSmtp ? [{ href: "/settings/org-smtp", label: "Organization Email", icon: Building2 }] : []),
    ...(showApiKeys ? [{ href: "/settings/api-keys", label: "API Keys", icon: KeyRound }] : []),
  ];

  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-52 sm:flex-col sm:overflow-visible">
      {items.map((n) => {
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <n.icon size={16} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
