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
    }
  | {
      // Lender portal — read-only access to their own loans.
      kind: "LENDER";
      lenderId: string;
      name: string;
    }
  | {
      // Affiliate portal — read-only access to their own commissions.
      kind: "AFFILIATE";
      affiliateId: string;
      name: string;
    }
  | {
      // Organization API key — machine principal acting with a fixed role ("all" scope).
      kind: "SERVICE";
      apiKeyId: string;
      role: InternalRole;
      name: string;
    };

export type Action =
  | "user.manage"
  | "apikey.manage"
  | "org.manage"
  | "client.read"
  | "client.manage"
  | "salesrep.assign"
  | "contact.manage"
  | "portal.invite"
  | "product.read"
  | "product.manage"
  | "order.read"
  | "order.manage"
  | "invoice.read"
  | "invoice.manage"
  | "loan.read"
  | "loan.manage"
  | "loan.sanction"
  | "affiliate.read"
  | "affiliate.manage"
  | "commission.manage"
  | "audit.read";

const ALL = new Set<InternalRole>(["SUPER_ADMIN", "ADMIN", "MANAGER"]);

/** Capability for internal roles. "own" means: gated by resource ownership. */
function internalScope(role: InternalRole, action: Action): "all" | "own" | false {
  switch (action) {
    case "user.manage":
      return role === "SUPER_ADMIN" ? "all" : false;
    case "apikey.manage":
      // Organization API keys are minted/managed by SUPER_ADMIN only.
      return role === "SUPER_ADMIN" ? "all" : false;
    case "org.manage":
      // Organization-level settings (e.g. org SMTP) — SUPER_ADMIN only.
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
    case "invoice.read":
      // Billing visibility: management + finance + support/staff see all; reps own.
      return ALL.has(role) || ["FINANCE_USER", "SUPPORT_AGENT", "STAFF"].includes(role)
        ? "all"
        : role === "SALES_REP"
          ? "own"
          : false;
    case "invoice.manage":
      // Create / issue / pay / void — management + finance; reps for their own clients.
      return ALL.has(role) || role === "FINANCE_USER" ? "all" : role === "SALES_REP" ? "own" : false;
    case "loan.read":
      // Sales reps see loans they originated; finance + management see all.
      return ALL.has(role) || role === "FINANCE_USER" ? "all" : role === "SALES_REP" ? "own" : false;
    case "loan.manage":
      // Create / edit loan applications.
      return ALL.has(role) ? "all" : role === "SALES_REP" ? "own" : false;
    case "loan.sanction":
      // Sanction / reject / disburse — the lender authority.
      return role === "SUPER_ADMIN" || role === "ADMIN" || role === "FINANCE_USER" ? "all" : false;
    case "affiliate.read":
      return ALL.has(role) || role === "FINANCE_USER" ? "all" : false;
    case "affiliate.manage":
      // Create / edit affiliates and their referral codes.
      return ALL.has(role) ? "all" : false;
    case "commission.manage":
      // Approve / pay / reverse commission payouts — finance authority.
      return role === "SUPER_ADMIN" || role === "ADMIN" || role === "FINANCE_USER" ? "all" : false;
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
  /** lender the resource (loan) belongs to */
  ownerLenderId?: string | null;
  /** affiliate the resource (commission) belongs to */
  ownerAffiliateId?: string | null;
}

export function can(p: Principal, action: Action, resource?: Ownership): boolean {
  if (p.kind === "PORTAL") {
    // Portal contacts can only read product catalog and their own client's data.
    if (action === "product.read") return true;
    if (action === "order.read") return resource?.ownerClientId === p.clientId;
    return false;
  }
  if (p.kind === "LENDER") {
    // Lender portal: read only their own loans. Everything else denied.
    return action === "loan.read" && resource?.ownerLenderId === p.lenderId;
  }
  if (p.kind === "AFFILIATE") {
    // Affiliate portal: read only their own affiliate/commission data.
    return action === "affiliate.read" && resource?.ownerAffiliateId === p.affiliateId;
  }
  if (p.kind === "SERVICE") {
    // Org API key: acts with its assigned role at "all" scope. Never allowed to
    // manage users or other API keys, even if minted with a SUPER_ADMIN role.
    if (action === "user.manage" || action === "apikey.manage" || action === "org.manage") return false;
    return internalScope(p.role, action) === "all";
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
