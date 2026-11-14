# Deploying ResolveX on Vercel

## Read this first: what Vercel can and cannot run

Vercel runs **Functions**, which are request-scoped. Three parts of ResolveX
assume a process that outlives a request:

| Part | On Vercel | What this repo does about it |
|---|---|---|
| **Socket.IO** | ✗ Cannot work | No process holds a websocket open, and room membership could not be shared between invocations even over long-polling. The client falls back to polling (`VITE_REALTIME=off`). |
| **`node-cron` sweep** | ✗ Cannot work | Replaced by a **Vercel Cron Job** calling `api/cron/escalate.js`. |
| **Local disk uploads** | ✗ Cannot work | Only `/tmp` is writable and it is discarded when the instance recycles. **Cloudinary becomes mandatory** — the upload service refuses rather than storing evidence somewhere it will vanish. |

Everything else — the REST API, the State machine, the classification Strategy,
the Chain of Responsibility, notification rows and e-mail — works unchanged.

### So: which shape do you want?

**Option A — all on Vercel (what this guide sets up).** Two Vercel projects,
one for the client and one for the API. You lose instant updates: the UI
refreshes every 20 seconds instead of the moment something changes. Everything
else behaves identically.

**Option B — Vercel for the client, a persistent host for the API.** Put
`server/` on Render, Railway or Fly (any host that runs `npm start`). Socket.IO
and `node-cron` then work exactly as designed, with **no code changes** and no
`VITE_REALTIME=off`. If live updates matter to you — and in a grievance system
where a handler is watching a queue, they plausibly do — this is the better
deployment.

Both are supported. Option A is below; for Option B, deploy `client/` with the
steps in §3 and point `VITE_API_URL` at your API host with `VITE_REALTIME=on`.

---

## 1. Database

Vercel Functions scale horizontally, and each warm instance keeps its own
connection pool. A plain Postgres box will run out of connections. Use a
provider with a built-in pooler:

- **Neon** — use the *pooled* connection string (the one containing `-pooler`).
- **Supabase** — use the connection-pooler URI on port `6543`.
- **Vercel Postgres** — pooled by default.

Then apply the schema:

```bash
psql "$DATABASE_URL" -f db/schema.sql
# Optional, development only — contains demo accounts with a shared password:
psql "$DATABASE_URL" -f db/seed.sql
```

Set `DATABASE_POOL_MAX=1` on the API project. One connection per instance,
multiplied by however many instances Vercel runs, is what the pooler is sized
for.

## 2. The API project

```bash
cd server
npx vercel            # first run links/creates the project
npx vercel --prod
```

Or import the repo in the Vercel dashboard and set **Root Directory** to
`server`. `server/vercel.json` is already configured:

- every path rewrites to `api/index.js`, which exports the Express app;
- `api/cron/escalate.js` keeps its own route (Vercel checks the filesystem
  before applying rewrites) and is invoked hourly by the `crons` entry.

### Environment variables

Set these in **Project → Settings → Environment Variables**:

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | your pooled connection string | |
| `DATABASE_POOL_MAX` | `1` | One connection per warm instance |
| `JWT_SECRET` | `openssl rand -hex 32` | Required, ≥ 32 chars |
| `CRON_SECRET` | `openssl rand -hex 32` | The sweep endpoint refuses to run without it |
| `CLIENT_ORIGIN` | your client URL, e.g. `https://resolvex.vercel.app` | CORS allowlist; comma-separate several |
| `ESCALATION_IN_PROCESS` | `false` | The Cron Job runs the sweep; nothing schedules in-process |
| `CLOUDINARY_CLOUD_NAME` | | Required — uploads have nowhere else to go |
| `CLOUDINARY_API_KEY` | | |
| `CLOUDINARY_API_SECRET` | | |
| `APP_URL` | your client URL | Deep links in e-mails |
| `NODE_ENV` | `production` | |

Optional: `ANTHROPIC_API_KEY` (routing quality — without it the deterministic
keyword engine handles everything), `MAIL_ENABLED` + `SMTP_*` (e-mail; without
them messages are logged), and the `SLA_*` thresholds.

`CRON_SECRET` is the one people forget. Vercel sends it as
`Authorization: Bearer $CRON_SECRET` on every scheduled call, and the endpoint
**fails closed** without it — an unauthenticated URL that mutates every overdue
complaint would be worse than a sweep that never runs.

### Cron frequency

`server/vercel.json` schedules the sweep hourly (`0 * * * *`). **The Hobby plan
allows one cron invocation per day**; on Hobby, change it to `0 3 * * *` and
expect escalations to land up to a day after their threshold. Hourly needs Pro.

Your SLA thresholds are unaffected — `SLA_LEVEL1_DAYS` and `SLA_LEVEL2_DAYS`
still decide *what* is overdue. The schedule only decides how promptly the
system notices.

## 3. The client project

```bash
cd client
npx vercel --prod
```

Or import the repo again with **Root Directory** set to `client`. Vercel detects
Vite; `client/vercel.json` adds the SPA rewrite (so `/complaints/7` resolves
instead of 404ing), immutable caching for hashed assets, and security headers.

| Variable | Value |
|---|---|
| `VITE_API_URL` | the API deployment's origin, e.g. `https://resolvex-api.vercel.app` |
| `VITE_REALTIME` | `off` |
| `VITE_POLL_INTERVAL_MS` | `20000` (optional) |

These are build-time variables — Vite inlines them, so **changing one requires a
redeploy**, not just a restart.

## 4. Close the loop

Set `CLIENT_ORIGIN` on the API project to the client's final URL and redeploy the
API. Until you do, the browser gets a `403 Origin ... is not permitted` — which
is the CORS allowlist doing its job, not a bug.

## 5. Verify

```bash
curl https://<api>.vercel.app/api/health
# {"status":"ok","uptimeSeconds":0}

# The sweep should reject an unauthenticated call:
curl -i https://<api>.vercel.app/api/cron/escalate      # 401

# And accept a correctly signed one:
curl -H "Authorization: Bearer $CRON_SECRET" https://<api>.vercel.app/api/cron/escalate
# {"ok":true,"examined":N,"escalated":N,...}
```

Then sign in on the client and file a complaint. Vercel's **Logs** tab shows the
classification decision and any observer failures.

---

## Known behaviour on Vercel

- **Updates are not instant.** The bell and the dashboards refresh every
  `VITE_POLL_INTERVAL_MS`. The bell's live indicator correctly shows grey rather
  than claiming a connection it does not have.
- **Rate limiting is weaker.** `middleware/rateLimit.js` counts in process
  memory, so each warm instance keeps its own tally and the effective limit is
  roughly `max × instances`. For real protection, move the counter to Redis
  (Upstash) or put Vercel's WAF in front of `/api/auth/*`. The middleware
  signature does not change.
- **Cold starts.** The first request after idle pays Node boot plus a Postgres
  connect, typically 1–3 s.
- **The pool is deliberately not closed** after a cron run. A warm instance
  serves many invocations; ending the pool would make every later one fail with
  `Cannot use a pool after calling end on the pool` until the instance recycled.

## Rolling back

`vercel rollback` on either project, or promote a previous deployment from the
dashboard. The database is not touched by a rollback — `db/schema.sql` is
additive and idempotent, so a redeploy never migrates data.
