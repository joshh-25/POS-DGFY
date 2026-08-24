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

The only Sentry MCP tool with real, working precedent in this repo (used verbatim in both prior
triage docs):

```
mcp__claude_ai_Sentry__search_events(
  organizationSlug: "ch-temp",
  regionUrl: "https://de.sentry.io",
  dataset: "errors",
  query: "event.type:error",
  fields: ["issue", "environment", "release", "error.handled", "count()"],
  sort: "-count()",
  period: "7d",
  limit: 60
)
```

A second Sentry MCP surface exists in this environment (`mcp__plugin_sentry_sentry__*`) — it has
zero precedent here. Use `mcp__claude_ai_Sentry__*` unless there's a specific reason not to.

## Caveats to re-verify each run, not assume

- **`SENTRY_ENVIRONMENT` was unset on prod as of 2026-08-08** — events may still be filing under the
  literal environment `"unknown"`. If an environment-scoped query returns nothing, check for
  `"unknown"` before concluding there's no signal.
- **Deployment coverage has drifted before.** `VITE_SENTRY_*`/`SENTRY_AUTH_TOKEN` were configured on
  STAGING only as of 2026-07-28, and `deploy-backend.yml` had zero `SENTRY_*` references at one
  point. Don't assume every environment is actually reporting — a quiet environment might be a real
  quiet environment, or it might be an environment that stopped sending events.
