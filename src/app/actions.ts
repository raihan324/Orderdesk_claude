"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { sendTestEmail } from "@/server/mailer";
import { productService, createProductInput } from "@/server/services/product.service";
import { orderService, createOrderInput } from "@/server/services/order.service";
import {
  clientService,
  createClientInput,
  addContactInput,
  updateContactInput,
  updateOwnContactInput,
} from "@/server/services/client.service";
import { userService } from "@/server/services/user.service";
import { smtpSettingsService, orgSmtpService } from "@/server/services/smtp-settings.service";
import { profileService } from "@/server/services/profile.service";
import {
  loanService,
  createLoanInput,
  sanctionLoanInput,
  createLenderInput,
  updateOwnLenderInput,
} from "@/server/services/loan.service";
import {
  affiliateService,
  createAffiliateInput,
  updateAffiliateInput,
  updateOwnAffiliateInput,
} from "@/server/services/affiliate.service";
import { sendRolePortalInvite } from "@/server/mailer";
import { apiKeyService, createApiKeyInput } from "@/server/services/api-key.service";
import {
  invoiceService,
  createInvoiceInput,
  issueInvoiceInput,
  recordPaymentInput,
} from "@/server/services/invoice.service";

export async function createProductAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createProductInput.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    unitPrice: formData.get("unitPrice"),
    stock: formData.get("stock") || 0,
  });
  await productService.create(p, input);
  revalidatePath("/products");
}

export async function createClientAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createClientInput.parse({
    type: formData.get("type"),
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
    website: formData.get("website") || undefined,
    salesRepId: formData.get("salesRepId") || undefined,
  });
  const client = await clientService.create(p, input);
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function assignRepAction(formData: FormData) {
  const p = await requirePrincipal();
  const clientId = String(formData.get("clientId"));
  const repId = formData.get("repId") ? String(formData.get("repId")) : null;
  await clientService.assignRep(p, clientId, repId);
  revalidatePath(`/clients/${clientId}`);
}

export async function addContactAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = addContactInput.parse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email"),
    type: formData.get("type") || "OTHER",
    jobTitle: formData.get("jobTitle") || undefined,
    phone: formData.get("phone") || undefined,
  });
  await clientService.addContact(p, input);
  revalidatePath(`/clients/${input.clientId}`);
}

export async function updateContactAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = updateContactInput.parse({
    contactId: formData.get("contactId"),
    name: formData.get("name"),
    email: formData.get("email"),
    type: formData.get("type"),
    jobTitle: formData.get("jobTitle") || undefined,
    phone: formData.get("phone") || undefined,
    department: formData.get("department") || undefined,
    position: formData.get("position") || undefined,
    canManageOrgSettings: formData.get("canManageOrgSettings") === "on",
    canManagePortalUsers: formData.get("canManagePortalUsers") === "on",
  });
  const contact = await clientService.updateContact(p, input);
  revalidatePath(`/clients/${contact.clientId}/contacts/${contact.id}`);
  redirect(`/clients/${contact.clientId}/contacts/${contact.id}`);
}

export async function updatePortalProfileAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = updateOwnContactInput.parse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    department: formData.get("department") || undefined,
    position: formData.get("position") || undefined,
    timezone: formData.get("timezone") || undefined,
    currency: formData.get("currency") || undefined,
    language: formData.get("language") || undefined,
  });
  await clientService.updateOwnContact(p, input);
  revalidatePath("/portal");
}

export async function inviteContactAction(formData: FormData) {
  const p = await requirePrincipal();
  const contactId = String(formData.get("contactId"));
  const clientId = String(formData.get("clientId"));
  const { emailed } = await clientService.inviteContact(p, contactId);
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?portal_invite=${emailed ? "sent" : "off"}`);
}

/* ----------------------------------------------------------- invoices */
export async function createInvoiceFromOrderAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createInvoiceInput.parse({
    orderId: formData.get("orderId"),
    notes: formData.get("notes") || undefined,
    dueAt: formData.get("dueAt") || undefined,
  });
  const invoice = await invoiceService.createFromOrder(p, input);
  revalidatePath("/invoices");
  redirect(`/invoices/${invoice.id}`);
}

export async function issueInvoiceAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = issueInvoiceInput.parse({
    invoiceId: formData.get("invoiceId"),
    dueAt: formData.get("dueAt") || undefined,
  });
  const { emailed } = await invoiceService.issue(p, input);
  revalidatePath(`/invoices/${input.invoiceId}`);
  redirect(`/invoices/${input.invoiceId}?issued=${emailed ? "emailed" : "no_email"}`);
}

export async function recordInvoicePaymentAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = recordPaymentInput.parse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    method: formData.get("method") || "BANK_TRANSFER",
    reference: formData.get("reference") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    note: formData.get("note") || undefined,
  });
  await invoiceService.recordPayment(p, input);
  revalidatePath(`/invoices/${input.invoiceId}`);
}

export async function voidInvoiceAction(formData: FormData) {
  const p = await requirePrincipal();
  const id = String(formData.get("invoiceId"));
  await invoiceService.voidInvoice(p, id);
  revalidatePath(`/invoices/${id}`);
}

export async function createOrderAction(formData: FormData) {
  const p = await requirePrincipal();
  const clientId = String(formData.get("clientId"));
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const items = productIds
    .map((productId, i) => ({ productId, quantity: Number(quantities[i] || 0) }))
    .filter((it) => it.productId && it.quantity > 0);
  const affiliateCode = formData.get("affiliateCode") ? String(formData.get("affiliateCode")) : undefined;
  const input = createOrderInput.parse({ clientId, affiliateCode, items });
  await orderService.create(p, input);
  revalidatePath("/orders");
}

export async function inviteUserAction(formData: FormData) {
  const p = await requirePrincipal();
  let dest: string;
  try {
    const { user, emailed } = await userService.invite(p, {
      email: formData.get("email"),
      name: formData.get("name"),
      role: formData.get("role"),
    });
    dest = `/users?invited=${encodeURIComponent(user.email)}&mail=${emailed ? "sent" : "off"}`;
  } catch (e) {
    const code = e instanceof Error && e.message === "EMAIL_EXISTS" ? "email_exists" : "invite_failed";
    dest = `/users?error=${code}`;
  }
  revalidatePath("/users");
  redirect(dest); // outside try/catch so the redirect signal propagates
}

export async function updateUserRoleAction(formData: FormData) {
  const p = await requirePrincipal();
  await userService.updateRole(p, {
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  revalidatePath("/users");
}

export async function updateUserStatusAction(formData: FormData) {
  const p = await requirePrincipal();
  await userService.updateStatus(p, {
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  revalidatePath("/users");
}

export async function updateProfileAction(formData: FormData) {
  const p = await requirePrincipal();
  await profileService.updateProfile(p, {
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    jobTitle: formData.get("jobTitle") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined,
  });
  revalidatePath("/settings/profile");
}

/* ------------------------------------------------- organization API keys */
export async function createApiKeyAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createApiKeyInput.parse({
    name: formData.get("name"),
    role: formData.get("role") || "ADMIN",
    expiresAt: formData.get("expiresAt") || undefined,
  });
  const { key, plaintext } = await apiKeyService.create(p, input);
  revalidatePath("/settings/api-keys");
  // Returned to the client so the plaintext can be shown exactly once.
  return { plaintext, name: key.name };
}

export async function revokeApiKeyAction(formData: FormData) {
  const p = await requirePrincipal();
  await apiKeyService.revoke(p, String(formData.get("id")));
  revalidatePath("/settings/api-keys");
}

/* ------------------------------------------------------------- loan module */
export async function createLoanAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createLoanInput.parse({
    borrowerClientId: formData.get("borrowerClientId"),
    lenderId: formData.get("lenderId") || undefined,
    principal: formData.get("principal"),
    currency: formData.get("currency") || "USD",
    purpose: formData.get("purpose") || undefined,
    tenureMonths: formData.get("tenureMonths"),
    interestRatePct: formData.get("interestRatePct"),
  });
  const loan = await loanService.createApplication(p, input);
  revalidatePath("/loans");
  redirect(`/loans/${loan.id}`);
}

export async function sanctionLoanAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = sanctionLoanInput.parse({
    loanId: formData.get("loanId"),
    lenderId: formData.get("lenderId") || undefined,
    sanctionedAmount: formData.get("sanctionedAmount"),
    interestRatePct: formData.get("interestRatePct"),
    tenureMonths: formData.get("tenureMonths"),
  });
  await loanService.sanction(p, input);
  revalidatePath(`/loans/${input.loanId}`);
}

export async function rejectLoanAction(formData: FormData) {
  const p = await requirePrincipal();
  const loanId = String(formData.get("loanId"));
  await loanService.reject(p, loanId, String(formData.get("reason") || ""));
  revalidatePath(`/loans/${loanId}`);
}

export async function disburseLoanAction(formData: FormData) {
  const p = await requirePrincipal();
  const loanId = String(formData.get("loanId"));
  await loanService.disburse(p, loanId);
  revalidatePath(`/loans/${loanId}`);
}

export async function createLenderAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createLenderInput.parse({
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail") || "",
    contactPhone: formData.get("contactPhone") || undefined,
  });
  await loanService.createLender(p, input);
  revalidatePath("/lenders");
}

/* -------------------------------------------------------- affiliate module */
export async function createAffiliateAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = createAffiliateInput.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    commissionRatePct: formData.get("commissionRatePct") || 5,
  });
  const affiliate = await affiliateService.create(p, input);
  revalidatePath("/affiliates");
  redirect(`/affiliates/${affiliate.id}`);
}

export async function updateAffiliateAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = updateAffiliateInput.parse({
    affiliateId: formData.get("affiliateId"),
    name: formData.get("name"),
    email: formData.get("email"),
    commissionRatePct: formData.get("commissionRatePct"),
    status: formData.get("status"),
  });
  await affiliateService.update(p, input);
  revalidatePath(`/affiliates/${input.affiliateId}`);
}

export async function setCommissionStatusAction(formData: FormData) {
  const p = await requirePrincipal();
  const commissionId = String(formData.get("commissionId"));
  const status = String(formData.get("status")) as "APPROVED" | "PAID" | "REVERSED";
  await affiliateService.setCommissionStatus(p, commissionId, status);
  revalidatePath("/commissions");
  revalidatePath("/affiliates");
}

/* ----------------------------------------------- lender / affiliate portal */
export async function inviteLenderPortalAction(formData: FormData) {
  const p = await requirePrincipal();
  const lenderId = String(formData.get("lenderId"));
  let status = "sent";
  try {
    const lender = await loanService.invitePortal(p, lenderId);
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      await sendRolePortalInvite({
        to: lender.contactEmail!,
        name: lender.name,
        portalLabel: "lender",
        signUpUrl: `${base}/sign-up`,
        userId: p.kind === "INTERNAL" ? p.userId : undefined,
      });
    } catch {
      status = "off";
    }
  } catch (e) {
    status = e instanceof Error && e.message === "LENDER_EMAIL_REQUIRED" ? "no_email" : "failed";
  }
  revalidatePath("/lenders");
  redirect(`/lenders?portal_invite=${status}`);
}

export async function inviteAffiliatePortalAction(formData: FormData) {
  const p = await requirePrincipal();
  const affiliateId = String(formData.get("affiliateId"));
  let status = "sent";
  try {
    const affiliate = await affiliateService.invitePortal(p, affiliateId);
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      await sendRolePortalInvite({
        to: affiliate.email,
        name: affiliate.name,
        portalLabel: "affiliate",
        signUpUrl: `${base}/sign-up`,
        userId: p.kind === "INTERNAL" ? p.userId : undefined,
      });
    } catch {
      status = "off";
    }
  } catch {
    status = "failed";
  }
  revalidatePath(`/affiliates/${affiliateId}`);
  redirect(`/affiliates/${affiliateId}?portal_invite=${status}`);
}

export async function updateOwnLenderAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = updateOwnLenderInput.parse({
    name: formData.get("name"),
    contactEmail: formData.get("contactEmail") || "",
    contactPhone: formData.get("contactPhone") || undefined,
  });
  await loanService.updateOwnLender(p, input);
  revalidatePath("/portal/lender");
}

export async function updateOwnAffiliateAction(formData: FormData) {
  const p = await requirePrincipal();
  const input = updateOwnAffiliateInput.parse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  await affiliateService.updateOwnAffiliate(p, input);
  revalidatePath("/portal/affiliate");
}

export async function updateSmtpSettingsAction(formData: FormData) {
  const p = await requirePrincipal();
  await smtpSettingsService.updateSettings(p, {
    smtpHost: formData.get("smtpHost"),
    smtpPort: formData.get("smtpPort"),
    smtpSecure: formData.get("smtpSecure") === "on",
    smtpUsername: formData.get("smtpUsername"),
    smtpPassword: formData.get("smtpPassword"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
  });
  revalidatePath("/settings/smtp");
}

export async function disconnectSmtpAction() {
  const p = await requirePrincipal();
  await smtpSettingsService.disconnect(p);
  revalidatePath("/settings/smtp");
}

/* --------------------------------------- organization SMTP (SUPER_ADMIN) */
function readSmtpForm(formData: FormData) {
  return {
    smtpHost: formData.get("smtpHost"),
    smtpPort: formData.get("smtpPort"),
    smtpSecure: formData.get("smtpSecure") === "on",
    smtpUsername: formData.get("smtpUsername"),
    smtpPassword: formData.get("smtpPassword"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
  };
}

export async function updateOrgSmtpAction(formData: FormData) {
  const p = await requirePrincipal();
  await orgSmtpService.update(p, readSmtpForm(formData));
  revalidatePath("/settings/org-smtp");
}

export async function testOrgSmtpAction(formData: FormData) {
  await orgSmtpService.testConnection(readSmtpForm(formData));
}

export async function disconnectOrgSmtpAction() {
  const p = await requirePrincipal();
  await orgSmtpService.disconnect(p);
  revalidatePath("/settings/org-smtp");
}

export async function testSavedSmtpAction() {
  const p = await requirePrincipal();
  if (p.kind !== "INTERNAL") throw new Error("FORBIDDEN");
  await smtpSettingsService.verifySaved(p.userId);
}

const sendTestEmailInput = z.object({
  to: z.string().email("Enter a valid recipient email"),
  subject: z.string().min(1, "Subject required").max(200),
  html: z.string().min(1, "Message body required").max(50_000),
});

export async function sendTestEmailAction(formData: FormData) {
  const p = await requirePrincipal();
  if (p.kind !== "INTERNAL") throw new Error("FORBIDDEN");

  const input = sendTestEmailInput.parse({
    to: formData.get("to"),
    subject: formData.get("subject"),
    html: formData.get("html"),
  });

  await sendTestEmail({ ...input, userId: p.userId });
}

/** Richer schema for the advanced composer (CC/BCC, larger body, attachments). */
const sendEmailFullInput = z.object({
  to: z.string().email("Enter a valid recipient email"),
  subject: z.string().min(1, "Subject required").max(300),
  html: z.string().min(1, "Message body required").max(500_000),
});

const emailAttachmentSchema = z
  .array(
    z.object({
      filename: z.string().min(1).max(255),
      contentType: z.string().max(150).optional(),
      contentBase64: z.string().min(1).max(20_000_000),
    }),
  )
  .max(15);

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB total

/** Split a "a@x.com, b@y.com; c@z.com" field into validated email addresses. */
function parseEmailList(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  const list = String(raw)
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const bad = list.find((e) => !z.string().email().safeParse(e).success);
  if (bad) throw new Error(`Invalid email address: ${bad}`);
  return list;
}

/** Generic "send mail" used by the Send-mail button on entity detail pages. */
export async function sendEmailAction(formData: FormData) {
  const p = await requirePrincipal();
  if (p.kind !== "INTERNAL") throw new Error("FORBIDDEN");

  const input = sendEmailFullInput.parse({
    to: formData.get("to"),
    subject: formData.get("subject"),
    html: formData.get("html"),
  });

  const cc = parseEmailList(formData.get("cc"));
  const bcc = parseEmailList(formData.get("bcc"));

  let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
  const rawAttachments = formData.get("attachments");
  if (rawAttachments) {
    const parsed = emailAttachmentSchema.parse(JSON.parse(String(rawAttachments)));
    const totalBytes = parsed.reduce((sum, a) => sum + Math.ceil((a.contentBase64.length * 3) / 4), 0);
    if (totalBytes > MAX_ATTACHMENT_BYTES) throw new Error("Attachments exceed the 20MB limit.");
    attachments = parsed.map((a) => ({
      filename: a.filename,
      content: a.contentBase64,
      contentType: a.contentType,
    }));
  }

  await sendTestEmail({ ...input, cc, bcc, attachments, userId: p.userId });
}

export async function testSmtpConnectionAction(formData: FormData) {
  await smtpSettingsService.testConnection({
    smtpHost: formData.get("smtpHost"),
    smtpPort: formData.get("smtpPort"),
    smtpSecure: formData.get("smtpSecure") === "on",
    smtpUsername: formData.get("smtpUsername"),
    smtpPassword: formData.get("smtpPassword"),
    fromName: formData.get("fromName"),
    fromEmail: formData.get("fromEmail"),
  });
}
