"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/actions";
import type { ApiKeyDTO } from "@/server/services/api-key.service";

const ROLES = ["ADMIN", "MANAGER", "FINANCE_USER", "SUPPORT_AGENT", "STAFF"];

export function ApiKeysManager({ keys }: { keys: ApiKeyDTO[] }) {
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Capture the form node now — React nulls e.currentTarget after the await.
    const form = e.currentTarget;
    setCreating(true);
    setError(null);
    setNewKey(null);
    try {
      const res = await createApiKeyAction(new FormData(form));
      setNewKey(res.plaintext);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key.");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-5">
      {/* One-time secret reveal */}
      {newKey && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Copy your API key now — it won't be shown again.</p>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-amber-200 bg-white px-3 py-2 text-xs text-slate-800">{newKey}</code>
            <Button type="button" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          <button type="button" onClick={() => setNewKey(null)} className="mt-2 text-xs text-amber-700 underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Key name</label>
          <input name="name" required placeholder="CI pipeline" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
          <select name="role" defaultValue="ADMIN" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Expires (optional)</label>
          <input name="expiresAt" type="date" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div className="lg:col-span-4">
          <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create API key"}</Button>
          <p className="mt-1 text-xs text-slate-400">The key acts with the selected role at organization scope. Default ADMIN.</p>
        </div>
      </form>

      {/* Existing keys */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Prefix</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Last used</th><th className="px-4 py-2">State</th><th className="px-4 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const revoked = !!k.revokedAt;
              const expired = k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();
              return (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{k.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{k.keyPrefix}…</td>
                  <td className="px-4 py-2 text-slate-600">{k.role}</td>
                  <td className="px-4 py-2 text-slate-500">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-2">
                    {revoked ? <span className="text-rose-600">Revoked</span>
                      : expired ? <span className="text-amber-600">Expired</span>
                      : <span className="text-emerald-600">Active</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!revoked && (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <Button type="submit" variant="outline">Revoke</Button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {keys.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No API keys yet.</p>}
      </div>
    </div>
  );
}
