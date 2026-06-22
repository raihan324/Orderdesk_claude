import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk middleware only runs in clerk mode; dev mode passes through untouched.
const handler =
  process.env.AUTH_MODE === "clerk" ? clerkMiddleware() : () => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
