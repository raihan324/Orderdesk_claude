/**
 * Authorization. A request resolves to exactly ONE principal:
 *   - an internal User (role-based), or
 *   - a portal Contact (scoped to its client, with per-contact permissions).
 *
 * Capability (role) + ownership (resource scope) are both enforced. Fails closed.
 * Pure logic — no I/O — so it is unit-testable.
 */

export type InternalRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "SALES_REP"
  | "SUPPORT_AGENT"
  | "FINANCE_USER"
  | "STAFF";

export type Principal =
  | {
      kind: "INTERNAL";
      userId: string;
      role: InternalRole;
      name: string;
    }
  | {
      kind: "PORTAL";
      contactId: string;
      clientId: string;
      name: string;
      canManageOrgSettings: boolean;
      canManagePortalUsers: boolean;
    };

export type Action =
  | "user.manage"
  | "client.read"
  | "client.manage"
  | "salesrep.assign"
  | "contact.manage"
  | "portal.invite"
  | "product.read"
  | "product.manage"
  | "order.read"
  | "order.manage"
  | "audit.read";

const ALL = new Set<InternalRole>(["SUPER_ADMIN", "ADMIN", "MANAGER"]);

/** Capability for internal roles. "own" means: gated by resource ownership. */
function internalScope(role: InternalRole, action: Action): "all" | "own" | false {
  switch (action) {
    case "user.manage":
      return role === "SUPER_ADMIN" ? "all" : false;
    case "client.read":
      return ALL.has(role) || ["SUPPORT_AGENT", "FINANCE_USER", "STAFF"].includes(role)
        ? "all"
        : role === "SALES_REP"
          ? "own"
          : false;
    case "client.manage":
    case "contact.manage":
    case "salesrep.assign":
      return ALL.has(role) ? "all" : role === "SALES_REP" && action !== "salesrep.assign" ? "own" : false;
    case "portal.invite":
      return ALL.has(role) ? "all" : role === "SALES_REP" ? "own" : false;
    case "product.read":
      return "all";
    case "product.manage":
      // Reserved to admins: regular (Manager) users create orders, not products.
      return role === "SUPER_ADMIN" || role === "ADMIN" ? "all" : false;
    case "order.read":
      return ALL.has(role) || ["FINANCE_USER", "SUPPORT_AGENT", "STAFF"].includes(role)
        ? "all"
        : role === "SALES_REP"
          ? "own"
          : false;
    case "order.manage":
      return ALL.has(role) ? "all" : role === "SALES_REP" ? "own" : false;
    case "audit.read":
      return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role) ? "all" : false;
    default:
      return false;
  }
}

export interface Ownership {
  /** sales rep assigned to the client/order */
  ownerSalesRepId?: string | null;
  /** client the resource belongs to */
  ownerClientId?: string | null;
}

export function can(p: Principal, action: Action, resource?: Ownership): boolean {
  if (p.kind === "PORTAL") {
    // Portal contacts can only read product catalog and their own client's data.
    if (action === "product.read") return true;
    if (action === "order.read") return resource?.ownerClientId === p.clientId;
    return false;
  }
  const scope = internalScope(p.role, action);
  if (scope === false) return false;
  if (scope === "all") return true;
  // own-scoped: prove ownership against the resource
  if (!resource) return false;
  return resource.ownerSalesRepId != null && resource.ownerSalesRepId === p.userId;
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Forbidden: not allowed to perform "${action}"`);
    this.name = "ForbiddenError";
  }
}

export function authorize(p: Principal, action: Action, resource?: Ownership): void {
  if (!can(p, action, resource)) throw new ForbiddenError(action);
}

/** For internal list queries: should results be limited to the rep's own clients? */
export function repScopeUserId(p: Principal, action: Action): string | null {
  if (p.kind !== "INTERNAL") return null;
  return internalScope(p.role, action) === "own" ? p.userId : null;
}
