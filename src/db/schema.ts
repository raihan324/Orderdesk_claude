import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/id";

/* ------------------------------------------------------------------ enums */
export const internalRole = pgEnum("internal_role", [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "SALES_REP",
  "SUPPORT_AGENT",
  "FINANCE_USER",
  "STAFF",
]);
export const clientType = pgEnum("client_type", ["B2B", "B2C"]);
export const contactType = pgEnum("contact_type", [
  "OWNER",
  "DIRECTOR",
  "MANAGER",
  "ACCOUNTS",
  "TECHNICAL",
  "PROCUREMENT",
  "PRIMARY",
  "OTHER",
]);
export const accountStatus = pgEnum("account_status", [
  "ACTIVE",
  "INVITED",
  "PENDING",
  "SUSPENDED",
]);
export const orderStatus = pgEnum("order_status", [
  "DRAFT",
  "SUBMITTED",
  "CONFIRMED",
  "FULFILLED",
  "CANCELLED",
]);
export const loanStatus = pgEnum("loan_status", [
  "APPLIED",
  "UNDER_REVIEW",
  "SANCTIONED",
  "REJECTED",
  "DISBURSED",
  "CLOSED",
]);
export const affiliateStatus = pgEnum("affiliate_status", ["ACTIVE", "SUSPENDED"]);
export const commissionStatus = pgEnum("commission_status", [
  "PENDING",
  "APPROVED",
  "PAID",
  "REVERSED",
]);

/* ------------------------------------------------------------ internal users */
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(createId),
  authProviderId: text("auth_provider_id").unique(), // Clerk id in prod; null in dev
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  avatarUrl: text("avatar_url"),
  role: internalRole("role").notNull(),
  status: accountStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* -------------------------------------------------------------------- clients */
export const clients = pgTable("clients", {
  id: text("id").primaryKey().$defaultFn(createId),
  type: clientType("type").notNull(),
  name: text("name").notNull(),
  status: accountStatus("status").notNull().default("ACTIVE"),

  // B2B organization profile (null for B2C)
  logoUrl: text("logo_url"),
  industry: text("industry"),
  website: text("website"),
  registrationNumber: text("registration_number"),
  taxNumber: text("tax_number"),
  companyAddress: text("company_address"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),

  // localization defaults
  timezone: text("timezone").notNull().default("UTC"),
  currency: text("currency").notNull().default("USD"),
  language: text("language").notNull().default("en"),
  dateFormat: text("date_format").notNull().default("YYYY-MM-DD"),
  timeFormat: text("time_format").notNull().default("H24"),
  numberFormat: text("number_format").notNull().default("1,234.56"),
  country: text("country"),
  region: text("region"),
  defaultTaxRate: integer("default_tax_rate_bps"), // basis points (e.g. 850 = 8.5%)

  salesRepId: text("sales_rep_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------- contacts */
export const contacts = pgTable("contacts", {
  id: text("id").primaryKey().$defaultFn(createId),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  type: contactType("type").notNull().default("OTHER"),

  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  department: text("department"),
  position: text("position"),
  photoUrl: text("photo_url"),

  // portal login (one identity per portal-enabled contact)
  hasPortalAccess: boolean("has_portal_access").notNull().default(false),
  authProviderId: text("auth_provider_id").unique(),
  portalStatus: accountStatus("portal_status").notNull().default("PENDING"),

  // portal permissions
  canManageOrgSettings: boolean("can_manage_org_settings").notNull().default(false),
  canManagePortalUsers: boolean("can_manage_portal_users").notNull().default(false),

  // personal preference overrides (null => inherit client defaults)
  timezoneOverride: text("timezone_override"),
  currencyOverride: text("currency_override"),
  languageOverride: text("language_override"),

  notificationPrefs: jsonb("notification_prefs"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------- products */
export const products = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(createId),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  unitPriceCents: integer("unit_price_cents").notNull(), // integer cents (no float)
  stock: integer("stock").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* --------------------------------------------------------------------- orders */
export const orders = pgTable("orders", {
  id: text("id").primaryKey().$defaultFn(createId),
  orderNumber: text("order_number").notNull().unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  createdByContactId: text("created_by_contact_id").references(() => contacts.id),
  // affiliate attribution (referral); forward ref resolved lazily by drizzle
  affiliateId: text("affiliate_id").references(() => affiliates.id),
  status: orderStatus("status").notNull().default("DRAFT"),
  currency: text("currency").notNull().default("USD"),
  totalCents: integer("total_cents").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey().$defaultFn(createId),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(), // snapshot at order time
  lineTotalCents: integer("line_total_cents").notNull(),
});

/* ------------------------------------------------------------------ audit log */
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(createId),
  actorId: text("actor_id"),
  actorType: text("actor_type").notNull().default("USER"), // USER | CONTACT | SYSTEM
  actorName: text("actor_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ------------------------------------------------------ lending / loan module */
export const lenders = pgTable("lenders", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const loans = pgTable("loans", {
  id: text("id").primaryKey().$defaultFn(createId),
  lenderId: text("lender_id").references(() => lenders.id),
  // borrower reuses an existing client record
  borrowerClientId: text("borrower_client_id")
    .notNull()
    .references(() => clients.id),
  principalCents: integer("principal_cents").notNull(), // requested amount
  currency: text("currency").notNull().default("USD"),
  purpose: text("purpose"),
  tenureMonths: integer("tenure_months").notNull(),
  interestRateBps: integer("interest_rate_bps").notNull(), // annual rate, basis points
  status: loanStatus("status").notNull().default("APPLIED"),

  // populated on sanction
  sanctionedAmountCents: integer("sanctioned_amount_cents"),
  sanctionedAt: timestamp("sanctioned_at"),
  sanctionedByUserId: text("sanctioned_by_user_id").references(() => users.id),

  disbursedAt: timestamp("disbursed_at"),
  rejectionReason: text("rejection_reason"),

  createdByUserId: text("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* --------------------------------------------- affiliate referral / commission */
export const affiliates = pgTable("affiliates", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  email: text("email").notNull(),
  referralCode: text("referral_code").notNull().unique(),
  commissionRateBps: integer("commission_rate_bps").notNull().default(500), // 5%
  status: affiliateStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const affiliateCommissions = pgTable("affiliate_commissions", {
  id: text("id").primaryKey().$defaultFn(createId),
  affiliateId: text("affiliate_id")
    .notNull()
    .references(() => affiliates.id, { onDelete: "cascade" }),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  // snapshots taken at attribution time
  orderTotalCents: integer("order_total_cents").notNull(),
  commissionRateBps: integer("commission_rate_bps").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: commissionStatus("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------------------------------------------- user SMTP settings (per-user) */
export const userSmtpSettings = pgTable(
  "user_smtp_settings",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull(),
    smtpSecure: boolean("smtp_secure").notNull().default(true),
    smtpUsername: text("smtp_username").notNull(),
    // "password" = classic user/pass SMTP; "oauth2_google" = Google OAuth2 (XOAUTH2)
    authMethod: text("auth_method").notNull().default("password"),
    smtpPassword: text("smtp_password"), // encrypted; null for OAuth2
    oauthRefreshToken: text("oauth_refresh_token"), // encrypted; null for password auth
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);
