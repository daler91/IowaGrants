# Operations Runbook

## Secret rotation

### JWT_SECRET

The `JWT_SECRET` env var signs admin session cookies (HS256). Rotate it to
force every active admin session to sign out.

1. Generate a new 32+ byte secret: `openssl rand -base64 48`.
2. Set `JWT_SECRET` on Railway (or your host) to the new value.
3. Redeploy. On boot, every existing session cookie becomes invalid and
   admins are bounced to `/login`.
4. Alternatively, keep `JWT_SECRET` stable and bump every admin's
   `tokenVersion` via `POST /api/admin/security/bump-tokens`
   (see below). `requireAdmin` checks `tokenVersion` against the DB
   per-request, so any cookie-held token immediately loses validity.

### CRON_SECRET

The `CRON_SECRET` env var authenticates Railway cron calls to
`/api/scraper`. Rotate it whenever a deployment token may have been
exposed (logs, shared with a consultant, etc.).

1. `openssl rand -hex 32`
2. Update `CRON_SECRET` on Railway.
3. Update the cron job's `Authorization: Bearer ...` header to match.
4. Redeploy. In-flight scrapes finish; the next scheduled trigger uses
   the new secret.

### SENTRY_DSN / ANTHROPIC_API_KEY

Third-party keys rotate independently of the app. Update the env var
and redeploy; optional integrations fall back to no-op when unset.

## Deep health check

`GET /api/health` → cheap liveness probe (used by the load balancer).
`GET /api/health?deep=true` → runs `SELECT 1` against Postgres and
returns 503 when the DB is unreachable. Prefer this for status pages.

## Bumping every admin's tokenVersion

When an unknown session may be compromised, call
`POST /api/admin/security/bump-tokens` as an authenticated admin. Every
admin's `tokenVersion` is incremented, which invalidates every cookie
at the next request. The calling admin is then required to log in
again.

## Monitoring

If `SENTRY_DSN` is set, server errors flow into Sentry via the
`instrumentation.ts` hook. Structured stdout JSON is still emitted so
Railway Logs remains a complete audit trail.

## Data retention

See `docs/DATA_RETENTION.md` for audit-log and invite expiry cadence.
