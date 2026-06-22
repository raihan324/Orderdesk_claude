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

export type SmtpAuthMethod = "password" | "oauth2_google";

export type SmtpSettingsDTO = {
  id: string;
  userId: string;
  authMethod: SmtpAuthMethod;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // secrets (password / refresh token) are never included in DTOs
};

export type SmtpSettingsWithPassword = SmtpSettingsDTO & { smtpPassword: string };

/** Strip secrets and coerce the auth method into the DTO shape. */
function toDTO(row: typeof userSmtpSettings.$inferSelect): SmtpSettingsDTO {
  const { smtpPassword, oauthRefreshToken, authMethod, ...rest } = row;
  return { ...rest, authMethod: authMethod as SmtpAuthMethod };
}

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
    return toDTO(row);
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

    if (!row || !row.smtpPassword) return null;
    try {
      return {
        ...toDTO(row),
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
      // Update existing — switching to password auth clears any OAuth token.
      [row] = await db
        .update(userSmtpSettings)
        .set({
          authMethod: "password",
          smtpHost: parsed.smtpHost,
          smtpPort: parsed.smtpPort,
          smtpSecure: parsed.smtpSecure,
          smtpUsername: parsed.smtpUsername,
          smtpPassword: encrypted,
          oauthRefreshToken: null,
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          isActive: true,
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
          authMethod: "password",
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
      authMethod: "password",
    });

    return toDTO(row);
  },

  /**
   * Persist a Google OAuth2 connection for the current user. Stores only an
   * encrypted refresh token — never a password. Host/port are fixed to Gmail's
   * SMTP endpoint; the connected address is used as both username and sender.
   */
  async saveGoogleOAuth(
    principal: Principal,
    input: { refreshToken: string; email: string },
  ): Promise<SmtpSettingsDTO> {
    if (principal.kind !== "INTERNAL") throw new Error("FORBIDDEN");

    const encryptedToken = encrypt(input.refreshToken);
    const email = input.email.toLowerCase();
    const now = new Date();

    const existing = await db
      .select({ id: userSmtpSettings.id, fromName: userSmtpSettings.fromName })
      .from(userSmtpSettings)
      .where(eq(userSmtpSettings.userId, principal.userId))
      .limit(1);

    let row;
    if (existing.length > 0) {
      [row] = await db
        .update(userSmtpSettings)
        .set({
          authMethod: "oauth2_google",
          smtpHost: "smtp.gmail.com",
          smtpPort: 465,
          smtpSecure: true,
          smtpUsername: email,
          smtpPassword: null,
          oauthRefreshToken: encryptedToken,
          fromEmail: email,
          // keep the existing display name if set, else default to the address
          fromName: existing[0].fromName || email,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(userSmtpSettings.userId, principal.userId))
        .returning();
    } else {
      [row] = await db
        .insert(userSmtpSettings)
        .values({
          userId: principal.userId,
          authMethod: "oauth2_google",
          smtpHost: "smtp.gmail.com",
          smtpPort: 465,
          smtpSecure: true,
          smtpUsername: email,
          smtpPassword: null,
          oauthRefreshToken: encryptedToken,
          fromName: principal.name || email,
          fromEmail: email,
          isActive: true,
        })
        .returning();
    }

    await writeAudit(principal, "smtp_settings_updated", "SMTPSettings", row.id, {
      authMethod: "oauth2_google",
      email,
    });

    return toDTO(row);
  },

  /**
   * Disconnect a user's SMTP config entirely (password or OAuth).
   */
  async disconnect(principal: Principal): Promise<void> {
    if (principal.kind !== "INTERNAL") throw new Error("FORBIDDEN");
    await db.delete(userSmtpSettings).where(eq(userSmtpSettings.userId, principal.userId));
    await writeAudit(principal, "smtp_settings_disconnected", "SMTPSettings", principal.userId, {});
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
   * Verify the user's *saved* SMTP config (password or OAuth). Use this to test
   * a connection that's already stored — e.g. an OAuth connection that has no
   * password to re-enter. Throws on failure.
   */
  async verifySaved(userId: string): Promise<{ success: boolean }> {
    const transporter = await smtpSettingsService.createTransporter(userId);
    if (!transporter) throw new Error("SMTP_NOT_CONFIGURED");
    try {
      await transporter.verify();
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      throw new Error(`SMTP_TEST_FAILED: ${msg}`);
    }
  },

  /**
   * Create a transporter for a user's SMTP settings. Returns null if user
   * has not configured SMTP or it's disabled. Handles both password and
   * Google OAuth2 (XOAUTH2) auth methods.
   */
  async createTransporter(userId: string): Promise<Transporter | null> {
    const [row] = await db
      .select()
      .from(userSmtpSettings)
      .where(eq(userSmtpSettings.userId, userId))
      .limit(1);

    if (!row || !row.isActive) return null;

    // Google OAuth2: nodemailer mints a short-lived access token from the
    // refresh token + client credentials on each send.
    if (row.authMethod === "oauth2_google") {
      if (!row.oauthRefreshToken) return null;
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error("[smtp] Google OAuth not configured but user has oauth2_google settings");
        return null;
      }
      let refreshToken: string;
      try {
        refreshToken = decrypt(row.oauthRefreshToken);
      } catch {
        console.error("[smtp] failed to decrypt OAuth refresh token for user", userId);
        return null;
      }
      return nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          type: "OAuth2",
          user: row.smtpUsername,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken,
        },
      });
    }

    // Classic password auth.
    if (!row.smtpPassword) return null;
    let pass: string;
    try {
      pass = decrypt(row.smtpPassword);
    } catch {
      console.error("[smtp] failed to decrypt password for user", userId);
      return null;
    }
    return nodemailer.createTransport({
      host: row.smtpHost,
      port: row.smtpPort,
      secure: row.smtpSecure,
      auth: { user: row.smtpUsername, pass },
    });
  },
};
