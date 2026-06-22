import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (process.env.AUTH_MODE !== "clerk") redirect("/sign-in");
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <SignUp />
    </div>
  );
}