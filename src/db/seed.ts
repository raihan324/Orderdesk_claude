import { db } from "./index";
import { users, clients, contacts, products, orders, orderItems, auditLogs } from "./schema";

async function main() {
  console.log("Clearing tables…");
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(contacts);
  await db.delete(clients);
  await db.delete(products);
  await db.delete(auditLogs);
  await db.delete(users);

  console.log("Seeding internal users…");
  await db.insert(users).values([
    { id: "u-super", email: "alex@orderdesk.local", name: "Alex Rivera", role: "SUPER_ADMIN" },
    { id: "u-admin", email: "priya@orderdesk.local", name: "Priya Nair", role: "ADMIN" },
    { id: "u-mgr", email: "morgan@orderdesk.local", name: "Morgan Patel", role: "MANAGER" },
    { id: "rep-sarah", email: "sarah@orderdesk.local", name: "Sarah Chen", role: "SALES_REP" },
    { id: "rep-marcus", email: "marcus@orderdesk.local", name: "Marcus Lee", role: "SALES_REP" },
    { id: "u-finance", email: "lin@orderdesk.local", name: "Lin Zhao", role: "FINANCE_USER" },
  ]);

  console.log("Seeding clients…");
  await db.insert(clients).values([
    { id: "c-acme", type: "B2B", name: "Acme Corporation", salesRepId: "rep-sarah", industry: "Manufacturing",
      website: "acme.com", registrationNumber: "RC-884213", taxNumber: "GB-552-7781", companyAddress: "120 Industrial Ave, NY",
      timezone: "America/New_York", currency: "USD", language: "en", dateFormat: "MM/DD/YYYY", timeFormat: "H12", country: "United States", region: "New York", defaultTaxRate: 850 },
    { id: "c-xyz", type: "B2B", name: "XYZ Group", salesRepId: "rep-sarah", industry: "Logistics",
      website: "xyzgroup.com", registrationNumber: "RC-119003", taxNumber: "GB-220-3391", companyAddress: "8 Dock Rd, London",
      timezone: "Europe/London", currency: "GBP", language: "en", dateFormat: "DD/MM/YYYY", timeFormat: "H24", country: "United Kingdom", region: "London", defaultTaxRate: 2000 },
    { id: "c-initech", type: "B2B", name: "Initech", salesRepId: "rep-marcus", industry: "Software",
      website: "initech.com", companyAddress: "55 Office Pk, Austin", timezone: "America/Chicago", currency: "USD", country: "United States", region: "Texas", defaultTaxRate: 625 },
    { id: "c-maria", type: "B2C", name: "Maria Garcia", salesRepId: "rep-sarah",
      timezone: "America/Los_Angeles", currency: "USD", language: "es", country: "United States", region: "California" },
    { id: "c-omar", type: "B2C", name: "Omar Farouk", salesRepId: "rep-marcus",
      timezone: "Asia/Dubai", currency: "AED", language: "ar", country: "UAE", region: "Dubai" },
  ]);

  console.log("Seeding contacts…");
  await db.insert(contacts).values([
    { id: "ct-john", clientId: "c-acme", type: "OWNER", name: "John Smith", email: "john@acme.com", phone: "+1 555 0101", jobTitle: "Managing Director", department: "Executive", position: "Director", hasPortalAccess: true, portalStatus: "ACTIVE", canManageOrgSettings: true, canManagePortalUsers: true, onboardingCompleted: true },
    { id: "ct-sarah", clientId: "c-acme", type: "ACCOUNTS", name: "Sarah Khan", email: "sarah@acme.com", phone: "+1 555 0102", jobTitle: "Finance Manager", department: "Finance", position: "Manager", hasPortalAccess: true, portalStatus: "ACTIVE", canManageOrgSettings: false, onboardingCompleted: true },
    { id: "ct-david", clientId: "c-acme", type: "MANAGER", name: "David Lee", email: "david@acme.com", phone: "+1 555 0103", jobTitle: "Operations Manager", department: "Operations", position: "Manager", hasPortalAccess: false, portalStatus: "PENDING" },
    { id: "ct-emma", clientId: "c-xyz", type: "PROCUREMENT", name: "Emma Wright", email: "emma@xyzgroup.com", jobTitle: "Procurement Lead", hasPortalAccess: true, portalStatus: "ACTIVE", canManageOrgSettings: true, onboardingCompleted: true },
    { id: "ct-maria", clientId: "c-maria", type: "PRIMARY", name: "Maria Garcia", email: "maria@gmail.com", phone: "+1 555 0150", hasPortalAccess: true, portalStatus: "ACTIVE", onboardingCompleted: true },
    { id: "ct-omar", clientId: "c-omar", type: "PRIMARY", name: "Omar Farouk", email: "omar@gmail.com", hasPortalAccess: true, portalStatus: "ACTIVE", onboardingCompleted: true },
  ]);

  console.log("Seeding products…");
  await db.insert(products).values([
    { id: "p1", sku: "SKU-001", name: "Widget A", unitPriceCents: 1999, stock: 120 },
    { id: "p2", sku: "SKU-002", name: "Widget B", unitPriceCents: 3450, stock: 80 },
    { id: "p3", sku: "SKU-003", name: "Gadget Pro", unitPriceCents: 14900, stock: 25 },
    { id: "p4", sku: "SKU-004", name: "Service Plan", unitPriceCents: 49900, stock: 999 },
  ]);

  console.log("Seeding orders…");
  await db.insert(orders).values([
    { id: "o1", orderNumber: "ORD-2026-0001", clientId: "c-acme", createdByUserId: "rep-sarah", status: "CONFIRMED", currency: "USD", totalCents: 1999 * 10 + 14900 * 2 },
    { id: "o2", orderNumber: "ORD-2026-0002", clientId: "c-xyz", createdByUserId: "rep-sarah", status: "SUBMITTED", currency: "GBP", totalCents: 3450 * 20 },
    { id: "o3", orderNumber: "ORD-2026-0003", clientId: "c-maria", createdByUserId: "rep-sarah", status: "FULFILLED", currency: "USD", totalCents: 1999 },
  ]);
  await db.insert(orderItems).values([
    { orderId: "o1", productId: "p1", quantity: 10, unitPriceCents: 1999, lineTotalCents: 19990 },
    { orderId: "o1", productId: "p3", quantity: 2, unitPriceCents: 14900, lineTotalCents: 29800 },
    { orderId: "o2", productId: "p2", quantity: 20, unitPriceCents: 3450, lineTotalCents: 69000 },
    { orderId: "o3", productId: "p1", quantity: 1, unitPriceCents: 1999, lineTotalCents: 1999 },
  ]);

  console.log("✓ Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
