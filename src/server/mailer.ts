import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { smtpSettingsService } from "@/server/services/smtp-settings.service";

/**
 * Lazily-created default SMTP transport (global config). Returns null when
 * SMTP is not configured, so the app runs fine without email.
 */
let cachedDefault: Transporter | null = null;

export function isMailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Get the global default transport. Falls back to getTransport(userId) if
 * per-user SMTP is available.
 */
function getTransport(): Transporter | null {
  if (cachedDefault) return cachedDefault;
  if (!isMailEnabled()) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  cachedDefault = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedDefault;
}

/**
 * Get a transporter for a specific user. If the user has configured SMTP
 * settings, use those. Otherwise fall back to the global default.
 */
async function getTransportForUser(userId: string | null): Promise<Transporter | null> {
  if (!userId) return getTransport(); // No user, use global

  try {
    const userTransport = await smtpSettingsService.createTransporter(userId);
    if (userTransport) return userTransport;
  } catch (err) {
    console.error("[mailer] failed to load user SMTP settings:", err);
  }

  return getTransport(); // Fall back to global
}

function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  role: string;
  signInUrl: string;
  userId?: string; // Optional: if provided, uses the user's SMTP settings
}): Promise<void> {
  const t = await getTransportForUser(opts.userId || null);
  if (!t) throw new Error("SMTP_NOT_CONFIGURED");

  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  const label = roleLabel(opts.role);

  await t.sendMail({
    from,
    to: opts.to,
    subject: "You've been invited to OrderDesk",
    text:
      `Hi ${opts.name},\n\n` +
      `You've been invited to OrderDesk as ${label}.\n\n` +
      `Sign in with this email address (${opts.to}) to get started:\n${opts.signInUrl}\n\n` +
      `— OrderDesk`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 4px">You've been invited to OrderDesk</h2>
        <p style="color:#475569;margin:0 0 16px">Hi ${opts.name}, you've been added as <strong>${label}</strong>.</p>
        <p style="color:#475569;margin:0 0 16px">Sign in with <strong>${opts.to}</strong> to get started.</p>
        <a href="${opts.signInUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Sign in to OrderDesk
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">If you weren't expecting this, you can ignore this email.</p>
      </div>`,
  });
}
