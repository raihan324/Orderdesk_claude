import type { NextConfig } from "next";

// Clerk (when AUTH_MODE=clerk) loads its widget from *.clerk.accounts.dev, talks to
// its FAPI over XHR/WebSocket, runs a web worker, serves avatars from img.clerk.com,
// and uses a Cloudflare Turnstile iframe for bot protection. Whitelist exactly those.
const clerkMode = process.env.AUTH_MODE === "clerk";
const clerk = {
  script: clerkMode ? " https://*.clerk.accounts.dev https://challenges.cloudflare.com" : "",
  connect: clerkMode ? " https://*.clerk.accounts.dev" : "",
  img: clerkMode ? " https://img.clerk.com" : "",
  worker: clerkMode ? " https://*.clerk.accounts.dev" : "",
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
