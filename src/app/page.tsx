import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  redirect(p.kind === "INTERNAL" ? "/dashboard" : "/portal");
}
