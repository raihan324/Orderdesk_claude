# OrderDesk REST API — Design & Reference

> **Author role:** Senior Solution Architect / Backend API Designer
> **Source of truth:** the existing OrderDesk codebase (Drizzle schema, service layer, `rbac.ts`, `session.ts`, audit log). Nothing here invents domain entities — every resource, field, permission and rule below is derived from the implementation.

## 0. Executive summary & the single most important finding

**Most data operations still run through Next.js Server Actions** + server components, with identity resolved from a **Clerk session** (production) or a **dev cookie** (`od_principal`). The full REST CRUD surface below is still a design.

**However, the API-key credential layer is now implemented** (organization keys, SUPER_ADMIN-managed) — so machine authentication is real today even though the resource endpoints aren't built yet. Existing `/api/*` routes:

| Route | Method | Status | Purpose |
|---|---|---|---|
| `/api/v1/me` | GET | ✅ **built** | Authenticate via `X-API-Key` → returns the resolved organization `SERVICE` principal (sample/verification endpoint) |
| `/api/dev-auth` | GET | built | Set/clear the dev impersonation cookie (disabled when `AUTH_MODE=clerk`) |
| `/api/oauth/google/start` · `/callback` | GET | built | Gmail OAuth for per-user SMTP |

API keys are created/revoked from **Settings → API Keys** (SUPER_ADMIN only) via server actions — not yet via REST. See [§4](#4-api-key-strategy).

➡️ **Consequence:** this document describes a REST surface that wraps the **existing service layer and RBAC**. Each endpoint is tagged with an **implementation status**:

- 🟢 **Backed** — a service method already implements this (e.g. `orderService.create`).
- 🟡 **Proposed** — a thin new service method / REST handler is required. The domain/columns already exist; only the operation is new.

This lets you ship the API incrementally without re-architecting anything.

### What's actually built so far (the credential layer)
| Piece | Where |
|---|---|
| `api_keys` table (org-level: role, prefix, hashed secret, expiry, revocation) | `src/db/schema.ts` |
| `SERVICE` principal kind + `apikey.manage` action (SUPER_ADMIN only) | `src/lib/auth/rbac.ts` |
| Key generate / hash / list / revoke / rotate / **resolve** | `src/server/services/api-key.service.ts` |
| `X-API-Key` → `SERVICE` principal demo endpoint | `src/app/api/v1/me/route.ts` |
| Management UI (create + one-time copy + revoke) | `src/app/settings/api-keys/` + `src/components/api-keys-manager.tsx` |

Still **proposed**: the `/api/v1/*` resource endpoints (clients, orders, …), REST endpoints for key management, the Clerk-JWT Bearer path, and the `api_key_usage` table (today only `lastUsedAt` is tracked on the key).

---

## Deliverable index

1. [Endpoint inventory](#1-complete-endpoint-inventory)
2. [Permission matrix](#2-permission-matrix)
3. [Authentication design](#3-authentication-design)
4. [API key strategy](#4-api-key-strategy)
5. [OpenAPI 3.1 specification](#5-openapi-31-specification) → [`openapi.yaml`](./openapi.yaml)
6. [Swagger UI](#6-swagger-ui) → [`swagger.html`](./swagger.html)
7. [Recommended improvements](#7-recommended-improvements)
8. [Migration considerations](#8-migration-considerations)

Cross-cutting conventions: [query features](#query-conventions) · [error model](#error-model) · [money & rates](#money--rate-conventions)

---

## Domain model (as built)

Entities discovered in `src/db/schema.ts`:

`users` · `clients` · `contacts` · `products` · `orders` · `orderItems` · `lenders` · `loans` · `affiliates` · `affiliateCommissions` · `auditLogs` · `userSmtpSettings`

**Roles & Permissions are NOT tables** — they are code-defined: a `internalRole` enum (7 roles) and an `Action` union (17 permissions) evaluated by `internalScope()` in `rbac.ts`. They are therefore exposed as **read-only metadata** endpoints (`/roles`, `/permissions`), not CRUD resources.

Key foreign-key graph (drives nested routes):

```
clients ─┬─< contacts            (cascade)
         ├─< orders
         └─< loans (borrowerClientId)
orders  ─┬─< orderItems          (cascade)
         ├─< affiliateCommissions (cascade)
         └── affiliateId → affiliates
affiliates ─< affiliateCommissions (cascade)
lenders   ─< loans
users     ─< clients.salesRepId, orders.createdByUserId, loans.createdBy/sanctionedBy, userSmtpSettings (cascade)
contacts  ─< orders.createdByContactId
products  ─< orderItems
```

Single-valued relationships that **do not** become nested collections (honoring "only relationships that exist"): a user has **one** `role` (enum, not a join table) — so there is **no** `GET /users/{id}/roles` collection; instead `GET /users/{id}` returns the role inline, and `/roles` is static metadata.

---

## 1. Complete endpoint inventory

Legend — Status: 🟢 backed by a service method · 🟡 proposed (needs a small new service method). Auth: all endpoints require authentication unless marked **public**.

### Auth & session
| Method | Path | Status | Required permission | Notes |
|---|---|---|---|---|
| GET | `/api/v1/me` | 🟢 **built** | `X-API-Key` (any valid org key) | Returns the resolved organization `SERVICE` principal |
| GET | `/auth/me` | 🟡 | authenticated | Return the resolved `Principal` for any credential (user / contact / service) |
| POST | `/auth/refresh` | 🟡 | public (valid refresh token) | JWT option — rotate access token |
| POST | `/auth/logout` | 🟡 | authenticated | Revoke current session/refresh token |

> Login itself is delegated to **Clerk** (hosted sign-in). See [Authentication design](#3-authentication-design).

### API keys (organization, machine-to-machine — SUPER_ADMIN only)
> ✅ **Management is implemented** today via **Settings → API Keys** (server actions: create / revoke), not yet as REST. The REST endpoints below remain proposed for parity.

| Method | Path | Status | Required permission | Notes |
|---|---|---|---|---|
| GET | `/api-keys` | 🟡 *(UI built)* | `apikey.manage` (SUPER_ADMIN) | List the organization's keys (never returns secret) |
| POST | `/api-keys` | 🟡 *(UI built)* | `apikey.manage` (SUPER_ADMIN) | Create org key with a role; **plaintext returned once** |
| GET | `/api-keys/{id}` | 🟡 | `apikey.manage` (SUPER_ADMIN) | Key metadata |
| POST | `/api-keys/{id}/rotate` | 🟡 *(service built)* | `apikey.manage` (SUPER_ADMIN) | New secret, same id; old invalidated |
| DELETE | `/api-keys/{id}` | 🟡 *(UI built)* | `apikey.manage` (SUPER_ADMIN) | Revoke immediately |
| GET | `/api-keys/{id}/usage` | 🟡 | `apikey.manage` (SUPER_ADMIN) | Usage counters / last-used (needs `api_key_usage` table) |

### Clients
| Method | Path | Status | Permission | Ownership |
|---|---|---|---|---|
| GET | `/clients` | 🟢 `list` | `client.read` | SALES_REP → own only |
| POST | `/clients` | 🟢 `create` | `client.manage` (or SALES_REP self-owned) | rep auto-assigned to self |
| GET | `/clients/{id}` | 🟢 `detail` | `client.read` | own for rep |
| PATCH | `/clients/{id}` | 🟡 | `client.manage` | own for rep |
| DELETE | `/clients/{id}` | 🟡 | `client.manage` | soft-delete (status) recommended |
| GET | `/clients/{id}/contacts` | 🟢 `detail` | `client.read` | own for rep |
| GET | `/clients/{id}/orders` | 🟢 `detail` | `client.read` / `order.read` | own for rep |
| POST | `/clients/{id}/assign-rep` | 🟢 `assignRep` | `salesrep.assign` | — |

### Contacts
| Method | Path | Status | Permission | Ownership |
|---|---|---|---|---|
| POST | `/clients/{id}/contacts` | 🟢 `addContact` | `contact.manage` | parent client owner |
| GET | `/contacts/{id}` | 🟢 `contactDetail` | `client.read` | parent client owner |
| PATCH | `/contacts/{id}` | 🟢 `updateContact` | `contact.manage` | parent client owner |
| DELETE | `/contacts/{id}` | 🟡 | `contact.manage` | parent client owner |
| POST | `/contacts/{id}/invite` | 🟢 `inviteContact` | `portal.invite` | parent client owner; sends email |
| PATCH | `/portal/me` | 🟢 `updateOwnContact` | **PORTAL self** | pinned to `contactId` |

### Products
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/products` | 🟢 `list` | `product.read` (incl. portal) |
| POST | `/products` | 🟢 `create` | `product.manage` (SUPER_ADMIN/ADMIN) |
| GET | `/products/{id}` | 🟡 | `product.read` |
| PATCH | `/products/{id}` | 🟡 | `product.manage` |
| DELETE | `/products/{id}` | 🟡 | `product.manage` (soft delete `isActive=false`) |
| POST | `/products/bulk` | 🟡 | `product.manage` | bulk upsert |

### Orders
| Method | Path | Status | Permission | Ownership |
|---|---|---|---|---|
| GET | `/orders` | 🟢 `list` | `order.read` | rep→own, portal→own client |
| POST | `/orders` | 🟢 `create` | `order.manage` | server-side pricing; optional `affiliateCode` |
| GET | `/orders/{id}` | 🟢 `detail` | `order.read` | own |
| GET | `/orders/{id}/items` | 🟢 `detail` | `order.read` | own |
| PATCH | `/orders/{id}/status` | 🟡 | `order.manage` | status transition (DRAFT→…→FULFILLED/CANCELLED) |
| POST | `/orders/bulk-status` | 🟡 | `order.manage` | bulk transition |

### Users (internal staff)
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/users` | 🟢 `list` | `user.manage` (SUPER_ADMIN) |
| POST | `/users` | 🟢 `invite` | `user.manage` |
| GET | `/users/{id}` | 🟡 | `user.manage` |
| PATCH | `/users/{id}/role` | 🟢 `updateRole` | `user.manage` (last-super-admin guard) |
| PATCH | `/users/{id}/status` | 🟢 `updateStatus` | `user.manage` (last-super-admin guard) |

### Roles & permissions (read-only metadata, code-defined)
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/roles` | 🟡 | authenticated internal |
| GET | `/roles/{role}/permissions` | 🟡 | authenticated internal |
| GET | `/permissions` | 🟡 | authenticated internal |

### Loans & lenders
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/loans` | 🟢 `list` | `loan.read` (rep→own) |
| POST | `/loans` | 🟢 `createApplication` | `loan.manage` |
| GET | `/loans/{id}` | 🟢 `detail` | `loan.read` |
| POST | `/loans/{id}/review` | 🟢 `startReview` | `loan.sanction` |
| POST | `/loans/{id}/sanction` | 🟢 `sanction` | `loan.sanction` |
| POST | `/loans/{id}/reject` | 🟢 `reject` | `loan.sanction` |
| POST | `/loans/{id}/disburse` | 🟢 `disburse` | `loan.sanction` |
| POST | `/loans/{id}/close` | 🟢 `close` | `loan.sanction` |
| GET | `/lenders` | 🟢 `listLenders` | `loan.read` |
| POST | `/lenders` | 🟢 `createLender` | `loan.sanction` |
| GET | `/lenders/{id}` | 🟡 | `loan.read` |
| PATCH | `/lenders/{id}` | 🟡 | `loan.sanction` |

### Affiliates & commissions
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/affiliates` | 🟢 `list` | `affiliate.read` |
| POST | `/affiliates` | 🟢 `create` | `affiliate.manage` |
| GET | `/affiliates/{id}` | 🟢 `detail` | `affiliate.read` |
| PATCH | `/affiliates/{id}` | 🟢 `update` | `affiliate.manage` |
| GET | `/affiliates/{id}/commissions` | 🟢 `detail` | `affiliate.read` |
| GET | `/commissions` | 🟢 `listCommissions` | `affiliate.read` |
| GET | `/commissions/{id}` | 🟡 | `affiliate.read` |
| PATCH | `/commissions/{id}/status` | 🟢 `setCommissionStatus` | `commission.manage` |
| POST | `/commissions/bulk-status` | 🟡 | `commission.manage` |

### Per-user SMTP & profile (self-service)
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/profile` | 🟢 `getProfile` | authenticated internal (self) |
| PATCH | `/profile` | 🟢 `updateProfile` | authenticated internal (self) |
| GET | `/settings/smtp` | 🟢 `getSettings` | internal (self) |
| PUT | `/settings/smtp` | 🟢 `updateSettings` | internal (self) |
| POST | `/settings/smtp/test` | 🟢 `testConnection` | internal (self) |
| POST | `/settings/smtp/verify` | 🟢 `verifySaved` | internal (self) |
| DELETE | `/settings/smtp` | 🟢 `disconnect` | internal (self) |

### Activity / audit logs
| Method | Path | Status | Permission |
|---|---|---|---|
| GET | `/activity-logs` | 🟡 | `audit.read` |
| GET | `/activity-logs/{id}` | 🟡 | `audit.read` |
| GET | `/{entityType}/{id}/history` | 🟡 | `audit.read` | filtered view (`entityType`+`entityId`) |

---

## 2. Permission matrix

The verified role → action matrix from `internalScope()` (`all` = unrestricted, `own` = ownership-scoped to the sales rep's clients, `—` = forbidden). `ALL = {SUPER_ADMIN, ADMIN, MANAGER}`.

| Action | SUPER_ADMIN | ADMIN | MANAGER | SALES_REP | SUPPORT_AGENT | FINANCE_USER | STAFF |
|---|---|---|---|---|---|---|---|
| `user.manage` | all | — | — | — | — | — | — |
| `apikey.manage` *(new)* | all | — | — | — | — | — | — |
| `client.read` | all | all | all | own | all | all | all |
| `client.manage` | all | all | all | own | — | — | — |
| `contact.manage` | all | all | all | own | — | — | — |
| `salesrep.assign` | all | all | all | — | — | — | — |
| `portal.invite` | all | all | all | own | — | — | — |
| `product.read` | all | all | all | all | all | all | all |
| `product.manage` | all | all | — | — | — | — | — |
| `order.read` | all | all | all | own | all | all | all |
| `order.manage` | all | all | all | own | — | — | — |
| `loan.read` | all | all | all | own | — | all | — |
| `loan.manage` | all | all | all | own | — | — | — |
| `loan.sanction` | all | all | — | — | — | all | — |
| `affiliate.read` | all | all | all | — | — | all | — |
| `affiliate.manage` | all | all | all | — | — | — | — |
| `commission.manage` | all | all | — | — | — | all | — |
| `audit.read` | all | all | all | — | — | — | — |

**Portal contacts** (`kind: "PORTAL"`) bypass the role matrix entirely — hardcoded in `can()`:
- `product.read` → always allowed
- `order.read` → allowed only when `resource.ownerClientId === principal.clientId`
- everything else → forbidden

**Ownership semantics**
- *Sales rep* (`own` scope): a resource is owned if `ownerSalesRepId === principal.userId`. List endpoints additionally filter rows via `repScopeUserId()`. For loans, "own" means `loan.createdByUserId === userId`.
- *Portal contact*: a resource is owned if `ownerClientId === principal.clientId`.

**Forbidden scenarios (examples)**
- MANAGER calling `POST /products` → `403` (`product.manage` denied to MANAGER).
- MANAGER calling `POST /loans/{id}/sanction` → `403` (`loan.sanction` reserved to SUPER_ADMIN/ADMIN/FINANCE_USER).
- SALES_REP reading another rep's client (`GET /clients/{id}` not theirs) → `403` (ownership fails).
- Any portal contact calling anything other than product/own-order reads → `403`.
- Last remaining SUPER_ADMIN being demoted/suspended → `409 LAST_SUPER_ADMIN`.

---

## 3. Authentication design

### Current state
Identity is resolved by `getPrincipal()`:
- **Clerk mode** (`AUTH_MODE=clerk`): `clerkMiddleware` + `auth.protect()` guards routes; `getClerkPrincipal()` maps the Clerk user → a DB `users`/`contacts` row → `Principal` (link by `authProviderId`, else by verified email, else self-provision with `ADMIN_EMAIL`→ADMIN / others→MANAGER).
- **Dev mode**: signed `od_principal` cookie (`INTERNAL:<id>` / `PORTAL:<id>`).

There is **no token or API-key path** today.

### Recommendation (hybrid, Clerk-first)

> **Primary: Clerk-issued JWT (Bearer)** for first-party/browser/mobile clients — resolves to the individual user's `Principal` (per-user identity & scope), exactly as the web app does today.
> **Secondary: Organization API keys** for machine-to-machine (cron, integrations, no browser) — **not tied to any user**. The key represents the **main organization** and may be **generated only by a SUPER_ADMIN**.

**Why this fits the architecture:**
- Clerk is already the IdP; its session JWTs require **zero new secret management** and verify with the Clerk backend SDK you already depend on.
- A single API auth layer can resolve **both** credential types into a `Principal`, then call the **existing `authorize()`** — so RBAC stays in one place and is identical to the app.
- Organization keys decouple programmatic access from any one person: they don't break when an employee leaves, and they're centrally controlled by the SUPER_ADMIN rather than scattered across personal accounts.

### Unified API auth middleware (design)

```
Authorization: Bearer <clerk_jwt>      ← first-party clients (per-user)
X-API-Key: odk_live_<id>.<secret>      ← machine clients (organization)
```

```ts
// pseudocode for src/server/api/authenticate.ts
async function authenticatePrincipal(req): Promise<Principal> {
  const apiKey = req.headers["x-api-key"];
  if (apiKey) return principalFromApiKey(apiKey);      // hash → api_keys → ORG SERVICE principal (key.role)
  const bearer = req.headers.authorization?.slice(7);
  if (bearer) return principalFromClerkJwt(bearer);    // clerkClient.verifyToken → same logic as getClerkPrincipal (per-user)
  throw new ApiError(401, "UNAUTHENTICATED");
}
// downstream: authorize(principal, action, ownership)  ← UNCHANGED from today
```

An organization key resolves to a **service principal** — a new `Principal` kind that
represents the organization rather than a person, carrying the **role assigned to the
key at creation** (default `ADMIN`). Because it has no user identity, it uses
**role-based ("all") scope only** — there is no per-user "own" ownership for an org key.
Audit entries record it as `actorType: "SERVICE"` with the key's name.

```ts
// resolved shape (illustrative)
{ kind: "SERVICE", apiKeyId: "ak_123", role: "ADMIN", name: "API: CI pipeline" }
```

### Option B detail (JWT endpoints), if you choose not to use Clerk's hosted tokens directly
- `POST /auth/refresh` → `{ accessToken, expiresIn }` (rotates refresh token; httpOnly cookie or body).
- `POST /auth/logout` → revokes the refresh token / session.
- `GET /auth/me` → current `Principal`.
- Access token TTL 15 min; refresh token TTL 30 days, rotating, rev. on logout.

---

## 4. API key strategy

**Organization-level keys**, for machine clients (Option A). A key belongs to the
**main organization**, not a user, and may be **created/rotated/revoked only by a
SUPER_ADMIN**.

> **Status: implemented.** The `api_keys` table, the generate/hash/list/revoke/rotate/
> resolve service (`src/server/services/api-key.service.ts`), the SUPER_ADMIN-gated
> **Settings → API Keys** UI, and the `/api/v1/me` verification endpoint are live.
> Verify a key with: `curl <app>/api/v1/me -H "X-API-Key: <key>"`.

**Format:** `odk_<env>_<keyId>.<secret>` e.g. `odk_live_a1b2c3.…48hex`. Only the **secret half is hashed** (SHA-256) and stored; the `keyId` is stored in clear for O(1) lookup.

**Who can manage keys:** every `/api-keys` endpoint requires the new
**`apikey.manage`** permission, which is granted to **SUPER_ADMIN only** (no other
role, including ADMIN, may create or see organization keys).

**What a key can do:** at creation the SUPER_ADMIN assigns the key a **role**
(an `InternalRole`, default `ADMIN`) and optional **scope narrowing**. When the key
authenticates it acts as an **organization service principal** with that role's
**"all" scope** — it is never bound to a person and never carries "own"-scoped
ownership. Issue least-privilege keys (e.g. a read-only integration key with a
read-capable role) rather than full keys where possible.

**Lifecycle endpoints (SUPER_ADMIN only)**
| Operation | Endpoint | Behavior |
|---|---|---|
| Create | `POST /api-keys` | body `{ name, role?, scopes?, expiresAt? }`; **returns plaintext once** |
| List | `GET /api-keys` | metadata only (prefix, name, role, lastUsedAt, expiresAt, revokedAt) |
| Inspect | `GET /api-keys/{id}` | single key metadata |
| Rotate | `POST /api-keys/{id}/rotate` | issues a new secret for the same id; old secret invalid immediately; returns plaintext once |
| Revoke | `DELETE /api-keys/{id}` | sets `revokedAt`; key rejected thereafter |
| Expire | (automatic) | `expiresAt` enforced at auth time → `401` |
| Usage | `GET /api-keys/{id}/usage` | `{ totalRequests, lastUsedAt, last30dByDay }` from `api_key_usage` |

**Security rules**
- Only SUPER_ADMIN can mint keys; the key's effective role is fixed at creation and
  capped at the organization's intent (`scopes` may *narrow* but never *widen* the role).
- The key has **no per-user ownership** — org keys use role-based "all" scope, so don't
  assign own-scoped roles (e.g. `SALES_REP`) to a key; they'd have nothing to own.
- Hash with SHA-256; constant-time compare; never log the secret; secret shown exactly once.
- Record the **creating SUPER_ADMIN** (`createdByUserId`) for accountability.
- Rate-limit per key; record `lastUsedAt`, IP, route into `api_key_usage` (also feeds the audit log's `ipAddress`, currently always null).

---

## Query conventions

Applies to every collection endpoint. Standard response envelope:

```json
{ "data": [ ... ], "pagination": { "page": 1, "pageSize": 25, "total": 132, "totalPages": 6 } }
```

| Feature | Query params | Notes |
|---|---|---|
| Pagination | `page` (1-based), `pageSize` (1–100, default 25) | cursor variant `?cursor=` may be added later |
| Sorting | `sort=field` / `sort=-field` | `-` = descending; default `-createdAt` |
| Search | `q=` | entity-specific (clients: name/industry; users: name/email; products: sku/name; affiliates: name/email/code) |
| Field filter | `status=`, `type=`, `clientId=`, `affiliateId=`, `role=`, … | enum-validated |
| Date range | `createdFrom=`, `createdTo=` (ISO-8601) | inclusive |
| Status filter | `status=` | per entity enum |

Ownership scoping is **always applied server-side after** these filters (a sales rep filtering `?status=ACTIVE` still only sees their own clients).

---

## Error model

Uniform error object; HTTP status drives client handling.

```json
{ "error": { "code": "FORBIDDEN", "message": "Not allowed to perform \"product.manage\"", "details": null } }
```

| HTTP | `code` | Mapped from |
|---|---|---|
| 400 | `BAD_REQUEST` | malformed query/params |
| 401 | `UNAUTHENTICATED` | `requirePrincipal()` throws / missing/expired token/key |
| 403 | `FORBIDDEN` | `ForbiddenError` from `authorize()` (incl. ownership failure) |
| 404 | `NOT_FOUND` | `NOT_FOUND` / null detail |
| 409 | `CONFLICT` | `EMAIL_EXISTS`, `INVALID_TRANSITION`, `LAST_SUPER_ADMIN` |
| 422 | `VALIDATION_ERROR` | Zod parse failure (`details` = field errors) |
| 429 | `RATE_LIMITED` | API-key/JWT throttling |
| 500 | `INTERNAL` | unexpected |

---

## Money & rate conventions

- **Money is integer cents** everywhere (`*Cents` fields). Requests that accept human amounts (`unitPrice`, `principal`, `sanctionedAmount`) take **decimal major units** and the server multiplies by 100 (`Math.round`). Responses always return `*Cents`.
- **Rates are basis points** (`*Bps`). Requests take **percent** (`interestRatePct`, `commissionRatePct`); server stores `Math.round(pct * 100)`. `5.25% → 525 bps`.
- **Order pricing is server-authoritative**: clients send only `productId` + `quantity`; the server prices from the live catalog. Never accept line prices from the request.

---

## 7. Recommended improvements

**Missing endpoints (vs. a complete CRUD surface)**
- No update/delete for `clients`, `products`, `lenders`; no `GET` single for `products`/`users`/`lenders`/`commissions`. (All 🟡 above.)
- No order **status transition** endpoint — orders are created `SUBMITTED` and never advance through `CONFIRMED/FULFILLED/CANCELLED` despite the enum supporting it.
- No read API for **audit logs** despite the table being fully populated — high-value, low-effort.

**Missing permissions / RBAC gaps**
- `lender.*` actions don't exist — lender management piggybacks on `loan.sanction`. Consider a dedicated `lender.manage` if lenders get a fuller lifecycle.
- `commission.read` is folded into `affiliate.read`; fine, but document it.
- `contact.manage` covers both creating contacts and editing **portal permissions** (`canManageOrgSettings`, `canManagePortalUsers`) — consider splitting if portal-admin delegation grows.
- The per-contact `canManageOrgSettings` / `canManagePortalUsers` flags exist on the principal but are **not enforced anywhere** in `can()` — either wire them in or remove to avoid false security signals.

**Inconsistent naming**
- Audit actions mix separators: dot-style (`order.created`, `loan.sanctioned`) vs snake (`smtp_settings_updated`, `smtp_settings_disconnected`). Standardize on `entity.verb`.
- DTO money fields are exposed as raw `*Cents`; provide a consistent money object `{ amountCents, currency }` or document the convention prominently (done here).

**Security concerns**
- `auditLogs.ipAddress` is **always null** (never set). Capture it in the API auth layer.
- Self-provisioning grants **MANAGER to any verified email** on first Clerk login — appropriate for an internal tool, but for a public API surface require explicit invitation instead (gate self-provisioning behind an allowlist/domain check).
- No rate limiting today — add per-principal/key throttling before exposing publicly.
- Portal `order.read` ownership relies on `ownerClientId` being passed correctly at every call site — centralize it in the API layer so a forgotten argument can't leak data.

**Standardization opportunities**
- Introduce the response envelope + error object above across all endpoints.
- One pagination/sort/filter parser shared by all list endpoints.
- Move ownership resolution into a single helper so REST handlers can't under-specify it.

---

## 8. Migration considerations

**✅ Already applied** — the API-key credential layer is built. The `api_keys` table
below is live (pushed via `db:push`):

```ts
// api_keys  (organization-level — NOT tied to a user identity) — IMPLEMENTED
id              text pk
name            text not null
role            internal_role not null default 'ADMIN'  // role the key ACTS AS (all-scope)
keyPrefix       text not null unique                    // "odk_<env>_<id>" — clear, indexed
secretHash      text not null                           // SHA-256 of the secret half
createdByUserId text → users.id                         // the SUPER_ADMIN who minted it (audit)
lastUsedAt      timestamp
expiresAt       timestamp
revokedAt       timestamp
createdAt       timestamp not null default now()
```

Differences from the original design (intentional, to keep v1 small):
- **No `scopes` column yet** — a key uses its `role`'s full "all" scope. Add `scopes jsonb` later for narrowing.
- **No `api_key_usage` table yet** — only `lastUsedAt` is tracked. Add the usage table when you need per-request counters / the `/api-keys/{id}/usage` endpoint.

```ts
// api_key_usage  (FUTURE — not yet implemented)
id  pk · apiKeyId → api_keys.id (cascade) · route · method · status · ipAddress · createdAt
```

**RBAC + Principal — DONE:**
- `apikey.manage` action added to `rbac.ts` (SUPER_ADMIN only).
- `SERVICE` kind added to the `Principal` union — `{ kind: "SERVICE", apiKeyId, role, name }` — with a `can()` branch applying the key's role at **"all" scope** (and explicitly denying `user.manage` / `apikey.manage` even at SUPER_ADMIN role). `writeAudit` records `actorType: "SERVICE"`.
- `api-key.service.ts` resolves `X-API-Key` → the org service principal; `authorize()` downstream is unchanged. Middleware exempts `/api/v1(.*)` from the Clerk session guard.

**Still to do for the full API:** the `/api/v1/*` resource handlers + REST endpoints for key management (the UI uses server actions today).

**Service-layer work to light up 🟡 endpoints** (small, mechanical — domain already exists):
- `clientService.update/remove`, `productService.get/update/deactivate`, `userService.get`, `lenderService.get/update`, `orderService.updateStatus`, `commissionService.get`, `affiliate`/audit read helpers.
- An `auditService.list/get` over the existing `auditLogs` table (filters: entityType, entityId, actorId, action, date range).

**API hosting**
- Implement under `src/app/api/v1/**` route handlers (App Router) reusing the **same service layer**. The unified auth middleware resolves `Principal`; handlers call existing `authorize()`. No business logic is duplicated.
- Version from day one: prefix `/api/v1`. The `servers` block in `openapi.yaml` points at `/api/v1`.

**Backward compatibility**
- Server Actions and the API can coexist indefinitely — both call the service layer. No change to the web app is required to add the API.
- `AUTH_MODE` stays as-is; the API auth layer is additive (Bearer/X-API-Key) and falls back to `401` when absent.

---

## 5. OpenAPI 3.1 specification

The machine-readable contract is in **[`openapi.yaml`](./openapi.yaml)** — OpenAPI 3.1.0, with: security schemes (`bearerAuth`, `apiKeyAuth`), every entity schema + request/response DTOs, validation rules mirrored from the Zod schemas, examples, the standard error responses, and per-operation `x-required-permission` / `x-roles` / `x-implementation-status` extensions.

## 6. Swagger UI

Open **[`swagger.html`](./swagger.html)** in a browser (it loads `openapi.yaml` via the Swagger UI CDN). Or serve the spec from a route and point any Swagger/Redoc instance at it. A ready-to-mount Next.js route is described at the top of `swagger.html`.
