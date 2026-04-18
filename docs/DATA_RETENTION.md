# Data Retention Policy

Scope: what the Iowa Grant Scanner keeps, for how long, and who can delete it.

## Public visitors

- No account, no cookies beyond a short-lived rate-limit counter that lives
  in server memory and is wiped on each deploy.
- Server request logs (structured JSON) are stored by the hosting provider
  (Railway) per their retention policy.

## Administrators

| Resource               | Retention                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `AdminUser`            | Until deleted via `DELETE /api/admin/me` (refused when it would leave zero admins).            |
| `AdminInvite` (unused) | Deleted 30 days after the token expires. Expiry itself is set per-invite (default 7 days).     |
| Admin audit entries    | Emitted to stdout as structured JSON. Retained by the host (Railway Logs); no DB copy is kept. |
| JWT session cookies    | 7 days, invalidated immediately on logout or via `POST /api/admin/security/bump-tokens`.       |

## Grant data

| Resource                         | Retention                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Grant` (status OPEN / FORECAST) | Kept while source is live.                                                                                                         |
| `Grant` (status CLOSED)          | Kept for historical reference with `rawData.closedReason`                                                                          |
| `Grant.rawData`                  | Limited to structured fields: `liveBodyText`, `closedReason`, `deadlineSource`, `originalDescription`. See `prisma/schema.prisma`. |

## Third-party processors

- Anthropic (for AI validation / deadline extraction / description rewrites) —
  subject to Anthropic's privacy terms.
- Sentry (optional, if `SENTRY_DSN` is set) — receives server errors and
  request metadata, not cookies or bodies.

## Mechanisms

Invite expiry is enforced at token-verification time by the `expiresAt`
column. `pruneExpiredInvites()` (in `src/lib/cron/retention.ts`) runs at
the end of each `/api/scraper` invocation and deletes AdminInvite rows
whose `expiresAt` is more than 30 days in the past.
