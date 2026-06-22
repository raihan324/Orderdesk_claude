import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { AppShell } from "@/components/app-shell";
import { Card, Table, THead, TBody, Th, Td, Button } from "@/components/ui";
import { productService } from "@/server/services/product.service";
import { formatCents } from "@/lib/utils";
import { createProductAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const p = await getPrincipal();
  if (!p) redirect("/sign-in");
  if (p.kind === "PORTAL") redirect("/portal");

  const products = await productService.list(p);
  const mayManage = can(p, "product.manage");

  return (
    <AppShell principal={p}>
      <h1 className="text-xl font-semibold tracking-tight">Products</h1>
      <p className="mt-0.5 text-sm text-slate-500">{mayManage ? "Manage your catalog." : "Catalog (read-only for your role)."}</p>

      {mayManage && (
        <Card className="mt-5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Add product</h3>
          <form action={createProductAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <input name="sku" placeholder="SKU" required className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input name="name" placeholder="Name" required className="col-span-2 rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input name="unitPrice" type="number" step="0.01" placeholder="Price" required className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <input name="stock" type="number" placeholder="Stock" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <Button type="submit" className="col-span-2 justify-center sm:col-span-1">Add</Button>
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <Table>
          <THead><tr><Th>SKU</Th><Th>Name</Th><Th className="text-right">Price</Th><Th className="text-right">Stock</Th></tr></THead>
          <TBody>
            {products.map((pr) => (
              <tr key={pr.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs text-slate-500">{pr.sku}</Td>
                <Td className="font-medium text-slate-900">{pr.name}</Td>
                <Td className="text-right">{formatCents(pr.unitPriceCents)}</Td>
                <Td className="text-right">{pr.stock}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </AppShell>
  );
}
