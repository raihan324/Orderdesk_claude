import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * DEV-ONLY sign-in. Sets a cookie identifying the chosen principal.
 * In production (AUTH_MODE=clerk) this route is disabled and Clerk handles auth.
 */
export async function GET(req: NextRequest) {
  if (process.env.AUTH_MODE === "clerk") {
    return NextResponse.json({ error: "Dev auth disabled in clerk mode" }, { status: 403 });
  }
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  if (url.searchParams.get("signout")) {
    const res = NextResponse.redirect(new URL("/sign-in", base));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  const as = url.searchParams.get("as"); // "INTERNAL:<id>" | "PORTAL:<id>" | "LENDER:<id>" | "AFFILIATE:<id>"
  if (!as || !/^(INTERNAL|PORTAL|LENDER|AFFILIATE):/.test(as)) {
    return NextResponse.json({ error: "Missing or invalid 'as' param" }, { status: 400 });
  }
  const dest = as.startsWith("INTERNAL")
    ? "/dashboard"
    : as.startsWith("LENDER")
      ? "/portal/lender"
      : as.startsWith("AFFILIATE")
        ? "/portal/affiliate"
        : "/portal";
  const res = NextResponse.redirect(new URL(dest, base));
  res.cookies.set(SESSION_COOKIE, as, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
