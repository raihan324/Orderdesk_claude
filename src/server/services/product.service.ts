import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { authorize, type Principal } from "@/lib/auth/rbac";
import { writeAudit } from "@/server/audit";

export const createProductInput = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // dollars in, validated to 2dp, stored as integer cents
  unitPrice: z.coerce
    .number()
    .nonnegative()
    .refine((n) => Number.isInteger(Math.round(n * 100)), "max 2 decimal places"),
  stock: z.coerce.number().int().nonnegative().default(0),
});
export type CreateProductInput = z.infer<typeof createProductInput>;

export type ProductDTO = {
  id: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  stock: number;
  isActive: boolean;
};

export const productService = {
  async list(p: Principal): Promise<ProductDTO[]> {
    authorize(p, "product.read");
    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        unitPriceCents: products.unitPriceCents,
        stock: products.stock,
        isActive: products.isActive,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.name));
    return rows;
  },

  async create(p: Principal, input: CreateProductInput): Promise<ProductDTO> {
    authorize(p, "product.manage");
    const cents = Math.round(input.unitPrice * 100);
    const [row] = await db
      .insert(products)
      .values({
        sku: input.sku,
        name: input.name,
        description: input.description,
        unitPriceCents: cents,
        stock: input.stock,
      })
      .returning();
    await writeAudit(p, "product.created", "Product", row.id, { sku: row.sku });
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      unitPriceCents: row.unitPriceCents,
      stock: row.stock,
      isActive: row.isActive,
    };
  },
};
