# OrderDesk — CI/CD

GitHub Actions pipeline that tests every change and ships `main` to the
production VPS (`srv1699350`, https://orderdesk.srv1699350.hstgr.cloud).

Deploys **build on the VPS** over SSH (no container registry): the runner
rsyncs the code up and runs `docker compose ... up -d --build`. See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the underlying server/Traefik/DB topology.

---

## Workflows

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **CI** | `.github/workflows/ci.yml` | push to any non-`main` branch, PRs to `main` | `npm ci` → `typecheck` → production `build` |
| **Deploy** | `.github/workflows/deploy.yml` | push to `main`, manual | build-gate → rsync to VPS → `up -d --build` → health-check |
| **Migrate (db:push)** | `.github/workflows/migrate.yml` | manual (typed `migrate`) | runs `drizzle-kit db:push` against the prod DB |
| **Rollback** | `.github/workflows/rollback.yml` | manual (`ref` + typed `rollback`) | redeploys any prior commit/tag, clean tree |

`main` is built by **Deploy**, not CI, so there's no duplicate build.

---

## One-time setup

### 1. Repository secrets

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `2.25.135.144` |
| `VPS_USER` | `root` |
| `VPS_KNOWN_HOSTS` | `2.25.135.144 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPW5OWypqSoI/Upo7SmEGRZRjJPJIagLpsZKZJ7sZ6So` |
| `VPS_SSH_KEY` | full private key (`-----BEGIN OPENSSH PRIVATE KEY----- … -----END …`) of the dedicated deploy key |

The deploy key's **public** half is already in the VPS `root` account's
`~/.ssh/authorized_keys` (comment `github-actions-deploy-orderdesk`). To rotate
it: generate a new keypair, replace that line on the VPS, update `VPS_SSH_KEY`.

### 2. Activate

Merge the pipeline branch into `main`. The first push to `main` runs **Deploy**.

---

## Day-to-day

### Ship a change
```bash
git checkout -b my-change
# ...edit...
git commit -am "feat: ..."
git push -u origin my-change      # CI runs on the branch
```
Open a PR → CI runs again → merge to `main` → **Deploy** ships it automatically.
You can also trigger Deploy manually: **Actions → Deploy → Run workflow**.

### Schema changes
Deploys do **not** auto-migrate. After merging a Drizzle schema change:

**Actions → Migrate (db:push) → Run workflow**, type `migrate` to confirm.

> Equivalent manual command:
> ```bash
> ssh root@2.25.135.144 'cd /docker/Orderdesk_claude && \
>   docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate'
> ```

### Roll back a bad deploy
**Actions → Rollback → Run workflow** → `ref` = a SHA or tag (e.g. `v1.0`),
`confirm` = `rollback`.

The on-VPS build is atomic: if the target ref fails to build, the currently
running container keeps serving — a failed rollback can't take the site down.

### Tag good releases
So rollback targets stay memorable:
```bash
git tag -a v1.1 -m "describe the release"
git push origin v1.1
```
Baseline `v1.0` = the first production deploy (known-good rollback target).

---

## How a deploy works

```
push to main
   │
   ├─ build (GitHub runner): npm ci → typecheck → next build   ← gate
   │
   └─ deploy (GitHub runner):
        rsync code ──SSH──▶ /docker/Orderdesk_claude/ on the VPS   (excludes .env)
        ssh ▶ docker compose -f docker-compose.prod.yml up -d --build app
        curl https://orderdesk.srv1699350.hstgr.cloud/sign-in  (retries until 200)
```

- **`.env` is never touched** — it holds production secrets and lives only on the
  VPS. It's excluded from rsync, `.gitignore`, and `.dockerignore`.
- **Build args** (`NEXT_PUBLIC_*`, `AUTH_MODE`, `DATABASE_URL`) are read from the
  VPS `.env` at build time by compose. Changing any `NEXT_PUBLIC_*` / `AUTH_MODE`
  requires a rebuild — which every deploy already does.
- Deploy and Rollback share a `deploy-production` concurrency lock so they can't
  run at the same time.

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Deploy fails at **Set up SSH** / permission denied | `VPS_SSH_KEY` malformed (paste the whole key incl. BEGIN/END lines) or its public half not in the VPS `authorized_keys`. |
| Deploy fails at **Build & restart** | App build error. The old container keeps running. Check the run log; reproduce locally with `npm run build`. |
| **Health check** fails but build succeeded | Container started but Traefik can't route. Confirm the app joined `google-auth-app_app-network` and the `traefik.docker.network` label matches (see `docker-compose.prod.yml`). |
| `relation "..." does not exist` after deploy | Schema change not applied — run the **Migrate** workflow. |
| Host key verification failed | VPS SSH host key changed; update `VPS_KNOWN_HOSTS` (`ssh-keyscan -t ed25519 2.25.135.144`). |

---

## Files

```
.github/workflows/
  ci.yml          # test on branches/PRs
  deploy.yml      # ship main → VPS
  migrate.yml     # manual db:push
  rollback.yml    # manual redeploy of a ref
Dockerfile               # multi-stage standalone build (DATABASE_URL build arg, public/)
docker-compose.prod.yml  # app on external Traefik + Postgres networks, no bundled db
```
