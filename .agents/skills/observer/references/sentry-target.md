# Sentry target — current values (verify before trusting)

Concrete, high-churn detail kept out of `SKILL.md` for the same reason `pm`'s
`references/board-operations.md` exists: it's copy-paste mechanics, not procedure, and it will go
stale faster than the procedure does.

## Current org/region/projects (verified 2026-08-14, from the 08-04/08-08 triage docs)

- Org slug: `ch-temp`
- Region: `https://de.sentry.io`
- Projects in scope: `dgfy-backend`, `dgfy-pos`, `dgfy-skupervisor`, `dgfy-store`
- A second, unrelated Sentry org (`patterueldev`, legacy `backend-jvm`/`ios-swift` projects) also
  exists under the same account — **out of scope, don't triage it.**

**This will change once #222 lands** (Sentry/PostHog migrating from a temporary personal account to
the company org). Re-verify org slug and project names against #222's status before trusting the
values above blindly — don't assume `ch-temp` is still current just because this file says so.

## The proven MCP call shape

Corrected 2026-08-27 (fifth triage pass) — the shape used verbatim in the first four triage docs had
a blind spot, see the caveat below. Use this shape going forward:

```
mcp__claude_ai_Sentry__search_events(
  organizationSlug: "ch-temp",
  regionUrl: "https://de.sentry.io",
  dataset: "errors",
  query: "",
  fields: ["issue", "environment", "release", "error.handled", "count()"],
  sort: "-count()",
  period: "7d",
  limit: 60
)
```

A second Sentry MCP surface exists in this environment (`mcp__plugin_sentry_sentry__*`) — it has
zero precedent here. Use `mcp__claude_ai_Sentry__*` unless there's a specific reason not to.

## Caveats to re-verify each run, not assume

- **`query: "event.type:error"` silently excludes the entire backend operational-alert class —
  found 2026-08-27, after four prior sweeps used it unaware.** `raiseOperationalAlert`
  (`apps/dgfy-api/src/services/operationalAlertService.js`) emits **message-type**, not error-type,
  Sentry events, so a query scoped to `event.type:error` never surfaces them — money-path guards
  included (`DGFY-BACKEND-6`, the PayMongo unknown-session alert, was invisible to every sweep before
  this one as a direct result). Confirmed by holding `release` constant: the `event.type:error` query
  returned 10 aggregate rows with that issue absent; the unfiltered query above returned 12 with it
  present. Do not reintroduce an `event.type:error` filter on the standing sweep query without
  re-checking this.
- **`SENTRY_ENVIRONMENT` was unset on prod as of 2026-08-08** — events may still be filing under the
  literal environment `"unknown"`. If an environment-scoped query returns nothing, check for
  `"unknown"` before concluding there's no signal. As of 2026-08-27, backend `environment` resolves
  correctly (DEV/STAGING distinguishable) — this caveat may be stale for backend specifically, but is
  left here rather than removed since it hasn't been re-checked for every project.
- **Deployment coverage has drifted before.** `VITE_SENTRY_*`/`SENTRY_AUTH_TOKEN` were configured on
  STAGING only as of 2026-07-28, and `deploy-backend.yml` had zero `SENTRY_*` references at one
  point. Don't assume every environment is actually reporting — a quiet environment might be a real
  quiet environment, or it might be an environment that stopped sending events.
