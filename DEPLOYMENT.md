# OrderDesk — VPS Deployment Guide (Docker + Traefik)

Deploy OrderDesk to a Linux VPS that **already runs Traefik in host-network
mode**. Traefik handles TLS and routing; we add the app + its database and wire
them in via Docker labels:

```
Internet ──443──▶ Traefik (host net, TLS via letsencrypt) ──▶ app (:3000) ──▶ db (Postgres 16)
                         │                                       on orderdesk_net (bridge)
                  discovers the app via the Docker socket + labels
```

Because Traefik runs with `network_mode: host`, it is **not** on a Docker
network — it reads the Docker socket, sees the app's labels, and connects to the
app's container IP on its bridge network. So there's nothing to "join"; the
compose file just names the app's network `orderdesk_net` and points the label
at it. Your Traefik's `websecure` entrypoint, `letsencrypt` resolver, and global
HTTP→HTTPS redirect are already configured, so the labels are pre-filled.

**Companion files already in this repo** (created alongside this guide):

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build → tiny standalone runtime image |
| `.dockerignore` | Keeps build context lean |
| `docker-compose.prod.yml` | db + app (Traefik labels) + one-off `migrate` service |
| `.env.production.example` | Template for your production `.env` |

> The app's `next.config.ts` was set to `output: "standalone"` so the image stays small.
> No Caddy/Nginx here — your existing Traefik terminates TLS.

---

## 0. Prerequisites

- A VPS with a public IP and a **working Traefik container** already routing
  other sites (so ports 80/443 and TLS/ACME are handled by it).
- A **domain name** with a DNS **A record** pointing to the VPS IP
  (e.g. `orderdesk.example.com → 203.0.113.10`). TLS won't issue without this.
- A **Clerk production instance** (publishable + secret keys) — see step 5.
- Your Traefik exposes a `websecure` (:443) entrypoint and a `letsencrypt`
  resolver (already true for the host-mode Traefik config this guide targets).

---

## 1. Install Docker on the VPS

SSH in, then install Docker Engine + the Compose plugin:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # run docker without sudo
newgrp docker                       # apply the group now (or re-login)
docker --version && docker compose version
```

Your Traefik already owns ports 80/443, so no extra firewall rules are needed
for this app. (Ensure SSH + 80/443 are allowed if `ufw` is active — they should
already be, since Traefik is running.)

---

## 2. Get the code onto the VPS

Either `git clone` your repo, or copy the project up with `scp`/`rsync`:

```bash
# Option A — git
git clone <your-repo-url> orderdesk && cd orderdesk

# Option B — from your machine
rsync -av --exclude node_modules --exclude .next ./orderdesk/ user@SERVER:/home/user/orderdesk/
```

You should end up in the project root (the folder containing `docker-compose.prod.yml`).

---

## 3. Point your domain at the server

In your DNS provider, create:

```
Type  Name                       Value
A     orderdesk.example.com      <your VPS IP>
```

Verify it resolves before continuing (TLS issuance depends on it):

```bash
dig +short orderdesk.example.com   # should print your VPS IP
```

---

## 4. Traefik routing (already wired)

Nothing to configure here — the labels in `docker-compose.prod.yml` are
pre-filled to match your host-mode Traefik (`websecure` entrypoint,
`letsencrypt` resolver). For reference, this is what routes the app:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=orderdesk_net"      # which bridge IP Traefik dials
  - "traefik.http.routers.orderdesk.rule=Host(`${APP_DOMAIN}`)"
  - "traefik.http.routers.orderdesk.entrypoints=websecure"
  - "traefik.http.routers.orderdesk.tls=true"
  - "traefik.http.routers.orderdesk.tls.certresolver=letsencrypt"
  - "traefik.http.services.orderdesk.loadbalancer.server.port=3000"
```

The only value you supply is **`APP_DOMAIN`** (step 6). Your Traefik's global
`web → websecure` redirect means plain HTTP automatically upgrades to HTTPS.

> Host-mode Traefik can reach the app because the Linux host routes to the
> `orderdesk_net` bridge subnet. You do **not** add the app to Traefik's network
> (it has none) and you do **not** publish port 3000 on the host.

---

## 5. Set up Clerk for production

The dev `pk_test…` keys are for development. For production:

1. In the [Clerk dashboard](https://dashboard.clerk.com), create (or switch to) a
   **Production** instance.
2. Add your domain (`orderdesk.example.com`) under **Domains**.
3. Copy the **production** keys: `pk_live_…` and `sk_live_…`.
4. Under **Paths**, set Sign-in to `/sign-in` and after-sign-in to `/dashboard`
   (matches the env vars below).
5. Enable the sign-in methods you want (Google, email, etc.).

> Clerk production requires HTTPS — which your Traefik provides automatically.

---

## 6. Create the production `.env`

Copy the template and fill in real values:

```bash
cp .env.production.example .env
nano .env
```

Generate the encryption key once and paste it in:

```bash
openssl rand -hex 32
```

Key things to get right in `.env`:

- **`POSTGRES_PASSWORD`** and the password inside **`DATABASE_URL`** must match.
- `DATABASE_URL` host is **`db`** (the compose service), not `localhost`:
  `postgresql://orderdesk:<password>@db:5432/orderdesk`
- `NEXT_PUBLIC_APP_URL` = `https://orderdesk.example.com` (your real domain).
- **`APP_DOMAIN`** = the host only (`orderdesk.example.com`, no `https://`).
  This is the only Traefik-related value you set; entrypoint/resolver are
  hardcoded in the compose labels to match your Traefik.
- `AUTH_MODE=clerk`, plus the `pk_live…` / `sk_live…` keys.
- `ADMIN_EMAIL` = the email you'll sign in with first (becomes ADMIN).
- `ENCRYPTION_KEY` = the `openssl` output. **Set once — never change it**, or
  saved SMTP passwords / OAuth tokens become unreadable.

> ⚠️ `NEXT_PUBLIC_*` and `AUTH_MODE` are baked into the build. If you change any
> of them later you must **rebuild** the image (`--build`), not just restart.

---

## 7. Build and start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the app image and starts `db` and `app`. Traefik auto-detects the
new container via its labels and (on first request) provisions the TLS
certificate — give it ~30 seconds.

Check everything is healthy:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
```

---

## 8. Create the database schema

The app needs its tables. Run the one-off `migrate` service (it builds with
drizzle-kit and runs `npm run db:push` against the database):

```bash
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate
```

You should see `[✓] Changes applied`. Re-run this any time you pull schema
changes (new tables/columns) in a future release.

> Seeding demo data is **not** needed in production — on your first sign-in,
> the `ADMIN_EMAIL` account is auto-provisioned as ADMIN.

---

## 9. First login

1. Visit **https://orderdesk.example.com**.
2. You'll be redirected to `/sign-in` → sign up/in with your `ADMIN_EMAIL`.
3. You land on the dashboard as **ADMIN** with full access (Clients, Orders,
   Loans, Affiliates, Settings, etc.).

---

## 10. Post-deploy configuration

- **Per-user SMTP / Connect Gmail** → go to **Settings**. If using Google OAuth,
  update the redirect URI in Google Cloud Console to
  `https://orderdesk.example.com/api/oauth/google/callback` and set
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, then rebuild.
- **System clock** — keep the VPS clock synced (`timedatectl set-ntp true`) or
  Clerk JWT `nbf` checks fail (the clock-skew error).

---

## Day-2 operations

### Deploy a new version
```bash
git pull                                           # or rsync the new code
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate  # if schema changed
```

### Logs / status / restart
```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml restart app
```

### Back up the database
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U orderdesk orderdesk > backup_$(date +%F).sql
```

### Restore a backup
```bash
cat backup_2026-06-22.sql | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U orderdesk -d orderdesk
```

### Stop / tear down (data is kept in the named volume)
```bash
docker compose -f docker-compose.prod.yml down          # stop, keep data
docker compose -f docker-compose.prod.yml down -v       # ALSO delete the DB volume (destructive)
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|--------|--------------------|
| 404 from Traefik | `APP_DOMAIN` doesn't match the request host, or the router didn't register. Check `docker logs <traefik>` for the `orderdesk` router; confirm `traefik.enable=true`. |
| TLS cert not issued | DNS A record not pointing to the VPS yet (HTTP-01 challenge fails). `dig +short yourdomain`; then check the Traefik logs / `acme.json`. |
| Bad Gateway (502) | Traefik can't reach the container IP. Ensure the app is on `orderdesk_net` and the `traefik.docker.network=orderdesk_net` label matches; port label must be `3000`. |
| App can't reach DB | `DATABASE_URL` host must be `db` and the password must match `POSTGRES_PASSWORD`. |
| Clerk "JWT nbf / clock skew" | VPS clock is off. `sudo timedatectl set-ntp true`. |
| Changed a `NEXT_PUBLIC_*` value but UI unchanged | Those are build-time. Rebuild: `up -d --build`. |
| Clerk redirect loop / wrong keys | Ensure `pk_live`/`sk_live` are from the **same** Clerk instance and your domain is added there. |
| `relation "..." does not exist` | You skipped step 8 — run the `migrate` profile. |
| Invite/test emails not sending | Configure SMTP in **Settings** (per-user) or the global `SMTP_*` in `.env`. |

---

## What's exposed

- This stack publishes **no host ports**. Only **Traefik** (already running) is
  internet-facing. The **app** is reachable only on the Traefik network; **Postgres**
  sits on a separate private `internal` network that Traefik can't even see.
  Security headers + CSP are already set in `next.config.ts`.
