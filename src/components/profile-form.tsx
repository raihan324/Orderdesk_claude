"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateProfileAction } from "@/app/actions";
import type { ProfileDTO } from "@/server/services/profile.service";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", ADMIN: "Admin", MANAGER: "Manager",
  SALES_REP: "Sales Rep", SUPPORT_AGENT: "Support Agent",
  FINANCE_USER: "Finance User", STAFF: "Staff",
};

export function ProfileForm({ profile }: { profile: ProfileDTO }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || "");

  const initials = profile.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    try {
      await updateProfileAction(formData);
      setMessage({ type: "success", text: "Profile updated successfully." });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update profile.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Avatar + identity */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative h-16 w-16 flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile.name}
              className="h-16 w-16 rounded-full object-cover border border-slate-200"
              onError={() => setAvatarUrl("")}
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-semibold text-indigo-700">
              {initials}
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{profile.name}</p>
          <p className="text-sm text-slate-500">{profile.email}</p>
          <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 mt-1">
            {ROLE_LABEL[profile.role] ?? profile.role}
          </span>
        </div>
      </div>

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

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Full Name <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            defaultValue={profile.name}
            required
            maxLength={200}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Email (read-only — managed by Clerk) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
          <input
            type="email"
            value={profile.email}
            readOnly
            className="w-full rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">
            Email is managed by your identity provider (Clerk) and cannot be changed here.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              type="tel"
              name="phone"
              defaultValue={profile.phone ?? ""}
              maxLength={50}
              placeholder="+1 555 000 0000"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Job title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
            <input
              type="text"
              name="jobTitle"
              defaultValue={profile.jobTitle ?? ""}
              maxLength={200}
              placeholder="e.g. Sales Manager"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Avatar URL */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Avatar URL</label>
          <input
            type="url"
            name="avatarUrl"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            maxLength={2000}
            placeholder="https://example.com/avatar.jpg"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-400 mt-1">Optional. Link to a profile photo (HTTPS).</p>
        </div>

        {/* Role (read-only) */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <input
            type="text"
            value={ROLE_LABEL[profile.role] ?? profile.role}
            readOnly
            className="w-full rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 mt-1">Role is assigned by an administrator.</p>
        </div>

        {/* Member since */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Member Since</label>
          <input
            type="text"
            value={new Date(profile.createdAt).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
            readOnly
            className="w-full rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </form>
    </>
  );
}
