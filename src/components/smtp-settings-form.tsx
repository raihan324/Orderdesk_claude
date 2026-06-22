"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  updateSmtpSettingsAction,
  testSmtpConnectionAction,
  testSavedSmtpAction,
  disconnectSmtpAction,
} from "@/app/actions";
import type { SmtpSettingsDTO } from "@/server/services/smtp-settings.service";

type Message = { type: "success" | "error"; text: string };

// One-click SMTP presets. Selecting one fills host/port/TLS so the user only
// has to enter their username + (app) password.
type Provider = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  hint: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "google",
    label: "Google (Gmail)",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    hint: "Use a Gmail App Password (Google Account → Security → App passwords), not your normal password. Requires 2-Step Verification.",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    secure: true,
    hint: "Use an app-specific password from Zoho (Account → Security → App Passwords). For zoho.eu accounts use smtp.zoho.eu.",
  },
  {
    id: "microsoft",
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    hint: "Port 587 with STARTTLS (TLS unchecked). SMTP AUTH must be enabled for your mailbox in Microsoft 365 admin.",
  },
];

export function SmtpSettingsForm({
  initialSettings,
  userId,
  googleOAuthEnabled = false,
}: {
  initialSettings: SmtpSettingsDTO | null;
  userId: string;
  googleOAuthEnabled?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const isGoogleOAuth = initialSettings?.authMethod === "oauth2_google";

  const handleTestSaved = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await testSavedSmtpAction();
      setMessage({ type: "success", text: "Connection verified — your mailbox is ready to send." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to verify connection.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setMessage(null);
    try {
      await disconnectSmtpAction();
      setMessage({ type: "success", text: "Disconnected. You can reconnect or configure SMTP manually." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to disconnect.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  // Controlled connection fields so the preset buttons can populate them.
  const [host, setHost] = useState(initialSettings?.smtpHost || "");
  const [port, setPort] = useState(String(initialSettings?.smtpPort || "465"));
  const [secure, setSecure] = useState(initialSettings?.smtpSecure !== false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [providerHint, setProviderHint] = useState<string | null>(null);

  const applyProvider = (provider: Provider) => {
    setHost(provider.host);
    setPort(String(provider.port));
    setSecure(provider.secure);
    setActiveProvider(provider.id);
    setProviderHint(provider.hint);
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    try {
      await updateSmtpSettingsAction(formData);
      setMessage({ type: "success", text: "Settings saved successfully." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save settings.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (form: HTMLFormElement) => {
    setTesting(true);
    setMessage(null);

    const formData = new FormData(form);
    try {
      await testSmtpConnectionAction(formData);
      setMessage({ type: "success", text: "SMTP connection successful!" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to connect to SMTP server.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      {message && (
        <div
          className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {initialSettings && !isGoogleOAuth && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          ✓ You have SMTP configured. Last updated: {new Date(initialSettings.updatedAt).toLocaleDateString()}
        </div>
      )}

      {/* Google OAuth2 — one-click connect, no app password needed */}
      <div className="mb-5 rounded-lg border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-700">Connect with Google (recommended)</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Sign in with your Google account — no app password needed. Uses OAuth2 (XOAUTH2).
        </p>

        {isGoogleOAuth ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
            <span className="text-sm text-emerald-800">
              ✓ Connected as <strong>{initialSettings?.smtpUsername}</strong>
            </span>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" disabled={testing} onClick={handleTestSaved}>
                {testing ? "Testing..." : "Test connection"}
              </Button>
              <Button type="button" variant="outline" disabled={disconnecting} onClick={handleDisconnect}>
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </div>
        ) : googleOAuthEnabled ? (
          <a
            href="/api/oauth/google/start"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <GoogleGlyph />
            Connect Gmail account
          </a>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Google OAuth is not configured on the server. Set <code>GOOGLE_CLIENT_ID</code> and{" "}
            <code>GOOGLE_CLIENT_SECRET</code> to enable one-click connect, or configure SMTP manually below.
          </p>
        )}
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-2 text-xs uppercase tracking-wide text-slate-400">
            or configure manually
          </span>
        </div>
      </div>

      {/* One-click provider presets */}
      <div className="mb-5">
        <p className="text-sm font-medium text-slate-700 mb-2">Quick setup</p>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => applyProvider(provider)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                activeProvider === provider.id
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {provider.label}
            </button>
          ))}
        </div>
        {providerHint && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {providerHint}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Pick a provider to auto-fill the server settings, then enter your username and password below.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host</label>
            <input
              type="text"
              name="smtpHost"
              placeholder="smtp.gmail.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">e.g., smtp.gmail.com, smtp.zoho.com, smtp.office365.com</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Port</label>
            <input
              type="number"
              name="smtpPort"
              placeholder="465"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min="1"
              max="65535"
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">Usually 465 (TLS) or 587 (STARTTLS)</p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="smtpSecure"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              className="rounded border border-slate-300"
            />
            <span className="text-sm font-medium text-slate-700">Use TLS/SSL</span>
          </label>
          <p className="text-xs text-slate-400 mt-1">Enabled for port 465; unchecked for 587 (STARTTLS), e.g. Microsoft 365</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Username</label>
          <input
            type="text"
            name="smtpUsername"
            placeholder="your-email@gmail.com"
            defaultValue={initialSettings?.smtpUsername || ""}
            required
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Password</label>
          <div className="flex gap-2">
            <input
              type={showPassword ? "text" : "password"}
              name="smtpPassword"
              placeholder="Your app password"
              required
              className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">For Gmail/Zoho, use an app password (not your account password)</p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Email sender details</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From Name</label>
              <input
                type="text"
                name="fromName"
                placeholder="OrderDesk"
                defaultValue={initialSettings?.fromName || ""}
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From Email</label>
              <input
                type="email"
                name="fromEmail"
                placeholder="noreply@example.com"
                defaultValue={initialSettings?.fromEmail || ""}
                required
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={loading} className="flex-1 sm:flex-none">
            {loading ? "Saving..." : "Save Settings"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={testing}
            onClick={(e) => {
              const form = (e.currentTarget as HTMLElement).closest("form") as HTMLFormElement;
              if (form) handleTest(form);
            }}
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
        </div>
      </form>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
