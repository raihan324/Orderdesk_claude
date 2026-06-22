import { randomBytes } from "node:crypto";

/** Compact, URL-safe, collision-resistant id. Avoids an extra dependency. */
export function createId(): string {
  return (
    Date.now().toString(36) + randomBytes(8).toString("hex")
  );
}
