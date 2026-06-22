import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { Principal } from "@/lib/auth/rbac";

export const updateProfileInput = z.object({
  name: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(50).optional().transform((v) => v?.trim() || null),
  jobTitle: z.string().max(200).optional().transform((v) => v?.trim() || null),
  avatarUrl: z.string().url("Must be a valid URL").max(2000).optional().transform((v) => v?.trim() || null),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export type ProfileDTO = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
};

export const profileService = {
  async getProfile(userId: string): Promise<ProfileDTO | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        jobTitle: users.jobTitle,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return row ?? null;
  },

  async updateProfile(principal: Principal, raw: unknown): Promise<ProfileDTO> {
    if (principal.kind !== "INTERNAL") throw new Error("FORBIDDEN");

    const input = updateProfileInput.parse(raw);

    const [row] = await db
      .update(users)
      .set({
        name: input.name,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        avatarUrl: input.avatarUrl ?? null,
      })
      .where(eq(users.id, principal.userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        jobTitle: users.jobTitle,
        avatarUrl: users.avatarUrl,
        role: users.role,
        createdAt: users.createdAt,
      });

    await writeAudit(principal, "user.profile_updated", "User", principal.userId, {
      name: input.name,
    });

    return row;
  },
};
