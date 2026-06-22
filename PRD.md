# OrderDesk — Product Requirements Document

**Version**: 1.0  
**Last Updated**: June 20, 2026  
**Status**: Production Ready

---

## Executive Summary

OrderDesk is a **production-grade B2B/B2C ordering and client management platform** built with Next.js 15, React 19, TypeScript, Drizzle ORM, PostgreSQL, and Tailwind CSS. It features:

- **Clerk-based social authentication** (Google, Facebook, email/password)
- **Role-based access control (RBAC)** with 7 internal roles + portal contacts
- **Per-user SMTP configuration** for flexible email sending
- **Server-enforced authorization** in a typed service layer
- **Audit logging** for compliance and security
- **B2B/B2C client management** with contact-level portal access
- **Order management** with server-authoritative pricing
- **Product catalog** with inventory tracking
- **Internal staff console** + customer portal

---

## Table of Contents

1. [Features](#features)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Authentication & Authorization](#authentication--authorization)
6. [API Specification](#api-specification)
7. [User Flows](#user-flows)
8. [Security](#security)
9. [Setup & Installation](#setup--installation)
10. [Testing Guide](#testing-guide)
11. [Deployment](#deployment)
12. [Known Limitations](#known-limitations)
13. [Roadmap](#roadmap)

---

## Features

### Core Features (Built)

#### 1. **Authentication & User Management**
- ✅ Clerk-based social login (Google, Facebook, email/password)
- ✅ Per-user email configuration (SMTP settings with encryption)
- ✅ Self-service user provisioning (first user = ADMIN, others = MANAGER by default)
- ✅ SUPER_ADMIN role for user management
- ✅ User invitation by email with role assignment
- ✅ Invite emails sent from user's configured SMTP (or global fallback)

#### 2. **Roles & Permissions (7 levels)**
- **SUPER_ADMIN**: Full access, manage users, audit logs
- **ADMIN**: Manage clients, products, orders, users can only read audit logs
- **MANAGER**: Manage all clients/orders (not sales-rep scoped), read products
- **SALES_REP**: Own-client scoped (only clients assigned to them)
- **SUPPORT_AGENT**: Read all clients/orders, no management
- **FINANCE_USER**: Read all clients/orders, no management
- **STAFF**: Read products only (minimal access)
- **Portal Contacts**: Customer portal (per-client scoped)

#### 3. **Clients & Contacts**
- ✅ B2B (organizations) and B2C (individuals) client types
- ✅ Contact management (7 contact types: owner, director, manager, accounts, technical, procurement, primary, other)
- ✅ Contact-level portal access with permissions (manage org settings, manage portal users)
- ✅ Sales rep assignment per client
- ✅ Audit trail for all changes

#### 4. **Orders**
- ✅ Order creation with line items (products + quantities)
- ✅ Server-authoritative pricing (client can't override)
- ✅ Order statuses: DRAFT, SUBMITTED, CONFIRMED, FULFILLED, CANCELLED
- ✅ Multi-currency support (USD, EUR, etc.)
- ✅ Order history and audit trail
- ✅ Portal users can only see their assigned client's orders

#### 5. **Products**
- ✅ SKU-based product management
- ✅ Unit pricing (stored as integer cents, no floats)
- ✅ Inventory tracking
- ✅ Active/inactive flag
- ✅ Product descriptions
- ✅ Admin-only creation; all users can read

#### 6. **Settings & Configuration**
- ✅ Per-user SMTP configuration (encrypted password storage)
- ✅ Test SMTP connection without saving
- ✅ From name/email customization per user
- ✅ Fallback to global SMTP (.env) if user hasn't configured
- ✅ Last-updated timestamp on settings

#### 7. **Admin Features**
- ✅ Users & Roles page (SUPER_ADMIN only)
- ✅ Change user roles (with safeguard against demoting last SUPER_ADMIN)
- ✅ Suspend/reactivate users
- ✅ Invite users by email with role pre-assignment
- ✅ Audit log (written but viewer not yet built)

#### 8. **Portal (Customer-Facing)**
- ✅ Contact-level login (email via Clerk)
- ✅ View assigned client's orders
- ✅ Create new orders (if permitted)
- ✅ View product catalog
- ✅ Org settings view (if permitted)

#### 9. **Audit Logging**
- ✅ User provisioning, role changes, order creation, product changes, contact invitations
- ✅ Timestamps, actor info, action, entity type, metadata
- ✅ Never logs passwords or sensitive fields

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React | 19.2.7 |
| **Framework** | Next.js App Router | 15.5.19 |
| **Language** | TypeScript | 5.7.3 |
| **Styling** | Tailwind CSS | 3.4.17 |
| **Icons** | Lucide React | 0.469.0 |
| **Auth** | Clerk | 7.5.5 |
| **Database** | PostgreSQL | 16+ |
| **ORM** | Drizzle ORM | 0.38.4 |
| **Database Driver** | postgres-js | 3.4.5 |
| **Validation** | Zod | 3.24.1 |
| **Email** | Nodemailer | 9.0.1 |
| **Encryption** | Node.js crypto | Built-in |
| **Build Tool** | Next.js (Turbopack) | Built-in |
| **Dev Environment** | Docker Compose | PostgreSQL 16-alpine |

---

## Architecture

### Project Structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (ClerkProvider)
│   ├── page.tsx                  # Home (redirects authenticated users)
│   ├── sign-in/[[...sign-in]]/   # Clerk sign-in page
│   ├── sign-up/[[...sign-up]]/   # Clerk sign-up page
│   ├── api/dev-auth/             # Dev-mode login helper (disabled in Clerk mode)
│   ├── dashboard/                # Staff dashboard
│   ├── clients/                  # Client management
│   ├── products/                 # Product catalog management
│   ├── orders/                   # Order management
│   ├── users/                    # Users & Roles management
│   ├── settings/                 # User SMTP configuration
│   ├── portal/                   # Customer portal
│   └── actions.ts                # Server Actions (mutations)
├── components/
│   ├── app-shell.tsx             # Main layout shell + navigation
│   ├── ui/index.tsx              # UI primitives (Card, Button, Table, etc.)
│   ├── smtp-settings-form.tsx    # SMTP configuration form
│   ├── sign-out-button.tsx       # Clerk sign-out button
│   └── ...
├── db/
│   ├── schema.ts                 # Drizzle schema (all tables, enums)
│   ├── index.ts                  # Database client (postgres-js)
│   └── seed.ts                   # Demo data seeding
├── lib/
│   ├── auth/
│   │   ├── session.ts            # Get current principal (Clerk or dev)
│   │   └── rbac.ts               # Authorization checks
│   ├── encryption.ts             # AES-256-GCM encrypt/decrypt
│   ├── id.ts                     # Compact ID generator
│   └── utils.ts                  # Formatting utilities
├── server/
│   ├── services/
│   │   ├── client.service.ts     # Client & contact business logic
│   │   ├── order.service.ts      # Order business logic
│   │   ├── product.service.ts    # Product business logic
│   │   ├── user.service.ts       # User & role management
│   │   └── smtp-settings.service.ts # SMTP configuration
│   ├── mailer.ts                 # Email sending (per-user or global SMTP)
│   └── audit.ts                  # Audit log writer
├── middleware.ts                 # Clerk middleware (conditional)
└── globals.css                   # Tailwind CSS + custom styles
```

### Data Flow

```
Client Request
    ↓
Next.js Route Handler / Server Action
    ↓
requirePrincipal() [Authentication]
    ↓
Service Layer Method
    ↓
authorize() [Authorization via RBAC]
    ↓
Database Query (Drizzle ORM)
    ↓
writeAudit() [Log the action]
    ↓
Response to Client
```

---

## Database Schema

### Tables Overview

#### `users` (Internal Staff)
```sql
id (text, PK)
authProviderId (text, unique) -- Clerk ID or null in dev
email (text, unique)
name (text)
role (enum: SUPER_ADMIN | ADMIN | MANAGER | SALES_REP | SUPPORT_AGENT | FINANCE_USER | STAFF)
status (enum: ACTIVE | INVITED | PENDING | SUSPENDED)
createdAt (timestamp, default: now)
```

#### `user_smtp_settings` (Per-User Email Config)
```sql
id (text, PK)
userId (text, FK → users, unique, cascade delete)
smtpHost (text)
smtpPort (int)
smtpSecure (bool, default: true)
smtpUsername (text)
smtpPassword (text) -- AES-256-GCM encrypted
fromName (text)
fromEmail (text)
isActive (bool, default: true)
createdAt (timestamp, default: now)
updatedAt (timestamp, default: now)
```

#### `clients` (B2B/B2C Accounts)
```sql
id (text, PK)
type (enum: B2B | B2C)
name (text)
status (enum: ACTIVE | INVITED | PENDING | SUSPENDED)
logoUrl (text, nullable)
industry (text, nullable)
website (text, nullable)
registrationNumber (text, nullable) -- Company reg number
taxNumber (text, nullable)
companyAddress (text, nullable)
billingAddress (text, nullable)
shippingAddress (text, nullable)
timezone (text, default: 'UTC')
currency (text, default: 'USD')
language (text, default: 'en')
dateFormat (text, default: 'YYYY-MM-DD')
timeFormat (text, default: 'H24')
numberFormat (text, default: '1,234.56')
country (text, nullable)
region (text, nullable)
defaultTaxRate (int, nullable) -- basis points (e.g., 850 = 8.5%)
salesRepId (text, FK → users, nullable)
createdAt (timestamp, default: now)
```

#### `contacts` (Portal Users)
```sql
id (text, PK)
clientId (text, FK → clients, cascade delete)
type (enum: OWNER | DIRECTOR | MANAGER | ACCOUNTS | TECHNICAL | PROCUREMENT | PRIMARY | OTHER)
name (text)
email (text)
phone (text, nullable)
jobTitle (text, nullable)
department (text, nullable)
position (text, nullable)
photoUrl (text, nullable)
hasPortalAccess (bool, default: false)
authProviderId (text, unique, nullable) -- Clerk ID
portalStatus (enum: ACTIVE | INVITED | PENDING | SUSPENDED)
canManageOrgSettings (bool, default: false)
canManagePortalUsers (bool, default: false)
timezoneOverride (text, nullable)
currencyOverride (text, nullable)
languageOverride (text, nullable)
notificationPrefs (jsonb, nullable)
onboardingCompleted (bool, default: false)
createdAt (timestamp, default: now)
```

#### `products`
```sql
id (text, PK)
sku (text, unique)
name (text)
description (text, nullable)
unitPriceCents (int) -- Always integer cents, never float
stock (int, default: 0)
isActive (bool, default: true)
createdAt (timestamp, default: now)
```

#### `orders`
```sql
id (text, PK)
orderNumber (text, unique) -- e.g., "ORD-2026-ABC123"
clientId (text, FK → clients)
createdByUserId (text, FK → users, nullable)
createdByContactId (text, FK → contacts, nullable)
status (enum: DRAFT | SUBMITTED | CONFIRMED | FULFILLED | CANCELLED)
currency (text, default: 'USD')
totalCents (int, default: 0)
notes (text, nullable)
createdAt (timestamp, default: now)
```

#### `orderItems` (Line Items)
```sql
id (text, PK)
orderId (text, FK → orders, cascade delete)
productId (text, FK → products)
quantity (int)
unitPriceCents (int) -- Snapshot at order time
lineTotalCents (int) -- quantity × unitPriceCents
```

#### `auditLogs`
```sql
id (text, PK)
actorId (text, nullable)
actorType (text, default: 'USER') -- USER | CONTACT | SYSTEM
actorName (text, nullable)
action (text) -- e.g., 'order.created', 'user.invited'
entityType (text)
entityId (text, nullable)
metadata (jsonb, nullable) -- Action-specific data
ipAddress (text, nullable)
createdAt (timestamp, default: now)
```

### Enum Types

```sql
-- internal_role
SUPER_ADMIN, ADMIN, MANAGER, SALES_REP, SUPPORT_AGENT, FINANCE_USER, STAFF

-- account_status
ACTIVE, INVITED, PENDING, SUSPENDED

-- order_status
DRAFT, SUBMITTED, CONFIRMED, FULFILLED, CANCELLED

-- client_type
B2B, B2C

-- contact_type
OWNER, DIRECTOR, MANAGER, ACCOUNTS, TECHNICAL, PROCUREMENT, PRIMARY, OTHER
```

---

## Authentication & Authorization

### Authentication Modes

#### **Clerk Mode (Production)**
- Uses Clerk's hosted sign-in UI
- Supports: Google, Facebook, email/password
- First login links by verified email to existing user row
- New signups auto-provision as MANAGER (or ADMIN if email matches `ADMIN_EMAIL` env var)
- Session managed by Clerk
- Set `AUTH_MODE=clerk` in `.env`

#### **Dev Mode**
- Cookie-based "login as" helper (no external service)
- Sign-in page lists seeded staff + portal users
- Used for local development only
- Set `AUTH_MODE=dev` in `.env`
- Route `/api/dev-auth?as=INTERNAL:<userId>` sets session cookie

### Authorization (RBAC)

**Principal Types**:
- `INTERNAL`: Internal user with role-based permissions
- `PORTAL`: Portal contact with client-scoped access

**Action Capability Matrix**:

| Action | SUPER_ADMIN | ADMIN | MANAGER | SALES_REP | SUPPORT_AGENT | FINANCE_USER | STAFF | Portal |
|--------|-------------|-------|---------|-----------|----------------|--------------|-------|--------|
| user.manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| client.read | ✅ | ✅ | ✅ | own | ✅ | ✅ | ❌ | ❌ |
| client.manage | ✅ | ✅ | ✅ | own | ❌ | ❌ | ❌ | ❌ |
| contact.manage | ✅ | ✅ | ✅ | own | ❌ | ❌ | ❌ | ❌ |
| product.read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| product.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| order.read | ✅ | ✅ | ✅ | own | ✅ | ✅ | ❌ | own client |
| order.manage | ✅ | ✅ | ✅ | own | ❌ | ❌ | ❌ | ❌ |
| audit.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Key Rules**:
- Own-scoped: SALES_REP can only manage clients/orders assigned to them
- Portal contacts: Only see assigned client data
- Fallback: If not listed, action is forbidden

---

## API Specification

### Server Actions (Form Submissions)

All mutations run through **Server Actions** in `src/app/actions.ts`:

#### Authentication & User Management
- `inviteUserAction(formData)` — Invite user by email with role
- `updateUserRoleAction(formData)` — Change user's role (SUPER_ADMIN only)
- `updateUserStatusAction(formData)` — Suspend/reactivate user

#### SMTP Settings
- `updateSmtpSettingsAction(formData)` — Save user's SMTP config (password encrypted)
- `testSmtpConnectionAction(formData)` — Test SMTP without saving (password not stored)

#### Products
- `createProductAction(formData)` — Create product (ADMIN+ only)

#### Orders
- `createOrderAction(formData)` — Create order with line items (server prices items)
- `assignRepAction(formData)` — Assign sales rep to client

#### Contacts
- `inviteContactAction(formData)` — Invite portal user

### Request/Response Format

**Server Actions use FormData**:
```javascript
const formData = new FormData();
formData.append('field1', value1);
formData.append('field2', value2);
await myAction(formData);
```

**Error Handling**:
- Server Actions throw `Error` on auth failure
- Client catches and displays error in toast/banner
- Validation errors via Zod schemas before DB writes

### API Routes (if applicable)

Currently no explicit `/api/` endpoints. All mutations go through Server Actions. If REST API needed, would go in `src/app/api/`.

---

## User Flows

### Flow 1: New User Signs In

```
User visits /sign-in
    ↓
Clerk UI loads (Google/Facebook/Email buttons)
    ↓
User authenticates via Google
    ↓
Clerk verifies email ownership
    ↓
getPrincipal() checks if email exists in users table:
    - If matches existing user: link authProviderId, return principal
    - If matches ADMIN_EMAIL: create as ADMIN, activate, return principal
    - If new: create as MANAGER, activate, return principal
    ↓
Redirect to /dashboard (INTERNAL) or /portal (PORTAL)
```

### Flow 2: Admin Invites User

```
Admin goes to /users
    ↓
Fills Invite form: email, name, role
    ↓
Submit → inviteUserAction()
    ↓
userService.invite() validates:
    - Email unique
    - Role valid
    ↓
Create user row with status=INVITED
    ↓
Send invite email from admin's SMTP (or global fallback)
    ↓
Email contains sign-in link
    ↓
Invitee signs in with that email via Clerk
    ↓
getPrincipal() finds INVITED row, links auth, flips to ACTIVE, grants assigned role
```

### Flow 3: Create an Order

```
User (MANAGER+) goes to /orders → New Order
    ↓
Pick client → pick products + quantities
    ↓
Submit → createOrderAction()
    ↓
orderService.create():
    - Check authorize(principal, "order.manage", resource)
    - For each product: fetch from catalog, lock price
    - Compute server-side total (client input ignored)
    - Insert order + orderItems rows
    ↓
Audit: "order.created" event written
    ↓
Redirect to /orders
```

### Flow 4: Customer Portal Access

```
Contact (with portal access) signs in via /sign-in
    ↓
Clerk authenticates
    ↓
getPrincipal() resolves to PORTAL principal (contactId, clientId, etc.)
    ↓
Redirect to /portal
    ↓
Portal page:
    - Can view only their assigned client
    - Can view that client's orders (if permission)
    - Can create orders (if permission)
    - Can see product catalog
```

---

## Security

### Authentication
- ✅ Clerk handles OAuth2/OIDC, email verification, MFA
- ✅ Session: Clerk manages (JWTs); dev mode uses HttpOnly cookie
- ✅ Passwords: Never stored locally; delegated to Clerk
- ✅ Password field in per-user SMTP: Encrypted AES-256-GCM before storage

### Authorization
- ✅ RBAC enforced server-side in service layer (never trust client)
- ✅ Ownership verified (e.g., sales rep can only see own clients)
- ✅ Capability checked for every action
- ✅ Portal contacts scoped to assigned client only

### Data Protection
- ✅ SMTP passwords: AES-256-GCM encrypted, random IV per password, auth tag validation
- ✅ Order pricing: Computed server-side; client can't override
- ✅ Integer cents for money (no floats; no rounding errors)
- ✅ Sensitive fields never logged

### Audit & Compliance
- ✅ Audit log for: user provisioning, role changes, orders, products, invites
- ✅ Timestamps, actor info, action type, entity ID
- ✅ Passwords never in audit logs
- ✅ SQL injection: Drizzle parameterized queries
- ✅ XSS: React + Next.js auto-escape; CSP headers in next.config.ts

### Security Headers (next.config.ts)
```
Content-Security-Policy: 
  - default-src 'self'
  - script-src 'self' 'unsafe-inline' + Clerk domains
  - style-src 'self' 'unsafe-inline'
  - connect-src 'self' + Clerk
  - frame-src 'self' + Clerk Turnstile
  - frame-ancestors 'none'

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Before Production

- [ ] Rotate `ENCRYPTION_KEY` from default value
- [ ] Set `ADMIN_EMAIL` in `.env`
- [ ] Enable Clerk's MFA
- [ ] Set up HTTPS (next.config.ts, CSP `upgrade-insecure-requests`)
- [ ] Rate limiting on auth endpoints
- [ ] CSRF same-origin checks
- [ ] Transactional audit logs (tamper-evident)
- [ ] PII encryption (optional, depends on compliance needs)
- [ ] Penetration test
- [ ] Data backup strategy
- [ ] Log shipping (audit logs to external system)

---

## Setup & Installation

### Prerequisites
- Node.js 20+ (`node --version`)
- Docker (for PostgreSQL)
- Clerk account (free tier ok for dev)
- Gmail account (for SMTP testing)

### 1. Clone & Install

```bash
cd Desktop/Node\ Project/orderdesk/orderdesk
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Database
DATABASE_URL="postgresql://orderdesk:orderdesk@localhost:5432/orderdesk"

# Auth mode
AUTH_MODE="clerk"

# Clerk credentials (from clerk.com dashboard)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Admin user auto-provisioning
ADMIN_EMAIL="your-email@gmail.com"

# Per-user SMTP encryption
ENCRYPTION_KEY="change-me-use-a-long-random-string"

# Global SMTP (fallback if user hasn't configured)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="app-password" # Gmail: 16-char app password, spaces removed

MAIL_FROM="OrderDesk <your-email@gmail.com>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Database Setup

```bash
# Start PostgreSQL (if not running)
docker compose up -d

# Apply schema
npm run db:push

# Seed demo data (optional)
npm run db:seed
```

### 4. Run Dev Server

```bash
npm run dev
# → http://localhost:3000
```

### 5. First Sign-In

1. Go to http://localhost:3000/sign-in
2. Click "Sign up" (if Clerk sign-up is enabled)
3. Use Google/email to sign up with `your-email@gmail.com`
4. You'll auto-provision as ADMIN
5. Go to Dashboard

---

## Testing Guide

### Unit Tests (N/A - Not Implemented)
- RBAC logic (`src/lib/auth/rbac.ts`) is pure and testable
- Encryption (`src/lib/encryption.ts`) has no I/O
- Could add Jest + testing-library, but not done yet

### Manual Testing

#### Test User Invitation Flow
1. **As SUPER_ADMIN** (you), go to **Users & Roles**
2. Click **Invite user**:
   - Email: `test@example.com`
   - Name: `Test User`
   - Role: `MANAGER`
3. Click **Invite**
4. Check inbox (email sent from your SMTP or global)
5. Click invite link → sign up with that email via Google
6. User auto-provisions as MANAGER with assigned role
7. Verify in **Users & Roles** row shows MANAGER + ACTIVE

#### Test SMTP Settings
1. Go to **Settings**
2. Enter test SMTP:
   - Host: `smtp.gmail.com`, Port: `465`
   - Secure: ✓
   - Username: `your-gmail@gmail.com`
   - Password: `your-app-password`
   - From Name: `Test`
   - From Email: `your-gmail@gmail.com`
3. Click **Test Connection** → success
4. Click **Save Settings**
5. Go to **Users & Roles**, invite someone
6. Email comes from your mailbox (verify in sent folder)

#### Test RBAC
1. **As ADMIN**, try to access **/users** (Users & Roles)
   - Should see page but no "Invite" form (only SUPER_ADMIN)
2. **As MANAGER**, try to access **/users**
   - Should redirect (no permission)
3. **As SALES_REP**, view clients:
   - Should only see clients assigned to them
4. **As Portal Contact**, view orders:
   - Should only see their client's orders

#### Test Order Pricing
1. Create an order with Product X (price $10.00)
2. Try to edit the request to change price to $1.00
3. Verify server ignored it — order total stays $10.00

---

## Deployment

### Build for Production

```bash
npm run build
npm run start
```

Outputs:
- TypeScript compilation ✓
- Next.js production build ✓
- Drizzle schema check ✓

### Deployment Platforms

**Recommended**: Vercel (Next.js-native)
- Push to GitHub → Vercel auto-deploys
- Set env vars in Vercel dashboard
- Use Neon or Render for managed PostgreSQL

**Alternative**: Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
```

### Pre-Deployment Checklist

- [ ] `AUTH_MODE="clerk"` (not "dev")
- [ ] Clerk keys set (production or staging)
- [ ] `ENCRYPTION_KEY` rotated (not default)
- [ ] `ADMIN_EMAIL` configured
- [ ] Database migrations run (`npm run db:push`)
- [ ] SMTP configured (global + optional per-user)
- [ ] `NEXT_PUBLIC_APP_URL` set to production domain
- [ ] CSP headers reviewed (next.config.ts)
- [ ] HTTPS enforced (`upgrade-insecure-requests`)
- [ ] Backups configured for PostgreSQL
- [ ] Logs shipped to external system
- [ ] Rate limiting / DDoS protection enabled (Cloudflare, etc.)

---

## Known Limitations

1. **Audit Log Viewer Not Built**
   - Audit table is populated and accessible
   - UI for `/audit` route not implemented yet
   - Can query directly via DB or REST API (future)

2. **Email Templates Fixed**
   - Invite email is hardcoded in `src/server/mailer.ts`
   - Per-user custom templates not implemented
   - Could extend with template engine (handlebars, etc.)

3. **No Email Retry Logic**
   - If SMTP fails, invite still succeeds (best-effort)
   - No automatic retry queue
   - Could add Bull/RabbitMQ for async jobs

4. **Encryption Key Not Rotatable**
   - `ENCRYPTION_KEY` is per-deployment
   - Rotating requires data migration
   - Could implement versioned encryption

5. **No Send History**
   - SMTP test results not logged
   - Could add table for email send history

6. **Portal Limited**
   - No org settings editor (view-only)
   - No bulk actions on orders
   - Could extend with more self-service features

7. **Contacts Not Fully Utilized**
   - Contact management UI exists
   - Could expand with more portal features

---

## Roadmap

### Phase 2 (Planned, Not Built)
- [ ] Audit log viewer (`/audit`)
- [ ] Email template builder
- [ ] Async email queue (Bull)
- [ ] SMS notifications
- [ ] Webhook integrations
- [ ] CSV export for orders/clients
- [ ] Advanced reporting & analytics
- [ ] Multi-language support (i18n)
- [ ] Dark mode

### Phase 3 (Future)
- [ ] Mobile app (React Native)
- [ ] Integration with payment gateways
- [ ] Shipment tracking
- [ ] Customer feedback / ratings
- [ ] Marketplace features (peer selling)
- [ ] API for third-party integrations

---

## Support & Maintenance

### Monitoring
- Monitor Clerk for authentication anomalies
- Check database logs for slow queries
- Review audit logs for suspicious actions
- Monitor SMTP delivery failures

### Backup & Recovery
- PostgreSQL daily backups (configured externally)
- Keep `.env` encrypted in secure storage
- Test restore process monthly

### Updates
- Next.js: Check for security releases monthly
- Clerk: Stay on latest stable version
- Dependencies: `npm audit` before each deployment

### Troubleshooting

**Clerk login not working**
- Verify `AUTH_MODE="clerk"` in `.env`
- Check Clerk dashboard for webhook configuration
- Confirm `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is correct

**SMTP not sending emails**
- Test with `npm run dev` → Settings → Test Connection
- Verify password doesn't have spaces (Gmail app passwords)
- Check firewall/network allows SMTP outbound

**Database connection issues**
- Verify `DATABASE_URL` in `.env`
- `docker ps` to confirm PostgreSQL running
- `docker logs orderdesk-db` for Postgres errors

**User can't be invited**
- Check email not already in system
- Verify inviter is SUPER_ADMIN
- Check SMTP configured (or user has per-user SMTP)

---

## References

- **Next.js Docs**: https://nextjs.org/docs
- **Clerk Docs**: https://clerk.com/docs
- **Drizzle ORM**: https://orm.drizzle.team
- **PostgreSQL**: https://www.postgresql.org/docs
- **Tailwind CSS**: https://tailwindcss.com
- **Zod**: https://zod.dev

---

**End of PRD**

Last updated: June 20, 2026  
Maintained by: Development Team  
Status: Production-Ready (v1.0)
