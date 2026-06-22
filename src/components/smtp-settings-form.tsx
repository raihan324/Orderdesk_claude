"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateSmtpSettingsAction, testSmtpConnectionAction } from "@/app/actions";
import type { SmtpSettingsDTO } from "@/server/services/smtp-settings.service";

type Message = { type: "success" | "error"; text: string };

export function SmtpSettingsForm({
  initialSettings,
  userId,
}: {
  initialSettings: SmtpSettingsDTO | null;
  userId: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

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

      {initialSettings && (
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          ✓ You have SMTP configured. Last updated: {new Date(initialSettings.updatedAt).toLocaleDateString()}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host</label>
            <input
              type="text"
              name="smtpHost"
              placeholder="smtp.gmail.com"
              defaultValue={initialSettings?.smtpHost || ""}
              required
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">e.g., smtp.gmail.com, smtp.sendgrid.net</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Port</label>
            <input
              type="number"
              name="smtpPort"
              placeholder="465"
              defaultValue={initialSettings?.smtpPort || "465"}
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
              defaultChecked={initialSettings?.smtpSecure !== false}
              className="rounded border border-slate-300"
            />
            <span className="text-sm font-medium text-slate-700">Use TLS/SSL</span>
          </label>
          <p className="text-xs text-slate-400 mt-1">Recommended: enabled for port 465, may vary for 587</p>
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
          <p className="text-xs text-slate-400 mt-1">For Gmail, use an app password (not your account password)</p>
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
