"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

/** Clerk-mode sign-out: ends the Clerk session and returns to the sign-in page. */
export function ClerkSignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: "/sign-in" })}
      className="rounded-md p-2 text-slate-400 hover:bg-slate-100"
      title="Sign out"
    >
      <LogOut size={16} />
    </button>
  );
}
