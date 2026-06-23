import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { profileService } from "@/server/services/profile.service";
import { ProfileForm } from "@/components/profile-form";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const p = await getPrincipal();
  if (!p || p.kind !== "INTERNAL") redirect("/sign-in");

  const profile = await profileService.getProfile(p.userId);
  if (!profile) redirect("/sign-in");

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-1">Profile</h2>
      <p className="text-sm text-slate-500 mb-6">
        Update your personal information visible to administrators.
      </p>
      <ProfileForm profile={profile} />
    </Card>
  );
}
