"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateOrgSmtpAction, testOrgSmtpAction, disconnectOrgSmtpAction } from "@/app/actions";
import type { OrgSmtpDTO } from "@/server/services/smtp-settings.service";

type Message = { type: "success" | "error"; text: string };

// One-click presets (password-based) for common providers.
const PRESETS = [
  { id: "google", label: "Gmail", host: "smtp.gmail.com", port: 465, secure: true },
  { id: "zoho", label: "Zoho", host: "smtp.zoho.com", port: 465, secure: true },
  { id: "microsoft", label: "Microsoft 365", host: "smtp.office365.com", port: 587, secure: false },
];

export function OrgSmtpForm({
  initial,
  googleOAuthEnabled = false,
}: {
  initial: OrgSmtpDTO | null;
  googleOAuthEnabled?: boolean;
}) {
  const [host, setHost] = useState(initial?.smtpHost ?? "");
  const [port, setPort] = useState(String(initial?.smtpPort ?? 465));
  const [secure, setSecure] = useState(initial?.smtpSecure !== false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const isOAuth = initial?.authMethod === "oauth2_google";

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      await disconnectOrgSmtpAction();
      setMessage({ type: "success", text: "Disconnected. Reconnect or configure SMTP manually." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to disconnect." });
    } finally {
      setDisconnecting(false);
    }
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setHost(p.host);
    setPort(String(p.port));
    setSecure(p.secure);
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await updateOrgSmtpAction(new FormData(e.currentTarget));
      setMessage({ type: "success", text: "Organization SMTP saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (form: HTMLFormElement) => {
    setTesting(true);
    setMessage(null);
    try {
      await testOrgSmtpAction(new FormData(form));
      setMessage({ type: "success", text: "SMTP connection successful!" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Connection failed." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      {message && (
        <div className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}
      {initial && !isOAuth && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          ✓ Organization SMTP configured. Last updated: {new Date(initial.updatedAt).toLocaleDateString()}
        </div>
      )}

      {/* Google OAuth2 — one-click connect for the org mailbox */}
      <div className="mb-5 rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700">Connect with Google (recommended)</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Sign in with a Google Workspace account — no app password needed. Uses OAuth2.
        </p>
        {isOAuth ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm text-emerald-800">✓ Connected as <strong>{initial?.smtpUsername}</strong></span>
            <Button type="button" variant="outline" disabled={disconnecting} onClick={handleDisconnect} className="ml-auto">
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : googleOAuthEnabled ? (
          <a
            href="/api/oauth/google/org/start"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <GoogleGlyph /> Connect Gmail / Workspace
          </a>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Google OAuth is not configured on the server. Set <code>GOOGLE_CLIENT_ID</code> /{" "}
            <code>GOOGLE_CLIENT_SECRET</code> to enable, or configure SMTP manually below.
          </p>
        )}
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-2 text-xs uppercase tracking-wide text-slate-400">or configure manually</span></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => applyPreset(p)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {p.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Host</label>
            <input name="smtpHost" value={host} onChange={(e) => setHost(e.target.value)} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Port</label>
            <input name="smtpPort" type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="smtpSecure" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="rounded border-slate-300" />
          <span className="text-sm font-medium text-slate-700">Use TLS/SSL</span>
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Username</label>
          <input name="smtpUsername" defaultValue={initial?.smtpUsername ?? ""} required placeholder="mail@yourcompany.com" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Password</label>
          <input name="smtpPassword" type="password" required placeholder="App password" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <p className="mt-1 text-xs text-slate-400">For Gmail/Zoho use an app password. Stored encrypted.</p>
        </div>

        <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">From Name</label>
            <input name="fromName" defaultValue={initial?.fromName ?? ""} required placeholder="OrderDesk" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">From Email</label>
            <input name="fromEmail" type="email" defaultValue={initial?.fromEmail ?? ""} required placeholder="noreply@yourcompany.com" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          <Button
            type="button"
            variant="outline"
            disabled={testing}
            onClick={(e) => {
              const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
              if (form) handleTest(form);
            }}
          >
            {testing ? "Testing…" : "Test Connection"}
          </Button>
        </div>
      </form>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
