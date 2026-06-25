import type { NextConfig } from "next";

// Clerk (when AUTH_MODE=clerk) loads its widget + JS from its Frontend API host,
// talks to it over XHR/WebSocket, runs a web worker, serves avatars from
// img.clerk.com, and uses a Cloudflare Turnstile iframe for bot protection.
//
// The FAPI host differs per instance: dev uses *.clerk.accounts.dev; a production
// instance uses your custom domain (e.g. clerk.techwavesolutions.net). It's encoded
// in the publishable key (base64 of "<fapi-host>$"), so we derive it from the key —
// this keeps the CSP correct for BOTH dev and prod with no hardcoding.
const clerkMode = process.env.AUTH_MODE === "clerk";

function clerkFapiOrigin(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const m = pk.match(/^pk_(?:live|test)_(.+)$/);
  if (!m) return "";
  try {
    const host = Buffer.from(m[1], "base64").toString("utf8").replace(/\$+$/, "");
    return host ? ` https://${host}` : "";
  } catch {
    return "";
  }
}

const fapi = clerkMode ? clerkFapiOrigin() : "";
const clerk = {
  // Keep the *.clerk.accounts.dev wildcard so dev keys keep working even if the
  // key can't be decoded; `fapi` adds the exact (prod custom-domain) host.
  script: clerkMode ? `${fapi} https://*.clerk.accounts.dev https://challenges.cloudflare.com` : "",
  connect: clerkMode ? `${fapi} https://*.clerk.accounts.dev` : "",
  img: clerkMode ? " https://img.clerk.com" : "",
  worker: clerkMode ? `${fapi} https://*.clerk.accounts.dev` : "",
  frame: clerkMode ? " https://challenges.cloudflare.com" : "",
};

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'${clerk.script}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data:${clerk.img}`,
  `connect-src 'self'${clerk.connect}`,
  `worker-src 'self' blob:${clerk.worker}`,
  `frame-src 'self'${clerk.frame}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: csp,
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small Docker image.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    // Apply the strict CSP everywhere EXCEPT /api-docs, which serves Swagger UI
    // from a CDN and sets its own (relaxed) CSP in the route handler.
    return [{ source: "/((?!api-docs).*)", headers: securityHeaders }];
  },
};

export default nextConfig;
