import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white", className)} {...props} />;
}

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", className)}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "outline" | "ghost" }) {
  const v = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    outline: "border border-slate-200 text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40",
        v,
        className,
      )}
      {...props}
    />
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">{children}</table>
    </div>
  );
}
export const THead = ({ children }: { children: React.ReactNode }) => (
  <thead className="border-b border-slate-100 bg-slate-50">{children}</thead>
);
export const TBody = ({ children }: { children: React.ReactNode }) => (
  <tbody className="divide-y divide-slate-50">{children}</tbody>
);
export const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th
    className={cn(
      "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-400",
      className,
    )}
  >
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cn("px-4 py-3 align-middle text-sm text-slate-700", className)}>{children}</td>
);

export const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-indigo-100 text-indigo-700",
  FULFILLED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INVITED: "bg-sky-100 text-sky-700",
  PENDING: "bg-amber-100 text-amber-700",
  SUSPENDED: "bg-rose-100 text-rose-700",
};
