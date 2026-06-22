"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { productService, createProductInput } from "@/server/services/product.service";
import { orderService, createOrderInput } from "@/server/services/order.service";
import { clientService } from "@/server/services/client.service";
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

export async function assignRepAction(formData: FormData) {
  const p = await requirePrincipal();
  const clientId = String(formData.get("clientId"));
  const repId = formData.get("repId") ? String(formData.get("repId")) : null;
  await clientService.assignRep(p, clientId, repId);
  revalidatePath(`/clients/${clientId}`);
}

export async function inviteContactAction(formData: FormData) {
  const p = await requirePrincipal();
  const contactId = String(formData.get("contactId"));
  const clientId = String(formData.get("clientId"));
  await clientService.inviteContact(p, contactId);
  revalidatePath(`/clients/${clientId}`);
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
