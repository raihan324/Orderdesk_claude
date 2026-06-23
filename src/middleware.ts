import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that are always accessible without a Clerk session.
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/api/dev-auth(.*)",
  "/api/webhooks(.*)",
  // REST API authenticates itself via X-API-Key (or its own Bearer check), so
  // Clerk's session guard must not block it.
  "/api/v1(.*)",
]);

// Protect all non-public routes when running in Clerk mode.
// In dev mode, every route passes through so the local cookie auth works.
const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) {
    await auth.protect();
  }
});

const devHandler = () => NextResponse.next();

export default process.env.AUTH_MODE === "clerk" ? clerkHandler : devHandler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
