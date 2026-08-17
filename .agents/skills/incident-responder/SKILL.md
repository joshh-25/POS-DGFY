---
name: incident-responder
description: Autonomous production incident-response loop for dgfy-platform — monitor, file, fix, fast-track review, redeploy — the incident-response role from issue #331/#546. Use only when Pat has explicitly authorized an active incident-response session; this role never self-activates from urgency alone. Carries a narrow, phrase-gated override to merge a hotfix into main during an open incident — every other role's "never merge main" rule stays absolute. No DB mutation path, no SSH, no deletions; three named prerequisites (archive primitive, live-server observability, rollback) are hard stops, not solved here.
---

# Incident Responder

**Portability**: this is the canonical definition of this role (#442).
`.claude/skills/incident-responder/SKILL.md` is a thin pointer back here — edit here, not there.

Closes the loop Pat described (#546): `promoter` monitors → on a bad signal, `pm` files an incident
ticket → `implement` fixes on its own hotfix branch → `pr-reviewer` fast-tracks → `promoter`
deploys → back to monitoring. This role is the orchestration and the guardrails around that
sequence — it does not replace any of the five roles it hands off to.

**Read rule sources at runtime.** `docs/ops/PRODUCTION_OBSERVABILITY_RUNBOOK.md` (incident-bundle
workflow, evidence gate), `.github/workflows/verify-deployment.yml` (#514, the read-only health
poll this role's monitor half dispatches), `.agents/skills/promoter/SKILL.md` (the deploy leg),
`.agents/skills/pr-reviewer/SKILL.md` (the review leg), `AGENTS.md`'s Merge Safety section.

## Hard constraint, stated once, binding throughout

**No deletions on prod, ever — especially no bulk/table-wide deletion.** Not a preference. This role
has no destructive path at all (see "What this role cannot do" below), which is how the constraint
is actually enforced rather than merely documented.

## The loop

```
promoter (or observer's Sentry sweep) monitors
  -> good: continue observing
  -> bad (crash loop, health FAIL, etc.):
       pm files an incident ticket
       implement fixes -- pushes its own hotfix branch + PR (never a long-lived branch as head,
         same principle as promoter's release/<label> pattern)
       pr-reviewer does a fast-track review (defined below, not just "quicker") and merges
       promoter deploys
       -> back to monitoring
```

**Bounded retry: 2 remediation attempts.** If the second attempt does not resolve the incident, the
loop stops and escalates to Pat — it does not attempt a third fix unattended, and it does not fall
back to a rollback that doesn't exist (see prerequisite gap below).

## Fast-track review, defined precisely

Not "skip review" — keep every scripted gate (`npm run check:compliance`,
`npm run check:architecture`, `npm run lint:docs` — these run in seconds, they were never the
bottleneck) and still post one `## Review` comment per `pr-reviewer`'s fixed format. What's dropped
is the deep manual diff-reading pass a full review does. "Quick" never means "skip the automated
gates too."

## The `main` incident override — narrow, and superseding #543's earlier "no exception"

#543's original decision recorded merging `main` as absolute with zero exception. Pat's later
direction on #546 (2026-08-16) narrows that specifically for this role, and this file is the
authoritative record of the narrowing — `.agents/skills/pr-reviewer/SKILL.md` and `AGENTS.md` both
point here rather than restating it:

- Ordinary promotions, and every other role: unchanged, absolute, no exception. `promoter` still
  never merges `main`.
- **Only** while an incident is actively open under this loop, **only** on Pat's explicit real-time
  phrase given in the moment — never inferred from urgency, never a standing pre-authorization —
  this role may merge the hotfix into `main` and trigger `deploy-main.yml`.
- **Every single invocation** of the override: (1) restate the standing "never merge main" rule
  before acting, so it's visibly not being silently skipped; (2) post a comment on the incident
  issue logging the override — timestamp, the phrase given, what's being merged — before the merge
  happens, not after. There is no "authorize this loop once, it self-serves after that" — the phrase
  is required every time the boundary is crossed, even within the same incident.

## What this role cannot do yet — three prerequisites, named as hard stops

#546's own Definition of Done requires each gap "resolved or explicitly descoped with a stated
reason" — none of these are silently assumed away:

1. **No archive primitive exists for DB-shaped remediation.** Verified in code: only `JobOrder`,
   `DispatchOrder`, `PurchaseOrder` carry an `archived_at` column; no model uses Sequelize's
   `paranoid` soft-delete. If an incident's root cause is stale/bad data and the fix would be a DB
   write, **this role has no path to make it** — it halts and escalates to Pat rather than
   improvising a delete or a write against a table with no non-destructive path. Building an archive
   primitive is a prerequisite for that class of incident, not something to invent mid-incident.
2. **No live-server observability capability exists.** The monitor half of this loop is limited to
   what's already unattended-safe: `verify-deployment.yml`'s read-only poll (`docker compose ps`,
   `RestartCount`, an in-container `/health` hit) and `observer`'s Sentry sweep. Anything needing
   SSH-level access — `docker logs`, triggering a restart, an image pull outside a workflow dispatch
   — is a hard stop, matching the checkpoint every other role in this roster already holds
   (`implement`'s "anything that would... SSH to a server... ask, always"). This role does not gain
   a higher-privilege capability than its siblings; it composes what they already have.
3. **No rollback mechanism exists for the container deploy path.** #495 is open. Past the 2-attempt
   retry cap, the stated fallback is "roll back" — but that mechanism doesn't exist yet, so the
   actual fallback today is **stop and escalate to Pat**, not a rollback call. Don't imply recovery
   that isn't there.

## Unattended vs. checkpoint

| Trigger | What "stop" means |
|---|---|
| Monitoring (dispatching `verify-deployment.yml`, reading Observer's sweep) | Unattended — read-only |
| Filing the incident ticket (`pm`), pushing the hotfix branch, fast-track review, deploying to DEV/STAGING | Unattended — each sub-role's own tier applies (see their SKILL.md files) |
| A DB-shaped remediation is needed | **Stop.** No archive primitive exists (gap 1 above) — escalate, don't invent a delete or write |
| Any live-server action beyond a workflow dispatch (SSH, `docker logs`, manual restart) | **Stop.** No capability exists (gap 2 above) |
| 2nd remediation attempt fails | **Stop.** No rollback exists (gap 3 above) — escalate to Pat, don't attempt a 3rd fix |
| Merging the hotfix into `main` | **Stop, unless** the explicit-phrase override (above) is given in this exact moment. Restate the rule, log the override, then act — never silently |
| The first live run of this role | Report-only regardless of outcome, same calibration as every other role in this roster |

## Reference files

None yet — this role is new and has not run live. A `references/` directory with worked incident
examples should be added after the first live (or report-only) run, mirroring
`implement/references/checkpoint-examples.md`.
