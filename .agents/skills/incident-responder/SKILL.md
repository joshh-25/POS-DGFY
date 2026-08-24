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
sequence — it does not replace any of the five roles it hands off to. Extended by #861 with a
second, manual way in — `/hotfix` — that starts this same loop on demand instead of waiting for a
monitor signal; see "Manual entry point" below.

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

## Manual entry point — `/hotfix`

Added 2026-08-22 (#861). The loop above starts from an automated monitor signal
(`promoter`/`observer`). `/hotfix` is the second, manual way in — Pat explicitly asking for an
on-demand fix outside that monitor loop. It is the *same* loop, the *same* guardrails, the *same*
merge authority — this section changes only how the loop starts and what "done" requires; it grants
no new capability and no second path to `main`.

**Trigger precision (#861 gap 1).** Two distinct paths, not one:

- **Explicit `/hotfix` invocation** — proceed directly into the procedure below. Typing the command
  is itself the confirmation; no further check-in before branching.
- **A free-text message that merely sounds hotfix-shaped** ("prepare a hotfix for X", "we need an
  emergency fix"), with no `/hotfix` actually given — **propose only.** State what invoking
  `/hotfix` would do (which base branch per the rule below, whether an incident ticket already
  exists) and wait for explicit confirmation before creating a branch or writing any code. This
  mirrors the description above ("never self-activates from urgency alone") and every other role in
  the roster — none auto-fires implementation from a detected phrase alone.

**Procedure once triggered:**

1. **Ticket first.** Search for an existing open incident issue (`gh issue list --search`, ≥2
   framings — `pm`'s own search-before-filing discipline). If none exists, hand off to `pm` to file
   one now, before any branch is cut — the same "pm files an incident ticket" step the monitor path
   already does, just manually sourced instead of signal-sourced.
2. **Choose the base branch — a concrete rule, not a vibe (#861 gap 3):**
   - `main` — only when the issue is a live production defect that needs a same-day fix and meets
     this role's own bar for an "actively open incident" — the same bar that gates the `main`-merge
     override below; don't invent a second definition.
   - `staging` — the fix is real but can safely ride the next ordinary `staging → main` promotion
     instead of jumping the queue.
   - If genuinely unclear which applies, ask — this is a judgment call, not something to guess
     silently.
3. **Hand off to `implement`** to branch off the chosen base (never off `develop` for a same-day
   prod fix — `develop` doesn't reach `main` on this timeline), fix, commit, and open the PR — same
   as the monitor path.
4. **`pr-reviewer` fast-tracks** (as defined above), **`promoter`/this role's own override
   deploys** — unchanged.
5. **Back-port to `develop` (#861 gap 2) — part of "done," not a follow-up.** If the fix landed on
   `main` outside the normal promotion flow, this loop is not finished at the deploy step. Follow
   `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-18 "Hotfix and back-port" procedure before
   closing the incident, in full — including its step 3, restated here because getting it wrong
   breaks board mechanics: the back-port PR does **not** `Refs` the closed incident/hotfix PR
   directly (a closed issue can't take the `Refs #N` → `For QA` transition
   `docs/process/ISSUE-TAXONOMY.md` relies on). Hand off to `pm` to file a **fresh issue** for the
   back-port itself first (that fresh issue in turn `Refs`es the original incident and hotfix PR for
   context); then cut a branch off fresh `origin/develop`, `git merge origin/main`, and open the PR
   into `develop` `Refs`-ing the fresh issue. **That PR needs no new merge authority** — it targets
   `develop`, so `pr-reviewer`'s existing unattended-merge policy already covers it, same as any
   other `develop` PR. If the fix instead landed on `staging`, this step doesn't apply — say so
   explicitly rather than silently skipping it, since `staging` already forward-merges into `main`
   on the next promotion and doesn't need a separate back-port. Only once this PR is open (or the
   explicit no-back-port-needed reason is stated) is the incident considered closeable.

Every guardrail elsewhere in this file — the bounded retry, the three "cannot do yet" prerequisites,
the phrase-gated `main` override and its every-single-invocation restatement/logging requirement —
applies identically here, unchanged and unweakened.

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
| Explicit `/hotfix` invocation | Unattended — proceed straight into the manual-entry procedure above |
| A free-text message sounds hotfix-shaped but `/hotfix` was not actually given | **Stop.** Propose invoking `/hotfix` (state the base-branch choice and ticket status) and wait for explicit confirmation — never branch or write code from detection alone |
| Opening the back-port PR into `develop` after a `main` hotfix | Unattended — an ordinary `develop`-based PR, same tier as any `implement`/`promoter` branch-cut PR |
| The first live run of this role | Report-only regardless of outcome, same calibration as every other role in this roster — this governs the very first invocation whether it arrives via the monitor loop or via `/hotfix`; `/hotfix` gets no separate first-use exemption |

## Reference files

None yet — this role is new and has not run live. A `references/` directory with worked incident
examples (including a `/hotfix`-triggered one) should be added after the first live (or
report-only) run, mirroring `implement/references/checkpoint-examples.md`.
