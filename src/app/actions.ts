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
import { smtpSettingsService } from "@/server/services/smtp-settings.service";
import { profileService } from "@/server/services/profile.service";

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

export async function createOrderAction(formData: FormData) {
  const p = await requirePrincipal();
  const clientId = String(formData.get("clientId"));
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const items = productIds
    .map((productId, i) => ({ productId, quantity: Number(quantities[i] || 0) }))
    .filter((it) => it.productId && it.quantity > 0);
  const input = createOrderInput.parse({ clientId, items });
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
  revalidatePath("/settings");
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
  revalidatePath("/settings");
}

export async function disconnectSmtpAction() {
  const p = await requirePrincipal();
  await smtpSettingsService.disconnect(p);
  revalidatePath("/settings");
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
