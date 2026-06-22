# OrderDesk — Production Codebase

A production-structured ordering & client-management platform: internal staff
console (7 roles) + customer portal, **B2B/B2C clients**, first-class **contacts**
with **contact-level portal access**, server-enforced **RBAC**, server-authoritative
order pricing, and an audit trail.

**Stack:** Next.js 15 (App Router, React 19) · TypeScript · Drizzle ORM ·
PostgreSQL · Tailwind CSS · Zod. Mutations run through React **Server Actions**
into a typed **service layer** where authorization is enforced.

> Verified before shipping: `tsc --noEmit` ✓, `next build` ✓, Drizzle schema → SQL ✓.

---

## Prerequisites

- **Node.js 20+** (`node -v`)
- **Docker** (for the Postgres database) — or any reachable PostgreSQL 14+.

---

## Run it locally (5 steps)

```bash
# 1. environment
cp .env.example .env

# 2. start PostgreSQL (Docker)
docker compose up -d

# 3. install dependencies
npm install

# 4. create the schema and seed demo data
npm run db:push
npm run db:seed

# 5. start the app
npm run dev
```

Open **http://localhost:3000**. You'll land on a **development sign-in** page —
pick any principal to log in as.

**No Docker?** Point `DATABASE_URL` in `.env` at any Postgres instance and skip
step 2.

---

## What to try

**Internal staff** (top of sign-in page):
- **Super Admin** — full access; only role that can manage users.
- **Manager / Admin** — manage clients, products, orders.
- **Sales Rep (Sarah)** — Clients and Orders show only *her assigned* accounts;
  opening one she doesn't own shows a view-only lock.

**Customer portal** (bottom of sign-in page):
- **John Smith (Acme, B2B Owner)** — company portal; "You can edit" org settings.
- **Sarah Khan (Acme, B2B Finance)** — same company, org settings **view-only**
  (no permission).
- **Maria Garcia (B2C)** — individual portal, scoped to her own orders.

Things that exercise the production logic:
- **Clients → Acme** shows the **contacts** table; David Lee has no portal access
  — click **Invite** (allowed only for permitted roles). Recorded to the audit log.
- **Orders → New order**: you submit only product + quantity; the **total is
  computed server-side** from the catalog price (try editing the request — the
  server ignores any client-supplied price).
- Sign in as a portal user and you can only ever see that one client's data.

---

## How it's structured

```
src/
├── db/
│   ├── schema.ts          # Drizzle schema (tables, enums, relations)
│   ├── index.ts           # db client (postgres-js)
│   └── seed.ts            # demo data
├── lib/auth/
│   ├── rbac.ts            # principals, capabilities, can()/authorize()  ← security core
│   └── session.ts        # resolve the current principal (dev cookie / Clerk seam)
├── server/
│   ├── services/         # business logic + authorization (product/client/order)
│   └── audit.ts          # audit writer
├── app/
│   ├── actions.ts        # Server Actions (mutations) → services
│   ├── sign-in/          # dev sign-in
│   ├── dashboard, clients, products, orders   # staff console
│   ├── portal/           # customer portal (contact principal)
│   └── api/dev-auth/     # dev login-as endpoint
└── components/           # UI (shadcn-style, Tailwind)
```

Every mutation path is: **Server Action → requirePrincipal() → service →
authorize() → DB write → audit**. Authorization is never trusted from the client.

---

## Switching to Clerk (production auth)

Local dev uses a cookie-based "login as" so it runs with zero external setup.
For production:

1. `npm install @clerk/nextjs`, wrap the app in `<ClerkProvider>`, add Clerk's
   middleware, and set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`.
2. In `src/lib/auth/session.ts`, replace the cookie read with Clerk's `auth()` to
   get the verified user id, then look up the `users` / `contacts` row by
   `authProviderId`. Everything else (services, RBAC, pages) is unchanged.
3. Set `AUTH_MODE=clerk` (this disables the dev sign-in route).

---

## Security notes (already wired)

- Strict security headers + CSP + `frame-ancestors 'none'` (`next.config.ts`).
- RBAC enforced server-side in the service layer (capability + ownership).
- Order pricing is server-authoritative (integer cents; no floats).
- Audit log for sensitive actions.
- Session cookie is `HttpOnly` / `SameSite=Lax` / `Secure` in production.

Before real production use, complete the remaining items in `security-audit.md`
(rate limiting, CSRF same-origin checks, transactional/tamper-evident audit,
PII encryption) and run an independent penetration test.

---

## Commands

```bash
npm run dev         # start dev server
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # tsc --noEmit
npm run db:push     # apply schema to the database
npm run db:seed     # (re)seed demo data
```
