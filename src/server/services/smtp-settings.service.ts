import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSmtpSettings } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";
import { authorize, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";
import nodemailer, { type Transporter } from "nodemailer";

export const updateSmtpSettingsInput = z.object({
  smtpHost: z.string().min(1, "SMTP host required"),
  smtpPort: z.coerce.number().int().min(1).max(65535, "Port must be 1-65535"),
  smtpSecure: z.boolean().default(true),
  smtpUsername: z.string().min(1, "SMTP username required"),
  smtpPassword: z.string().min(1, "SMTP password required"),
  fromName: z.string().min(1, "From name required"),
  fromEmail: z.string().email("Invalid email address"),
});
export type UpdateSmtpSettingsInput = z.infer<typeof updateSmtpSettingsInput>;

export type SmtpSettingsDTO = {
  id: string;
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // password is never included in DTOs
};

export type SmtpSettingsWithPassword = SmtpSettingsDTO & { smtpPassword: string };

export const smtpSettingsService = {
  /**
   * Get SMTP settings for a user (no password). Returns null if not configured.
   */
  async getSettings(userId: string): Promise<SmtpSettingsDTO | null> {
    const [row] = await db
      .select()
      .from(userSmtpSettings)
      .where(eq(userSmtpSettings.userId, userId))
      .limit(1);

    if (!row) return null;
    const { smtpPassword, ...rest } = row;
    return rest;
  },

  /**
   * Get SMTP settings with decrypted password (internal use only, in service layer).
   * Caller must verify ownership before calling this.
   */
  async getSettingsWithPassword(userId: string): Promise<SmtpSettingsWithPassword | null> {
    const [row] = await db
      .select()
      .from(userSmtpSettings)
      .where(eq(userSmtpSettings.userId, userId))
      .limit(1);

    if (!row) return null;
    try {
      return {
        ...row,
        smtpPassword: decrypt(row.smtpPassword),
      };
    } catch {
      console.error("[smtp] failed to decrypt password for user", userId);
      return null;
    }
  },

  /**
   * Update SMTP settings. Only the owner can update their own settings.
   */
  async updateSettings(principal: Principal, input: unknown): Promise<SmtpSettingsDTO> {
    if (principal.kind !== "INTERNAL") throw new Error("FORBIDDEN");

    const parsed = updateSmtpSettingsInput.parse(input);

    const existing = await db
      .select({ id: userSmtpSettings.id })
      .from(userSmtpSettings)
      .where(eq(userSmtpSettings.userId, principal.userId))
      .limit(1);

    const encrypted = encrypt(parsed.smtpPassword);
    const now = new Date();

    let row;
    if (existing.length > 0) {
      // Update existing
      [row] = await db
        .update(userSmtpSettings)
        .set({
          smtpHost: parsed.smtpHost,
          smtpPort: parsed.smtpPort,
          smtpSecure: parsed.smtpSecure,
          smtpUsername: parsed.smtpUsername,
          smtpPassword: encrypted,
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          updatedAt: now,
        })
        .where(eq(userSmtpSettings.userId, principal.userId))
        .returning();
    } else {
      // Create new
      [row] = await db
        .insert(userSmtpSettings)
        .values({
          userId: principal.userId,
          smtpHost: parsed.smtpHost,
          smtpPort: parsed.smtpPort,
          smtpSecure: parsed.smtpSecure,
          smtpUsername: parsed.smtpUsername,
          smtpPassword: encrypted,
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          isActive: true,
        })
        .returning();
    }

    await writeAudit(principal, "smtp_settings_updated", "SMTPSettings", row.id, {
      host: parsed.smtpHost,
      port: parsed.smtpPort,
    });

    const { smtpPassword, ...rest } = row;
    return rest;
  },

  /**
   * Test SMTP connectivity. Does NOT save settings; just validates they work.
   * Returns { success: true } or throws with error details.
   */
  async testConnection(input: unknown): Promise<{ success: boolean }> {
    const parsed = updateSmtpSettingsInput.parse(input);

    let transporter: Transporter;
    try {
      transporter = nodemailer.createTransport({
        host: parsed.smtpHost,
        port: parsed.smtpPort,
        secure: parsed.smtpSecure,
        auth: {
          user: parsed.smtpUsername,
          pass: parsed.smtpPassword,
        },
      });

      await transporter.verify();
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`SMTP_TEST_FAILED: ${msg}`);
    }
  },

  /**
   * Create a transporter for a user's SMTP settings. Returns null if user
   * has not configured SMTP or it's disabled.
   */
  async createTransporter(userId: string): Promise<Transporter | null> {
    const settings = await smtpSettingsService.getSettingsWithPassword(userId);
    if (!settings || !settings.isActive) return null;

    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: {
        user: settings.smtpUsername,
        pass: settings.smtpPassword,
      },
    });
  },
};
