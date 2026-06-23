/** Shared badge color maps for status enums (kept out of route files, since
 *  Next.js page modules may only export reserved names like `default`). */

export const LOAN_STATUS_STYLE: Record<string, string> = {
  APPLIED: "bg-slate-100 text-slate-600",
  UNDER_REVIEW: "bg-amber-100 text-amber-700",
  SANCTIONED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-rose-100 text-rose-700",
  DISBURSED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-slate-200 text-slate-500",
};

export const INVOICE_STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ISSUED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-rose-100 text-rose-700",
  VOID: "bg-slate-200 text-slate-500",
};

export const AFFILIATE_STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
};

export const COMMISSION_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  REVERSED: "bg-slate-200 text-slate-500",
};
