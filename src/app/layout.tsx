import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderDesk — Ordering & Client Management",
  description: "B2B/B2C ordering and client management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const html = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  // ClerkProvider is only mounted in clerk mode, so dev mode needs no keys.
  return process.env.AUTH_MODE === "clerk" ? <ClerkProvider>{html}</ClerkProvider> : html;
}
