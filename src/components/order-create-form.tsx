"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { createOrderAction } from "@/app/actions";
import { formatCents } from "@/lib/utils";

type Product = { id: string; name: string; unitPriceCents: number };
type Client = { id: string; name: string };
type Row = { key: number; productId: string; quantity: string };

export function OrderCreateForm({ clients, products }: { clients: Client[]; products: Product[] }) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, productId: "", quantity: "1" }]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = () => {
    setRows((r) => [...r, { key: nextKey, productId: "", quantity: "1" }]);
    setNextKey((k) => k + 1);
  };
  const removeRow = (key: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));
  const update = (key: number, field: "productId" | "quantity", value: string) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, [field]: value } : x)));

  const priceMap = new Map(products.map((p) => [p.id, p.unitPriceCents]));
  const lineTotal = (r: Row) => (priceMap.get(r.productId) ?? 0) * (Number(r.quantity) || 0);
  const subtotal = rows.reduce((s, r) => s + lineTotal(r), 0);

  return (
    <form action={createOrderAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Client</label>
        <select name="clientId" required className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:w-72">
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Items</label>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <select
                name="productId"
                value={r.productId}
                onChange={(e) => update(r.key, "productId", e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— select product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({formatCents(p.unitPriceCents)})</option>
                ))}
              </select>
              <input
                name="quantity"
                type="number"
                min={1}
                value={r.quantity}
                onChange={(e) => update(r.key, "quantity", e.target.value)}
                className="w-20 rounded-md border border-slate-200 px-3 py-2 text-sm"
                aria-label="Quantity"
              />
              <span className="hidden w-24 text-right text-sm text-slate-500 sm:block">{formatCents(lineTotal(r))}</span>
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                disabled={rows.length === 1}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                aria-label="Remove item"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"
        >
          <Plus size={14} /> Add item
        </button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Referral code (optional)</label>
        <input
          name="affiliateCode"
          placeholder="e.g. REF-7F3K9Q"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm sm:w-72"
        />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-500">
          Estimated total: <strong className="text-slate-800">{formatCents(subtotal)}</strong>
        </span>
        <Button type="submit">Submit order</Button>
      </div>
    </form>
  );
}
