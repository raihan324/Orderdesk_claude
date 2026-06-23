"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateOwnLenderAction } from "@/app/actions";

type Message = { type: "success" | "error"; text: string };

export function LenderPortalForm({
  lender,
}: {
  lender: { name: string; contactEmail: string | null; contactPhone: string | null };
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await updateOwnLenderAction(new FormData(e.currentTarget));
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
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input name="name" required defaultValue={lender.name} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact email</label>
          <input name="contactEmail" type="email" defaultValue={lender.contactEmail ?? ""} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-400">Also your sign-in email — keep it current.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact phone</label>
          <input name="contactPhone" defaultValue={lender.contactPhone ?? ""} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button>
    </form>
  );
}
