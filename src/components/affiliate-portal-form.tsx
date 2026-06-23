"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateOwnAffiliateAction } from "@/app/actions";

type Message = { type: "success" | "error"; text: string };

export function AffiliatePortalForm({
  affiliate,
}: {
  affiliate: { name: string; email: string };
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await updateOwnAffiliateAction(new FormData(e.currentTarget));
      setMessage({ type: "success", text: "Your details were saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {message && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input name="name" required defaultValue={affiliate.name} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input name="email" type="email" required defaultValue={affiliate.email} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-400">Also your sign-in email.</p>
        </div>
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button>
    </form>
  );
}
