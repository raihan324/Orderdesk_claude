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
 * Get a transporter for a specific user along with the From header to use.
 * If the user has configured SMTP (password or OAuth), use their transport and
 * their own From address. Otherwise fall back to the global default + MAIL_FROM.
 */
async function getTransportForUser(
  userId: string | null,
): Promise<{ transport: Transporter; from: string } | null> {
  const globalFrom = process.env.MAIL_FROM || process.env.SMTP_USER || "";

  if (userId) {
    try {
      const [userTransport, settings] = await Promise.all([
        smtpSettingsService.createTransporter(userId),
        smtpSettingsService.getSettings(userId),
      ]);
      if (userTransport && settings) {
        // Gmail OAuth requires the authenticated address as sender; using the
        // user's own From keeps password sends consistent too.
        const from = settings.fromName
          ? `${settings.fromName} <${settings.fromEmail}>`
          : settings.fromEmail;
        return { transport: userTransport, from };
      }
    } catch (err) {
      console.error("[mailer] failed to load user SMTP settings:", err);
    }
  }

  const fallback = getTransport();
  return fallback ? { transport: fallback, from: globalFrom } : null;
}

/**
 * Send an arbitrary test email through a user's configured mailbox (or the
 * global fallback). Used by the Settings "send a test email" composer.
 */
export async function sendTestEmail(opts: {
  to: string;
  subject: string;
  html: string;
  userId?: string;
}): Promise<{ from: string }> {
  const ctx = await getTransportForUser(opts.userId || null);
  if (!ctx) throw new Error("SMTP_NOT_CONFIGURED");

  const { transport, from } = ctx;
  // Plain-text fallback for clients that don't render HTML.
  const text = opts.html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text,
    html: opts.html,
  });

  return { from };
}

/**
 * Send a portal invitation to a client contact, linking them to the sign-up
 * page where they create an account with this email and reach their portal.
 */
export async function sendPortalInviteEmail(opts: {
  to: string;
  name: string;
  clientName: string;
  signUpUrl: string;
  userId?: string; // inviter — uses their SMTP/OAuth mailbox if configured
}): Promise<void> {
  const ctx = await getTransportForUser(opts.userId || null);
  if (!ctx) throw new Error("SMTP_NOT_CONFIGURED");

  const { transport: t, from } = ctx;

  await t.sendMail({
    from,
    to: opts.to,
    subject: `You've been invited to the ${opts.clientName} customer portal`,
    text:
      `Hi ${opts.name},\n\n` +
      `You've been invited to the ${opts.clientName} customer portal on OrderDesk.\n\n` +
      `Create your account using this email address (${opts.to}) to view your orders:\n${opts.signUpUrl}\n\n` +
      `— OrderDesk`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 4px">You've been invited to the customer portal</h2>
        <p style="color:#475569;margin:0 0 16px">Hi ${opts.name}, you now have portal access for <strong>${opts.clientName}</strong>.</p>
        <p style="color:#475569;margin:0 0 16px">Create your account with <strong>${opts.to}</strong> to view your orders and account details.</p>
        <a href="${opts.signUpUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Sign up to the portal
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">If you weren't expecting this, you can ignore this email.</p>
      </div>`,
  });
}

/**
 * Generic portal invite (lenders, affiliates). Links to the sign-up page where
 * the recipient creates an account with this email and reaches their portal.
 */
export async function sendRolePortalInvite(opts: {
  to: string;
  name: string;
  portalLabel: string; // e.g. "lender" / "affiliate"
  signUpUrl: string;
  userId?: string;
}): Promise<void> {
  const ctx = await getTransportForUser(opts.userId || null);
  if (!ctx) throw new Error("SMTP_NOT_CONFIGURED");
  const { transport: t, from } = ctx;

  await t.sendMail({
    from,
    to: opts.to,
    subject: `You've been invited to the OrderDesk ${opts.portalLabel} portal`,
    text:
      `Hi ${opts.name},\n\n` +
      `You've been invited to the OrderDesk ${opts.portalLabel} portal.\n\n` +
      `Create your account using this email address (${opts.to}) to sign in:\n${opts.signUpUrl}\n\n` +
      `— OrderDesk`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 4px">You've been invited to the ${opts.portalLabel} portal</h2>
        <p style="color:#475569;margin:0 0 16px">Hi ${opts.name}, create your account with <strong>${opts.to}</strong> to view your ${opts.portalLabel} dashboard.</p>
        <a href="${opts.signUpUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
          Sign up to the portal
        </a>
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">If you weren't expecting this, you can ignore this email.</p>
      </div>`,
  });
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Email an issued invoice (HTML) to the client's billing contact. */
export async function sendInvoiceEmail(opts: {
  to: string;
  recipientName: string;
  clientName: string;
  invoiceNumber: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  dueAt: Date | null;
  items: { description: string; quantity: number; lineTotalCents: number }[];
  userId?: string;
}): Promise<void> {
  const ctx = await getTransportForUser(opts.userId || null);
  if (!ctx) throw new Error("SMTP_NOT_CONFIGURED");
  const { transport: t, from } = ctx;

  const rows = opts.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#475569">${i.description} × ${i.quantity}</td>` +
        `<td style="padding:6px 0;text-align:right;color:#0f172a">${money(i.lineTotalCents, opts.currency)}</td></tr>`,
    )
    .join("");
  const due = opts.dueAt ? `<p style="color:#475569;margin:0 0 8px">Due by ${opts.dueAt.toLocaleDateString()}</p>` : "";

  await t.sendMail({
    from,
    to: opts.to,
    subject: `Invoice ${opts.invoiceNumber} from OrderDesk`,
    text:
      `Hi ${opts.recipientName},\n\n` +
      `Please find invoice ${opts.invoiceNumber} for ${opts.clientName}.\n` +
      `Subtotal: ${money(opts.subtotalCents, opts.currency)}\n` +
      `Tax: ${money(opts.taxCents, opts.currency)}\n` +
      `Total: ${money(opts.totalCents, opts.currency)}\n` +
      (opts.dueAt ? `Due: ${opts.dueAt.toLocaleDateString()}\n` : "") +
      `\n— OrderDesk`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 2px">Invoice ${opts.invoiceNumber}</h2>
        <p style="color:#64748b;margin:0 0 16px">For ${opts.clientName}</p>
        ${due}
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
          ${rows}
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tr><td style="padding:4px 0;color:#64748b">Subtotal</td><td style="padding:4px 0;text-align:right">${money(opts.subtotalCents, opts.currency)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Tax</td><td style="padding:4px 0;text-align:right">${money(opts.taxCents, opts.currency)}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700">${money(opts.totalCents, opts.currency)}</td></tr>
        </table>
        <p style="color:#94a3b8;font-size:12px;margin:20px 0 0">Thank you for your business.</p>
      </div>`,
  });
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
  const ctx = await getTransportForUser(opts.userId || null);
  if (!ctx) throw new Error("SMTP_NOT_CONFIGURED");

  const { transport: t, from } = ctx;
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
