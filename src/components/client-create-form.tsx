"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createClientAction } from "@/app/actions";

type Rep = { id: string; name: string };

export function ClientCreateForm({
  reps,
  canAssign,
}: {
  reps: Rep[];
  canAssign: boolean;
}) {
  const [type, setType] = useState<"B2B" | "B2C">("B2B");
  const isB2B = type === "B2B";

  return (
    <form action={createClientAction} className="space-y-4">
      <input type="hidden" name="type" value={type} />

      {/* Type toggle */}
      <div className="flex gap-2">
        {(["B2B", "B2C"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              type === t
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t === "B2B" ? "B2B company" : "B2C individual"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={isB2B ? "" : "sm:col-span-2"}>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {isB2B ? "Company name" : "Full name"}
          </label>
          <input
            name="name"
            required
            placeholder={isB2B ? "Acme Inc." : "Jane Doe"}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {isB2B && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
            <input
              name="industry"
              placeholder="Manufacturing"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        {isB2B && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
            <input
              name="website"
              placeholder="https://acme.com"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        {canAssign && (
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Account manager</label>
            <select
              name="salesRepId"
              defaultValue=""
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Unassigned</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Button type="submit">Create client</Button>
    </form>
  );
}
