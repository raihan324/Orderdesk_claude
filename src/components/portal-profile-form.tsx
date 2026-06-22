"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updatePortalProfileAction } from "@/app/actions";

type Message = { type: "success" | "error"; text: string };

export type PortalContact = {
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  position: string | null;
  timezoneOverride: string | null;
  currencyOverride: string | null;
  languageOverride: string | null;
};

export function PortalProfileForm({
  contact,
  clientDefaults,
}: {
  contact: PortalContact;
  clientDefaults: { timezone: string; currency: string; language: string };
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await updatePortalProfileAction(new FormData(e.currentTarget));
      setMessage({ type: "success", text: "Your details were saved." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save your details.",
      });
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
        <Field label="Full name" name="name" defaultValue={contact.name} required />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            value={contact.email}
            disabled
            className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-400">Your sign-in email can't be changed here.</p>
        </div>
        <Field label="Phone" name="phone" defaultValue={contact.phone ?? ""} />
        <Field label="Job title" name="jobTitle" defaultValue={contact.jobTitle ?? ""} />
        <Field label="Department" name="department" defaultValue={contact.department ?? ""} />
        <Field label="Position" name="position" defaultValue={contact.position ?? ""} />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Preferences
        </h4>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Time zone"
            name="timezone"
            defaultValue={contact.timezoneOverride ?? ""}
            placeholder={clientDefaults.timezone}
          />
          <Field
            label="Currency"
            name="currency"
            defaultValue={contact.currencyOverride ?? ""}
            placeholder={clientDefaults.currency}
          />
          <Field
            label="Language"
            name="language"
            defaultValue={contact.languageOverride ?? ""}
            placeholder={clientDefaults.language}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Leave a preference blank to inherit your organization's default.
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
