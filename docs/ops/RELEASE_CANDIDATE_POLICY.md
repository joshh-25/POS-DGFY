---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-09-07
applies_to: development_to_production_release_flow
topic: release_candidate_policy
---

# Release Candidate Policy

## Purpose

This is the authoritative policy for moving `dgfy-platform` changes from
`develop` to production. It supersedes
`docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md` and
`docs/architecture/adr/0030-free-tier-signed-release-authorization.md`, both
now marked `superseded`/`deprecated` — those describe a `master` branch and a
root-owned external release controller that were never built for this
repository. This repo is `Sieitz/dgfy-platform`; there is no `master` branch,
no release controller was ever installed, and the workflows that implemented
that model (`staging-qualification.yml`, `exact-master-sha-qualification.yml`,
`promote-staging-to-master.yml`) were failing or permanently skipped before
being archived to `.github/workflows-archive/`. This document describes what
actually gates a release today, not an aspirational model.

## The one fact that matters

**Merging a PR into `main` no longer deploys production by itself.**
`build-main.yml` (`push: [main]`) was renamed to `deploy-main.yml` and lost
its push trigger 2026-08-14 (#417), as part of removing every
auto-build/auto-deploy trigger repo-wide — Pat's explicit ask, to fully
control when a build/deploy happens rather than have it follow automatically
from a merge. **Production now deploys only when someone manually dispatches
`deploy-main.yml`** from the Actions tab, with the branch selector on `main`.

This changes what a merge into `main` means, but does not add any safety net
that wasn't already missing: there is still no separate production-deploy
approval step, no external signed authorization, and no environment reviewer
gate — GitHub Free does not support any of those, and dispatch access is the
only real gate now. Whoever merges into `main` should still treat it as
"the next `deploy-main.yml` dispatch will ship this," since nothing else
distinguishes a reviewed PR from an unreviewed one at merge time (#330
finding 1). What changed is *when* that ships, not *whether* it's gated on
anything beyond dispatch access.

## Flow

**Default, since #1404 (2026-09-02) — reverses ADR 0074/#980's 2026-08-25 two-stage default; full
decision record: ADR 0074's 2026-09-02 Amendment.**

```text
feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main
```

1. Feature branches PR into `develop`. Ordinary PR checks apply (`pr-checks.yml`).
2. A `to-staging/<label>` branch is cut fresh from `origin/develop`, PRs into `staging`. Once merged,
   `staging` is at that commit.
3. `release/<label>` is cut fresh from `origin/staging` and PRs into `main`. Once its checks pass and
   it is merged, production is live at that commit (once someone dispatches `deploy-main.yml` — see
   "The one fact that matters" above).

**Optional, non-default: the #1007-gated expedited exception.** A promoter may skip the `staging`
leg and PR `release/<label>` (cut fresh from `origin/develop` instead of `origin/staging`) directly
into `main` — but only as #1007's own phrase-gated, logged override
(`.agents/skills/promoter/SKILL.md`'s "Expedited `develop → main` override (#1007)" section owns the
full mechanism), never as a routine per-batch judgment call. That mechanism is unchanged by this
reversal — only which flow it is now an exception *to* has changed.

```text
feature branch -> develop -> release/<label> -> main   (#1007-gated exception only)
```

`release/*` and `to-staging/*` are both already in
`.github/branch-cleanup-policy.json`'s `protectedHeadPrefixes`, so neither kind of promotion
branch is ever eligible for automatic deletion even if the (currently archived) cleanup workflow
is restored.

## Why every promotion cuts a branch, rather than using the long-lived branch directly

`scripts/check-compliance-impact.js` recognizes an aggregate promotion by its PR head —
`PROMOTION_HEAD_PREFIX_BY_BASE` matches a `to-staging/` head into `staging` and a `release/` head
into `main` the same way — and skips re-validating every bundled compliance declaration against
the combined diff — each one already passed this same check on its own PR into `develop`.
Re-validating the bundle produces false positives; see the failure this caused on the first
attempt at the `staging -> main` leg (PR #143), fixed alongside this document.

A named promotion branch exists mainly for a clean, reviewable PR title/diff and a stable
reference if the promotion needs to be reopened; functionally it is the same qualified snapshot as
the branch it was cut from.

`scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_BY_BASE.staging` still recognizes bare
`develop` and the un-dated literal `to-staging` as exact-match heads too (unchanged, not removed)
— a compatibility fallback, not the recommended path going forward.

### Amendment (2026-08-16): `develop → staging` now uses this same pattern

This document originally recorded `develop → staging` as a deliberate exception — direct-head, no
cut branch — reasoned from a real, verified fact that is still true: `develop` is this repo's
default branch, and GitHub hard-refuses to delete a repository's default branch regardless of the
delete-branch-on-merge setting:

```
$ gh api -X DELETE repos/Sieitzz/dgfy-platform/git/refs/heads/develop
{"message":"Cannot delete the default branch", "status":"422"}
```

That still means a `develop → staging` promotion PR merged with delete-branch checked cannot
reproduce the `staging`-deletion incident (#426) that `release/<label>` exists to guard against for
the `staging → main` leg. But the branch-deletion risk was never the *only* reason
`release/<label>` exists — see "clean PR title," "stable reopen reference," and the
compliance-bypass mechanism above, none of which are specific to deletion risk, and all of which
apply equally to `develop → staging`.

Reconsidered 2026-08-16: keeping `develop → staging` as the one direct-head exception meant #512
(the Promoter/Release agent) would need to implement *two* separate promotion mechanisms — a
special-cased direct merge for one leg, cut-branch-and-PR for the other — for no benefit beyond
avoiding one extra branch-cut step on the leg that happens to be safe from deletion. A single
uniform mechanism is simpler to build and reason about, and is already resilient to the residual
risk the original version of this section named: if the default branch is ever repointed away from
`develop`, nothing about this flow needs to change, because it was never depending on that
protection to begin with. Direct-head is retired for this leg; `to-staging/<label>` replaces it.

#512 is built: `.agents/skills/promoter/SKILL.md` implements exactly this single mechanism for both
legs.

## What actually gates a release into `main` today

`pr-checks.yml`, same as any other PR into `develop`/`staging`/`main`:

- `changes` — resolves which image builds the diff needs, and folds in three
  advisory checks (`continue-on-error: true`, visible but never blocking): PR
  title format, PR body sections, and the POS receipt version bump.
- `backend-build-check` / `frontend-build-check` — the actual Docker images
  build cleanly, gated by `shared-changed-paths.yml` so an unrelated change
  doesn't force both.

**Plus, since #1018 (2026-08-25), `promotion-quality-gate.yml`** — the renamed
former `pr-quality-checks.yml` — triggers automatically on its own, on any PR
whose base/head matches a known promotion shape (`staging` ← `to-staging/*`,
`main` ← `release/*`; its own `gate` job decides this, see the workflow's
header comment). It is **not** a job inside `pr-checks.yml` and does not run
on an ordinary feature PR into `develop` — see the "Amendments" entry below
for why once per promotion, not per PR, is what makes this affordable at all.
It carries the blocking API matrix/open-handle diagnostics, migration smoke,
required-index audit, frontend lint/F&B contract tests/builds, the
deterministic Storefront F&B Playwright contract, architecture guardrails,
governed-doc lint, compatibility seams, and diff hygiene that used to be dead
wiring here. `workflow_dispatch`/`workflow_call` remain for a manual full run
against an arbitrary branch.

The former `code-quality` job was removed because it was advisory. Phases 24
and 25 restore the required API, frontend, and deterministic browser coverage
as a blocking reusable workflow. The
**compliance impact guardrail** remains opt-in in `shared-changed-paths.yml`
until the request-time preflight has a CI-safe declaration path; do not treat
that unresolved compliance workflow as fixed by this phase.

`shared-changed-paths.yml`'s `changes` job has a blocking `check:compliance`
step wired up behind an `enforce_compliance_declarations` input, added
2026-08-07. It is currently passed as `false` from `pr-checks.yml` — flipped
off the same day it was turned on, because it immediately blocked an in-flight
release over two already-merged PRs with no fast path to clear it (the
declaration front matter needs a real `POST /api/v1/compliance/preflight`
result, which needs a live authenticated backend session). Re-enabling it is
still the right fix for the gap that let #284/#288 through, but needs a
faster way to satisfy the check to land alongside it, not just a flag flip.
See `docs/compliance/request-time-preflight-protocol.md`.

There is no inventory/regression-risk/QA-evidence gate on `main` today. The
scripts for one exist (`check:batch-inventory`, `check:regression-risk`,
`check:documentation-closure`, `build:release-candidate-evidence`,
`npm run promote:staging-to-master`) and their tests still pass, but nothing
in `.github/workflows/` invokes them anymore — wiring them into a live gate
on `release/* -> main` is a real process decision (what evidence is
mandatory, who reviews it, whether it blocks merge) and is deliberately left
as a follow-up, not assumed here.

## The pre-promotion local gate

`quality-checks` (described above as blocking) was removed from
`pr-checks.yml` entirely on 2026-08-14 (#416) after sitting disabled
(`if: false`, since 2026-08-11 over #345's ~14min unfiltered run). **The path
back in has since been decided and built** (#1018, 2026-08-25) —
`promotion-quality-gate.yml` (renamed from `pr-quality-checks.yml`) triggers
itself automatically on `to-staging/*`/`release/*` promotion PRs specifically,
never on an ordinary `develop` PR; see "What actually gates a release into
`main` today" above and the "Promotion-time CI quality gate" amendment below.
It is **complementary**, not a replacement: `npm run gate:release:local`, run
by hand before a `main` promotion (`develop → main`, or `staging → main` when the optional soak is
used), stays required regardless. **It does not run on the optional `develop → staging` soak leg
itself** — stated explicitly here (#1097) rather than left implicit, matching the ladder table
below and `.agents/skills/promoter/references/promotion-runbook.md`'s "Optional: a `staging` soak
first" section. It is
documented in `docs/testing/release-go-no-go-checklist.md`, which is the
authoritative runbook for that gate — see #375. Do not propose rebuilding it
(#345, #330); invoke it.

## Known gaps (tracked, not solved by this document)

- `release-controller/config/controller.example.json` still lists
  `staging-qualification` / `exact-master-sha-qualification` as required
  checks for a controller that was never installed. Reconciling or removing
  it is a separate decision.
- **Resolved 2026-08-25 (#1018):** `quality-checks` now runs automatically at
  promotion time via `promotion-quality-gate.yml` — see "The pre-promotion
  local gate" above. Its `dgfy-api-quality` job's AVX-dependent tests
  (`menuPdfRasterService.test.js`) are gated on a real probe of the runner's
  own capability (#1035, same PR) rather than assuming every runner has AVX
  — on `sieitz-lg` they show as Jest `skipped`, not a false red.
- `develop` and `staging` have drifted before without a backport in the
  other direction — the compliance bypass this document depends on
  (`scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_BY_BASE`) existed
  on `staging` for several days before it was ported back to `develop` as
  part of this same change. Worth an audit of what else has diverged.
- **Accepted, not solved (2026-08-25, ADR 0074):** with `staging` no longer part of the default
  promotion path, it has no automatic anti-rot mechanism — it will drift stale between whatever
  on-demand refreshes a promoter actually does. If `staging`'s accuracy ever needs to be guaranteed
  rather than best-effort, that's new scope, not something this document or ADR 0074 already solves.

## Amendments

### 2026-08-18: Hotfix and back-port

A hotfix that lands directly on `main` (bypassing the normal `develop → staging → main` flow — the
P0-production-outage case, e.g. #664/PR #665) creates a real risk: `main` now contains a fix that
`develop` and `staging` don't, and the next ordinary promotion can silently overwrite it if the same
line is touched upstream. This happened for real with PR #665 — its own body flagged the gap and
promised a follow-up, closed by #675.

**Procedure**, added here so it's not re-discovered by hand each time:

1. Before the incident is considered closed, merge `origin/main` into `develop` — via a **cut
   branch** off fresh `origin/develop` (`git merge origin/main`, push, PR into `develop`), never
   using `main` itself as a PR head. This is the same principle `to-staging/<label>` and
   `release/<label>` already use for promotion, and for the same reason: PR-ing a long-lived branch
   as head risks GitHub deleting it on merge (the #426 incident).
2. `staging` is **not** back-ported separately — it inherits the fix on the next
   `develop → staging` promotion, same as any other `develop` commit.
3. Link the back-port PR to a fresh issue (`Refs` the original incident and hotfix PR, not `Closes`
   — those are already closed), since the incident issue itself is typically already closed by the
   hotfix PR.

This does not change anything about who may merge `main` (`AGENTS.md`'s Merge Safety rule, and every
role's own "never merge `main`" boundary, are unaffected) — it only closes the gap on what happens
*after* an authorized `main` merge, so the fix doesn't get lost going the other direction.

### 2026-08-22: Compliance verification ladder (#884)

Resolves the question of *where* the heavier, live-credential-dependent verification steps belong
in this flow — the compliance runtime preflight, and the PayMongo-dependent parts of the
downpayment/refund/forfeiture work — none of which are, or should be, a `develop`-merge
precondition.

**The governing split is merge gates vs. release verification.** A merge gate is a precondition on
letting a PR land; it must be satisfiable without a deployed environment, or every leg that needs
one becomes circular ("can't verify until deployed, can't deploy until verified"). Release
verification runs *after* a merge or a deploy, against whatever environment actually exists by
then, with a defined response if it fails — it is never a precondition on the merge that produced
it.

Applying that split to what this repo actually has — **updated 2026-08-25 (#980/ADR 0074) for the
two-stage default; the original three-stage version of this table is preserved in the "2026-08-25:
Retire staging..." amendment below for history**:

| Stage | Gate type | What runs | Environment needed |
|---|---|---|---|
| `feature → develop` | merge gate | `pr-checks.yml` (build checks) + pre-commit statics, including `npm run check:compliance` (a static, sub-second document-shape check — see `docs/compliance/request-time-preflight-protocol.md`). A `major`/`regulatory` declaration may carry a disclosed `NOT-EXECUTED-*` preflight placeholder at this stage — that is the accepted norm, not a defect | none |
| `develop → main` promotion | merge gate for the promotion PR, plus a **preflight sweep** and the **production tenant-schema report** | `npm run gate:release:local` (`run_mode: "full"`, per `docs/testing/release-go-no-go-checklist.md`) against the exact target SHA; the CI-side `promotion-quality-gate.yml` run triggered automatically by the `release/*` PR itself (#1018) — **temporarily `continue-on-error` as of 2026-08-26, see the amendment below (#1063): it runs and records real failures as a comment on #1063, but does not block, and (since the #1066 correction below) does not show red in the Checks tab either**; a real `POST /api/v1/compliance/preflight` run against a deployed non-production host (DEV suffices) for every `NOT-EXECUTED-*` declaration in the batch, reconciled via a small cut branch and PR into `develop` — same pattern as the hotfix back-port below, never a direct commit — merged before `release/<label>` is cut (a **supervised handoff, not an auto-merge**, #1295/#1374, 2026-09-02: the workflow pushes and attempts the PR, but `github-actions[bot]` is org-blocked from creating/approving it, so a human or credentialed AI session opens/merges it in the ordinary case — `.agents/skills/promoter/SKILL.md`'s "Compliance preflight sweep" section owns the fast-signal check for a stuck handoff); **and** `sync-tenant-schemas.js --mode report` (`tenant-schema-report.yml`, #1017) checked against **production** tenant databases. **No `NOT-EXECUTED-*` declaration may reach this leg.** (A `NOT-APPLICABLE-*` ref is a reconciled state, not an outstanding one — `scripts/is-preflight-outstanding.js` already treats it as reconciled; see #1396.) All four run once per promotion batch, before `release/<label>` merges. `.agents/skills/promoter/SKILL.md` owns the executable form. See the 2026-08-25 amendment below for which of these may be skipped under #1007's expedited override (never the tenant-schema report) | DEV (or STAGING) for the preflight sweep — production for the tenant-schema report |
| `develop → staging` (optional, non-default soak) | merge gate for the `to-staging/<label>` PR, if a promoter chooses to route through it | Same `pr-checks.yml`/`promotion-quality-gate.yml` checks any promotion PR gets (the CI gate triggers on this shape too) — **skipped entirely as of 2026-08-26, see the amendment below (#1063)**. **`npm run gate:release:local` does NOT run on this leg** — stated explicitly here (#1097) rather than left implicit by its absence from this row, after a live promotion attempt ran it here anyway and stopped a `develop → staging` promotion on findings that were never this leg's gate to fail on. Does **not** substitute for anything in the row above — the preflight sweep and tenant-schema report still run at the `develop → main` leg regardless of whether this optional soak happened | STAGING |
| post-`deploy-main.yml` | release verification, never a merge gate | `verify-deployment.yml` (PROD infra health — BETA dropped from its environment list 2026-08-23, #329/#895, once beta.dgfy.ph was retired), the credential-free PayMongo webhook probe (`verify:paymongo:webhook`, asserts `401` on an unsigned payload), and — only once PayMongo's Linked Accounts blocker clears — a live low-value payment canary per `docs/ops/PAYMONGO_PRODUCTION_ACTIVATION.md` | production |

This resolves the apparent circularity for the compliance preflight specifically: the endpoint
evaluates a **change proposal** against the policy engine, not the deployed code itself, so it does
not need to run against production or even against the environment the change will eventually ship
to — a deployed non-production host is sufficient, and the one worked example in this repo
(`docs/compliance/impact-declarations/2026-08-07-pos-sentry-independent-debugging.md`) ran it
against the dev host. There is therefore no stage in this flow where the preflight is genuinely
blocked on production; the `NOT-EXECUTED-*` pattern seen across the downpayment epic (#822, #824,
#848, #859, #865, #866, #877) was a process gap — nothing swept the placeholders before promotion —
not a structural one.

This does not reopen the compliance-guardrail CI question from the "What actually gates a release
into `main` today" section above — `enforce_compliance_declarations` stays `false` in
`pr-checks.yml`; this amendment adds a real preflight *sweep* at promotion time, it does not attempt
to make the per-PR guardrail itself call the live endpoint.

### 2026-08-25: Promotion-time CI quality gate (#1018)

Resolves #927 ("where does `pr-quality-checks.yml` run in the promotion flow"). #1015/#1016 (this
same epic's earlier phases, #1008) cut the backend test matrix from ~19.6min to ~2-4min and made
`gate:release:local` instrumented/selectable — the cost that made a full test+lint+build pass too
expensive to run automatically no longer holds. `pr-quality-checks.yml` is renamed
`promotion-quality-gate.yml` and now triggers itself automatically on `to-staging/*` → `staging`
and `release/*` → `main` PRs specifically — never on an ordinary `develop` PR, via its own `gate`
job (mirrors `scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_PREFIX_BY_BASE`). This is a
**complementary** addition to `gate:release:local`, not a replacement for it — deliberately, so this
isn't ambiguous: `gate:release:local` is the promoter's own pre-flight, run *before* the promotion
branch is even cut, on the promoter's own machine, fast to iterate on with `--only`/`--skip`; the
CI run is the recorded, shareable evidence attached to the promotion PR itself once opened, visible
in the Checks tab to anyone reviewing it without needing local/SSH access to reproduce it. Both are
expected to run for every promotion; neither substitutes for the other. See the workflow's own
header comment and `.agents/skills/promoter/SKILL.md`'s "Pre-`main` gates" section for the
executable form.

### 2026-08-25: Retire `staging` from the default promotion path, and an expedited override (#980/#1007, ADR 0074)

Full reasoning and the decision record: `docs/architecture/adr/0074-retire-staging-branch-from-default-promotion-path.md`.
Summarized here as the executable consequence for this policy document.

**What changed.** The default flow (see "Flow" above) drops from three stages to two:
`feature → develop → release/<label> → main`. `release/<label>` is now cut from `origin/develop`,
not `origin/staging`. The `staging` *environment* stays; the `staging` *branch*'s
`to-staging/<label>` mechanism stays too, as a non-default option a promoter may still choose per
batch — see "Flow" above. `staging` is refreshed on demand only (a manual fast-forward, not a PR);
there is no automatic anti-rot mechanism, named as an accepted gap, not a solved one (ADR 0074
Decision 4).

**The original three-stage compliance ladder**, preserved here for history rather than deleted (it
governed every promotion from 2026-08-22 through 2026-08-24):

| Stage | Gate type | What ran | Environment needed |
|---|---|---|---|
| `develop → staging` promotion | merge gate + preflight sweep | `gate:release:local`, `promotion-quality-gate.yml` via `to-staging/*`, the live compliance preflight sweep | DEV (or STAGING) |
| `staging → main` | merge gate | `gate:release:local` on the release SHA, `promotion-quality-gate.yml` via `release/*`, the production tenant-schema report | none beyond required |

Both checks (preflight sweep, tenant-schema report) now land on the single `develop → main` leg —
see the updated ladder table above.

**#1007's expedited override.** `promoter` carries a second, narrow, phrase-gated exception to
merge `main` — parallel to, and independent of, `incident-responder`'s existing override, mirroring
its shape (phrase-gated, restated every invocation, logged before acting) but with its own trigger:
a business-urgency "we critically need this shipped now" request from Pat, not necessarily a
production incident. "Signed review," per #1007's own resolved reading, means an explicit,
attributable, logged authorization — Pat's real-time phrase plus a comment on the promotion PR/issue
naming who authorized it and why — not a revival of ADR 0030's cryptographic signing model.

- **Skippable, only under this override, only on Pat's explicit real-time phrase given in the
  moment (never a standing pre-authorization, never inferred from urgency alone):**
  - `npm run gate:release:local` for the `develop → main` promotion PR.
  - The live compliance preflight sweep (`NOT-EXECUTED-*` declarations may reach `main` when this
    override is invoked — the only case where that's not itself a blocker).
  - (The `staging` soak was already non-default per ADR 0074 — this override doesn't change that,
    it's already skippable by default.)
- **Never skippable, under this override or any other circumstance:**
  - The production tenant-schema report (`tenant-schema-report.yml`, #1017) — this is the specific
    control that would have caught the #860/#639-class crash-loop risk; ADR 0074 Decision 6.
  - `AGENTS.md`'s Merge Safety hard stop (no `in_progress`/`queued` check, `mergeStateStatus: CLEAN`).
  - The never-`--squash` rule.
  - The `release/<label>` cut-from-`origin/develop` head-cut rule (the #426 incident this guards
    against).
- **Every invocation**, matching `incident-responder`'s own discipline exactly: (1) restate the
  standing "gate:release:local and the preflight sweep are normally required" rule out loud before
  acting, so it is visibly not being silently skipped; (2) post a comment on the promotion PR (or the
  tracking issue if no PR exists yet) logging the override — timestamp, the phrase given, what's
  being skipped — before the merge happens, not after.
- **Retro-verification is part of "done," not a follow-up**, mirroring #860's own checklist for
  PR #858: run the skipped `gate:release:local` against the merged SHA afterward and file/annotate
  any real failures (a findings issue, not a revert); confirm the tenant-schema report (already run
  pre-merge, since it's never skippable) stayed clean after `deploy-main.yml` actually ships it;
  if `staging` is now more than a trivial number of commits behind, note it rather than silently
  leaving it stale indefinitely.
- **#495 (no rollback) and #639 (schema repair disarmed) are accepted standing risk for this
  override too** — unchanged from ADR 0074's own Consequences: neither is a prerequisite, and
  neither is made worse by this override specifically, since the tenant-schema report stays
  mandatory regardless of what else is skipped.

`.agents/skills/promoter/SKILL.md`'s own checkpoint table carries the executable form of this row —
read it there for the actual procedure, not just this summary.

### 2026-08-26: `promotion-quality-gate.yml` no longer blocks any promotion leg (#1063)

Pat's call: `promotion-quality-gate.yml` itself is suspected stale/unreliable — unclear whether it's
outdated test scripts or something else — and needs dedicated investigation time that isn't
available right now. Rather than disable or delete the gate outright (which would drop the only
pre-`main` test/build/architecture check this repo has, with no rollback mechanism for a bad deploy
— #495 still open), it's split into two different relaxations by leg — **stated plainly: as a
result, no promotion leg is currently blocked by a red run of this workflow**:

- **`to-staging/*` → `staging` (the optional, non-default soak — see "Flow" above)**: every quality
  job is **skipped entirely**, gated on the workflow's own `is_staging_leg` output. No runner time
  spent, no results produced on this leg at all.
- **`release/*` → `main` (the default `develop → main` promotion, and the `staging → main` leg of
  the optional soak)**: every quality job still **runs in full**, but is unconditionally
  `continue-on-error` — a red run no longer blocks the merge. This is the leg that gates production,
  so a real failure here is still worth reading even though it won't stop anything — see the
  2026-08-26 #1066 correction below for exactly where that signal actually lands (a comment on
  #1063, not the Checks tab).
- `scripts/check-pr-quality-workflow.js`'s guard (built after #1003, when a `quality-checks:` job
  was briefly re-added unconditional and unfiltered) is updated to match: it no longer forbids
  `continue-on-error` outright, but it does enforce the *shape* — every quality job must carry both
  the staging-leg skip condition and the unconditional `continue-on-error: true`, exactly, so a
  further undocumented drift still fails CI.

**This is temporary, not a standing policy change.** The exit condition: once #1063's investigation
confirms the gate is healthy (or fixes what was actually wrong), drop the staging-leg skip
condition and flip every `continue-on-error` back to unconditionally false (or remove them
entirely), and update this section accordingly. Until then, treat a red `promotion-quality-gate.yml`
run on the `→ main` leg as a real signal worth reading, not proof of nothing — advisory means it
doesn't block the merge, not that it's noise. `gate:release:local` and the production tenant-schema
report are unrelated controls and stay exactly as mandatory as before — see the correction
immediately below for `AGENTS.md`'s Merge Safety hard stop, which this entry originally, and
wrongly, also called unaffected.

### 2026-08-26 correction: the shape above didn't actually clear `mergeStateStatus` (#1066)

The entry above claimed `AGENTS.md`'s Merge Safety hard stop (`mergeStateStatus: CLEAN` required)
was "unrelated" and "stays exactly as mandatory as before." That's true of the *rule* — it wasn't
touched — but false of whether the shape above could actually satisfy it. Confirmed live on PR
#1066 (`gh api .../actions/runs/<id>/jobs`): a **job-level** `continue-on-error: true` only spares
the *workflow run's own conclusion*. The individual job/check-run this workflow publishes to the PR
still reports its real `conclusion: failure` when a step inside it fails, and GitHub computes a PR's
`mergeStateStatus` from each check run's own conclusion, not from the workflow's rollup. Net effect
that actually happened: `dgfy-api-quality` legitimately failed on #1066 (a real regression in
`checkComplianceImpactScript.integration.test.js`'s regulatory-floor assertion, unrelated to this
mechanism — tracked separately, Refs #1063), the job-level `continue-on-error` did nothing to change
that job's check-run conclusion, and the PR sat `mergeStateStatus: UNSTABLE` — which trips the Merge
Safety hard stop exactly as if this workflow had never been made advisory at all.

**Fix:** every step inside every quality job now *also* carries its own `continue-on-error: true` —
GitHub Actions only rolls a step's failure into the job's own conclusion when that specific step
lacks it, which is the actual mechanism for a job's check-run to report `success` regardless of what
happens inside it. `scripts/check-pr-quality-workflow.js`'s guard is extended
(`checkStepLevelAdvisory`) to assert every step in every quality job carries this, so a newly-added
step missing it fails CI instead of silently reintroducing a blocking check.

**Said plainly, a further loss of signal, accepted deliberately and temporarily:** this means a real
infra hiccup inside one of these jobs (a transient `npm ci` network failure, a step-level container
wait timeout) now also reports green, not just a genuine test/lint/build failure. To avoid losing
that signal entirely, a new job in the same workflow (`report-advisory-failures`) records the real
per-step outcome and posts it as a comment on #1063 (deduped per commit SHA) whenever a real failure
occurred — so the finding is still recorded somewhere a human can pick up later, even though the
check itself now shows green. This is *not* a substitute for #1063's own root-cause investigation,
and it does not change the exit condition above.

### 2026-08-26 second correction: the Actions API mechanism and the service-container gap (#1066 round 2)

Two more things the entries above got wrong or left incomplete, both caught by `pr-reviewer`'s
second review round on PR #1068:

- **The reporting mechanism above never actually worked as described.** "Re-derives the real
  per-step outcome from the Actions API" (previous paragraph) meant the Actions Jobs API's
  `steps[].conclusion` field — but that field is the *post-override* value (it matches the workflow
  `conclusion` context, not `outcome`), so a step with `continue-on-error: true` that genuinely fails
  still reports `conclusion: "success"` there. Confirmed independently against this repo's own run
  `32620370627`. The Jobs-API approach was dead code that would never have detected any of the
  failures this workflow now swallows. **Fixed:** each quality job now records
  `steps.<id>.outcome` (the pre-override result — the one field that actually survives
  `continue-on-error`) directly into its own job output (`outputs.real_failures`), and
  `report-advisory-failures` reads that via `needs.<job>.outputs.real_failures` — no Actions API call
  involved in detection at all.
- **The `mysql`/`redis` `services:` blocks were left as a documented "accepted residual gap"
  instead of fixed.** GitHub's own service-container provisioning happens during job *provisioning*,
  before any step — including an `if: always()` one — runs, so no continue-on-error at any level
  reaches it; a failing container could still leave `dgfy-api-quality` or `migration-runner-quality`
  check-run red and `mergeStateStatus: UNSTABLE`, same as before the #1066 fix above. A PR-body
  declaration that this was "accepted" is not a substitute for fixing it — `pr-reviewer` correctly
  refused it as such. **Fixed:** both `services:` blocks are replaced with ordinary steps (start the
  containers, wait on the same health checks, stop them) that the existing continue-on-error and
  reporting mechanism already covers like any other step. Every long-running step across the whole
  workflow also picked up its own `timeout-minutes` in the same pass — a job-level timeout is the
  same shape of gap (nothing survives it either), just less obvious than a service container.

**What can still turn a check-run non-green, after both fixes, said plainly:** the `gate` job's own
step failing (a different, also-named failure mode — every quality job below is skipped rather than
shown red, not silently swallowed), the `report-advisory-failures` job envelope itself (its one step
is `continue-on-error`, the job is not), a job-level `timeout-minutes` expiry as a last-resort
backstop, workflow/job cancellation (this workflow's own `concurrency: cancel-in-progress: true`),
and runner unavailability (a queued job is a pending check, which `AGENTS.md`'s Merge Safety rule
treats as a hard stop too). None of these are addressed by either fix; named here rather than
implied away. For the record: GitHub's own service-container provisioning has never actually failed
in this workflow's run history as of this writing — the #1066 round-2 fix closes a real mechanism
gap that had not yet been observed to fire, not an incident postmortem.

### 2026-08-29 → 2026-08-31: the staging-leg skip was briefly retired, then reverted (#1124/#1165, #1253)

Not previously recorded in this file — flagged as a gap by #1253, filed mid-task by `promoter` after
this drift caused live confusion during a real promotion run (PR #1252). Between these two dates,
the `to-staging/*→staging` row above ("skipped entirely as of 2026-08-26") was briefly inaccurate:

- **2026-08-29 (#1124/#1165, item 4):** `promotion-quality-gate.yml` stopped skipping every quality
  job on the `to-staging/*→staging` leg entirely and instead ran them advisory-only, same as the
  `release/*→main` leg — reasoning being that the skip produced zero signal on 25 of the last 30
  runs, and the fastest way to build a track record for #1063's investigation was to actually run
  the jobs, non-blocking. This file's own row above was never updated to match, which is the drift
  #1253 originally flagged.
- **2026-08-31 (#1253), Pat's call:** reverted. The `develop → staging` leg is meant to be the quick
  soak/QA leg — contrasted deliberately with `staging → main` (and the default `develop → main`
  promotion), which is where quality checks belong because that leg ships to production. Back to
  skipping every quality job entirely on the `to-staging/*→staging` leg, matching this row's
  original 2026-08-26 wording again. `scripts/check-pr-quality-workflow.js`'s
  `checkStagingLegSkipShape` and `.agents/skills/promoter/SKILL.md`'s runbook reference are both
  updated to match.

**Accepted trade-off, stated explicitly rather than silently reintroduced:** this brings back the
"zero signal on 25 of the last 30 runs" gap #1124/#1165 tried to close — deliberate, because the
`develop → staging` leg optimizes for promotion speed, not for quality-gate signal; that signal is
still required, unconditionally, at the `staging → main` (or default `develop → main`) leg before
anything reaches production.

### 2026-08-31: The compliance preflight sweep is continuous, not a promotion-time gate (#1163/#1248)

The row above (2026-08-22 amendment, "What actually gates a release into `main` today") and the
2026-08-25 amendment below it both describe the preflight sweep as something a promoter dispatches
"against a deployed non-production host (DEV suffices)" once per promotion batch. That description
is now historical, not current — left as-is above rather than rewritten in place, since this
section's own convention is to record what changed and when, not silently edit prior entries.

**What changed:** the four `PREFLIGHT_HOST`/`PREFLIGHT_COMPANY_TOKEN`/`PREFLIGHT_BOT_EMAIL`/
`PREFLIGHT_BOT_PASSWORD` GitHub Environment secrets the deployed-host design depended on were never
actually provisioned (#1163, confirmed empty on both `STAGING` and `DEV` as of 2026-08-29) and
blocked the 2026-08-29 `develop → main` promotion outright, requiring #1007's expedited override to
ship. Investigating why led to the finding this amendment records: a deployed host bought no
compliance property this policy's own governing principle depends on — restated here since it's the
reason the fix looks the way it does: **"A merge gate ... must be satisfiable without a deployed
environment, or every leg that needs one becomes circular."** The preflight endpoint evaluates the
declaration's *proposed* `impact_declaration` payload against the target tenant's own compliance
posture; it writes nothing, never executes the change's code, and its response carries no
server-generated request id.

**The fix:** the sweep (`.github/workflows/compliance-preflight-sweep.yml`) now provisions its own
ephemeral `mysql` + `redis` + `dgfy-api` instance on the CI runner and a throwaway fixture tenant +
`settings:edit` bot (`apps/dgfy-api/scripts/seed-preflight-fixture.js`, built on the existing
`provisionTenant()` service), rather than hitting a manually provisioned remote bot account. No
GitHub Environment, no secrets, nothing to provision or rotate by hand. It also now
**auto-triggers** on any push to `develop` touching `docs/compliance/impact-declarations/**` and
reconciles + auto-merges its own PR into `develop` once every result in a run passes — so in the
ordinary case every declaration is already reconciled well before a promotion is cut, not something
a promoter dispatches and waits on per batch. Confirmed live end to end (#1163/#1248 spike,
2026-08-31): a real declaration from the 2026-08-31 batch returned `result: no_breach`,
`can_proceed: true` from the real endpoint.

**What's unchanged:** "No `NOT-EXECUTED-*` declaration may reach `main`" (this row's own rule),
`promoter`'s obligation to *verify* zero outstanding declarations before cutting `release/<label>`
(now a check, not a dispatch-and-wait), and #1007's expedited override as the one case a
`NOT-EXECUTED-*` may legitimately still reach `main`. Full detail, the governance path (ADR 0074
Decision 5 is `[default]` tier — amended via a dated block on that ADR, no superseding ADR
required), and the fixture's pinned posture:
`docs/compliance/request-time-preflight-protocol.md`, "Where live preflight actually runs";
`.agents/skills/promoter/SKILL.md`'s "Pre-`main` gates" section owns the executable verify-only
form. Supersedes #1163, which tracked provisioning the manual bot account this change removes the
need for.

### 2026-09-02: Reverse the 2026-08-25 default — restore `develop → staging → main` as default,
`develop → main` as the #1007-gated exception (#1404)

Decision record: `docs/architecture/adr/0074-retire-staging-branch-from-default-promotion-path.md`'s
2026-09-02 Amendment. Summarized here as the executable consequence for this policy document, same
pattern as the original 2026-08-25 entry above.

**What changed.** The "Flow" section above now states the three-stage flow as default again; the
direct `develop → release/<label> → main` path is available only through #1007's own phrase-gated
exception, not as a routine choice.

**The compliance verification ladder table** (2026-08-22 amendment above, updated 2026-08-25) is
**not rewritten in place**, matching this document's own established convention of recording change
rather than silently editing prior entries. Read it as follows going forward: its
"`develop → staging` (optional, non-default soak)" row now describes the **default** soak leg; its
"`develop → main` promotion" row now describes **either** the default flow's final
`staging → release/<label> → main` leg **or** the #1007-gated direct `develop → release/<label> →
main` exception — the gates listed in that row (`gate:release:local`, the preflight sweep
verification, the production tenant-schema report) apply to whichever leg actually merges into
`main`, exactly as before; only which leg is presumed by default has changed.

**What's unchanged, restated so it isn't assumed away:** #1007's expedited-override mechanism itself
— the skippable list (`gate:release:local`, the live compliance preflight sweep), the
never-skippable list (the production tenant-schema report, `AGENTS.md` Merge Safety, never-`--squash`,
the `release/<label>` head-cut rule), the phrase-gate/restate/log-before-merge discipline — none of
it changes here, only its relationship to "the default" does. Also unchanged: the ADR 0074
engineering enablers (#1018/PR #1036, #1015/#1016) that make running the full gate on every
promotion affordable — they stay merged and useful regardless of which flow shape is presumed by
default.

PR: (this PR). Refs #1007, #1008, #980, #1404.

### 2026-09-02: Partial re-arm — 7 of the 8 `gate:release:local`-covered `promotion-quality-gate.yml`
steps are blocking again on `release/*→main` (#1431 Phase 1, PR-A)

Not rewritten in place, same convention as every amendment above. "What actually gates a release
into `main` today"'s `develop → main` row (and the `staging → main` leg it now also covers per the
2026-09-02 #1404 entry above) still describes `promotion-quality-gate.yml` as
`continue-on-error` per the 2026-08-26 #1063 amendment — that description is now **partial, not
wholesale**, as of this entry.

**What changed.** Step-level `continue-on-error: true` was removed from exactly 8 steps in
`.github/workflows/promotion-quality-gate.yml` (the #1066 mechanism: job-level alone doesn't drive a
job's check-run conclusion, only every step in it lacking the step-level line does) —
`enforce_arch_guardrails`, `enforce_controller_boundaries`, `run_api_lint` (`dgfy-api-quality`);
`run_ims_lint` (`frontend-ims-quality`); `run_pos_lint` (`frontend-pos-quality`);
`run_storefront_lint`, `run_storefront_vitest` (`frontend-storefront-quality`); `run_docs_lint`
(`repository-quality`). These are exactly the 7 of `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s
8 "(a) Covered" gates confirmed healthy across 12 recent release-leg runs (rows 4, 5, 9, 11, 12, 13,
15 — one gate maps to two steps, hence 7 gates / 8 steps). `scripts/check-pr-quality-workflow.js`'s
`checkStepLevelAdvisory` now asserts this shape explicitly, per job, in both directions (a listed
step must have zero step-level `continue-on-error`; every other step must have exactly one).

**What did not change, on purpose.** `backend.test_matrix` (`run_test_matrix`, row 10 of the mapping
doc) stays advisory — confirmed still failing for real on every recent release run (stale test
mocks/fixtures/snapshots plus a hosted-runner OOM at the current heap setting), and #1147's mapping
doc names #1015 as its hard prerequisite before it can be flipped; it gets its own follow-up track,
not this PR. `run_web_core_lint` also stays advisory — separate, pre-existing lint debt in
`packages/web-core` with no local gate covering it yet. Every job-level `continue-on-error: true` and
every job's `if: ... && needs.gate.outputs.is_staging_leg != 'true'` guard is unchanged — the
`to-staging/*→staging` soak leg (2026-08-31 #1253 entry above) still runs zero quality jobs, exactly
as before this PR.

**What "blocking" means here, stated explicitly per the plan behind this PR:** a red check-run drives
`mergeStateStatus` to `UNSTABLE`, which `AGENTS.md`'s pre-existing Merge Safety hard stop already
treats as a required-`CLEAN` precondition. This repo has no branch protection (GitHub Free, confirmed
403 on both `branches/main/protection` and `rulesets`), so this is a process-rule enforcement — the
same kind `pr-checks.yml` has always been — not a new technical gate GitHub itself imposes.
`npm run gate:release:local` stays mandatory in full for these 7 gates until a separate, later PR
(PR-B, gated on a real `release/*→main` promotion proving the 7 flipped steps green under production
conditions) delegates them to CI and drops them from the local required set.

PR: (this PR). Refs #1431, #1063, #1066, #1147.

### 2026-09-03: Delegate the same 7 gates out of `gate:release:local`'s required set (#1431 Phase 1,
PR-B) — closes the loop the 2026-09-02 PR-A entry above forward-referenced

Not rewritten in place, same convention as every amendment above. This is the "separate, later PR"
the PR-A entry immediately above named as its own forward reference — that loop is now closed.

**What changed.** `scripts/gate-release-local.js` gained a `CI_ENFORCED_GATES` map naming the same
7 gates PR-A flipped to blocking (`docs.lint`, `architecture.guardrails`, `backend.lint`,
`frontend.ims.lint`, `frontend.pos.lint`, `frontend.storefront.lint`,
`frontend.storefront.contracts`). By default, each now delegates: recorded `status:
"delegated_to_ci"`, `ok: true`, `duration_ms: 0`, never actually invoked. `--include-ci-enforced`
runs all 7 locally anyway; naming one explicitly via `--only` also runs it rather than delegating it
(an explicit `--only` is an explicit request). `run_mode` is unaffected by delegation — a default
run that delegates all 7 is still `run_mode: "full"`, satisfying Decision 7's `run_mode: "full"`
precondition below unchanged; the artifact's new `required_gate_count`/`delegated_gate_count`/
`ci_enforced_gates` fields make what actually ran locally legible instead of inferred.
`scripts/check-pr-quality-workflow.js` gained `checkCiEnforcedGatesAreBlocking()`, asserting every
`CI_ENFORCED_GATES` step id is still present in that same file's `BLOCKING_STEP_IDS` — the
compensating control named in PR-A's own entry as the thing that would keep a future edit from
silently re-adding `continue-on-error` to one of these 7 steps without anything noticing. **12 of
the 19 gates remain required locally** — this is a narrowing of scope, not a removal of the gate
itself; `docs/testing/release-go-no-go-checklist.md`'s "## The 19 gates" section and
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md` carry the full per-gate detail.

**The evidence bar this PR met, and the one residual gap it did not close.** #1431 Phase 1's plan
originally gated this PR on a real `release/*→main` promotion PR proving the 7 steps green under
production conditions (V2 as PR-A's entry describes it). No such promotion has run since PR-A
merged. On escalation, Pat confirmed a substituted, B-amended evidence bar instead: **V1** — a
genuine negative-signal dispatch run (`33650659451`) on a throwaway probe branch with one injected
lint error, confirming `frontend-pos-quality`'s own check-run (not the workflow-run rollup, which
stays `success` under the pre-existing job-level `continue-on-error: true` — see the trap noted
below) reds out to `failure` while every other job stays green; **V2′** — the existing green
`workflow_dispatch` run on `develop` HEAD (`33642893358`) cited in place of a not-yet-run real
promotion, on the strength of a verified command/runner-identity argument (§1–2 of the #1431 Phase 1
PR-B plan) rather than an assumption; **V3** — `npm run gate:release:local --only <the 7>` against
the same HEAD, 7/7 pass, confirming local/CI command parity is exact for 6 of the 7 and a documented
CI-side superset for the 7th (`frontend.storefront.contracts`, unfiltered `npx vitest run` vs. the
local gate's `contract.test`/`integration.test` filter).

**Open, tracked residual gap — not closed by this PR:** no real `release/*→main` PR has yet
exercised these 7 steps as a blocking check on an actual PR's `mergeStateStatus`. V1 demonstrates a
red check-run at the job level; V2′ demonstrates the green path is command/runner-identical to a
real promotion; neither demonstrates the specific mechanism this policy and `AGENTS.md`'s Merge
Safety hard stop both rely on — that a red check-run on this workflow drives a promotion PR's
`mergeStateStatus` to `UNSTABLE`. This is GitHub platform behavior this repo already relies on
elsewhere (`pr-checks.yml`), not a novel risk, but it is untested for this specific workflow on an
actual PR. Track close-out against #1431: the next real `release/*→main` (or `staging→main`)
promotion PR that runs with one of these 7 steps genuinely red should have its `mergeStateStatus`
and Checks-tab state cited back on that issue, and `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s
matching footnote updated once it is.

**The run-rollup reading trap, restated here because it is easy to get backwards.**
`gh run view <id> --json conclusion` reports the *workflow run's* rollup conclusion, which stays
`success` even when a quality job inside it failed — the pre-existing job-level
`continue-on-error: true` (unchanged by PR-A or this PR) spares the run rollup, not the job. The
**job's** check-run is what actually carries `failure` and what GitHub computes `mergeStateStatus`
from. Anyone verifying these gates block — now, or on a future promotion — must read per-job
conclusions (`gh run view <id> --json jobs --jq '.jobs[]|"\(.name) \(.conclusion)"'`) or
`gh pr checks <N>`, never the run rollup; a promoter checking only the rollup would wrongly conclude
the gate is inert.

`run_mode: "full"` still means "every gate this script owns either ran locally or was legitimately
delegated to a verified-blocking CI enforcer" — not "every gate ran locally." Decision 7's
precondition below is satisfied by that reading, not violated by it (see the rejected-alternative
note in the #1431 Phase 1 PR-B plan for why a third `run_mode` value was considered and rejected).

PR: (this PR). Refs #1431, #1063, #1066, #1147, #1435 (PR-A).

### 2026-09-03: `gate:release:local` fully delegated, required-locally is 0 (#1431 Phase C/D) —
closes the umbrella (#1147)

Not rewritten in place, same convention as every amendment above. This is the closing entry: every
gate `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md` still listed as locally required is now delegated
to `promotion-quality-gate.yml`, and every row in that mapping doc has a documented, closed
resolution.

**What changed.** Five more steps flipped from advisory to blocking on real evidence (workflow_
dispatch fault-probe runs plus one throwaway PR against `main`, deleted unmerged — run IDs and the
clean/fault table are in `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s "Evidence behind the Phase C
flips"): `run_dependency_audit_prod`, `run_compliance_contracts` (`repository-quality`),
`run_runtime_doctor` (`dgfy-api-quality`), `run_shared_fnb_contract_tests`
(`frontend-ims-quality`), `check_frontend_budgets` (`frontend-budgets-quality`). All 9 gates that
remained locally required (2, 3, 6, 7, 8, 10, 14, 16, 17 in the mapping doc's numbering) joined
`gate-release-local.js`'s `CI_ENFORCED_GATES` (7 → 16 entries), bringing `required_gate_count` to
**0** on a default run. `scripts/check-pr-quality-workflow.js` gained a two-name
`ADVISORY_CI_ENFORCED_GATES` allowlist (`dependencies.audit.full`, `backend.test_matrix`) so
`checkCiEnforcedGatesAreBlocking()` doesn't demand blocking coverage for the two gates that are
delegated but deliberately not blocking — every other delegated gate still must have real blocking
coverage or that check fails loudly.

**The two deliberate exceptions, settled this phase, not left pending.** `dependencies.audit.full`
is now **permanently** advisory (Pat's call) — Phase A/C evidence confirmed it real-failing on both
the clean and fault-probe runs for a pre-existing, registry-dependent reason unrelated to any code
defect, and its findings never ship. `backend.test_matrix` stays **temporarily** advisory, tracked
by #1469 (filed this phase), gated on #1015 (fast/DB tier split) and #925 (hanging `beforeAll`) —
Phase A/C's own evidence runs reconfirmed it genuinely failing, not just slow, consistent with
#1432's prior root-cause finding.

**Consequence for this policy's own tables above.** Every `develop → main` and `staging → main` row
that named `npm run gate:release:local` as a required step is now stale in that specific respect —
`promotion-quality-gate.yml`'s own check-run is the enforcement mechanism, full stop.
`docs/testing/release-go-no-go-checklist.md` and `.agents/skills/promoter/SKILL.md` have been
updated to stop citing the local script as a promotion gate; this entry is the policy-side record of
why. The #1007 expedited-override row's mention of `gate:release:local` as something skippable is
now moot in substance (there is nothing local left to skip under the override or otherwise) — see
`AGENTS.md`'s own note on this.

### 2026-09-04: DEV deploy environment made optional/intentionally-outdated (#982)

Decision record: issue #982 (Pat, 2026-08-25, superseding #980's original "remove `staging`"
framing — that framing was already retracted before this doc's own 2026-08-25 ADR-0074 amendment
above, unrelated to this entry). Branch/promotion topology is unchanged by this entry — `develop →
to-staging/<label> → staging → release/<label> → main` (or the #1007-gated direct exception) stays
exactly as documented above.

**What changed:** the `DEV` deploy environment (`dev.dgfy.ph`) stops being a routine, expected part
of the promotion cadence. It is now optional and intentionally allowed to go stale — deployed to
opportunistically or manually if useful, never as a default step of a promotion or of a "review,
merge, and deploy" composite instruction. STAGING and PROD deploys are unaffected — both stay
mandatory, exactly as before. The environment itself is kept, not decommissioned, preserving the
option to revive it later.

**Why:** DEV deploys added a routine step with no clear payoff — the environment is rarely tested
directly, and mobile (`apps/dgfy-android-bridge`, the strongest reason DEV would matter) isn't under
active development right now. Full reasoning: issue #982.

**Executable consequence:** `.agents/skills/promoter/SKILL.md`'s checkpoint table splits its single
"Dispatching `deploy.yml` for environment `DEV` or `STAGING`" row into two — STAGING dispatch stays
the unattended default; DEV dispatch is dropped entirely, not kept as an ask-first fallback.
`.agents/skills/promoter/references/promotion-runbook.md`'s deploy-dispatch command drops the
`--ref develop` option from its default copy-paste sequence.

**The compliance preflight sweep's host requirement — already resolved, not by this entry.** #982
also asked to re-anchor the preflight sweep from "DEV (or STAGING)" to "STAGING" explicitly (it had
never actually been exercised against staging — every real declaration checked so far used DEV).
That re-anchoring turned out to be unnecessary: the `### 2026-08-31: The compliance preflight sweep
is continuous...` amendment above (#1163/#1248) already moved the sweep off any deployed host
entirely — it provisions its own ephemeral CI instance and needs neither DEV nor STAGING. This entry
records that #982's concern here is already satisfied, by different, earlier work, rather than
re-editing that section's text (matching this doc's own convention of not rewriting prior entries in
place).

**The `develop → staging` (optional, non-default soak) row's "Environment needed" cell** (the
compliance-verification-ladder table under the 2026-08-22 amendment above) is corrected from
`DEV (or STAGING)` to `STAGING` — nothing in that row's own "What runs" column implies DEV as an
acceptable environment for anything, and #982's decision removes DEV as an implied default anywhere
in this flow.

**Staging reachability, checked as part of this decision (#982's own scope item):** #304
(2026-08-08, closed diagnosed-not-fixed) found `stage.dgfy.ph` truncating large responses above
~109 KB the same way `dev.dgfy.ph` did, root cause never identified beyond "somewhere on the office
network path." Re-checked live 2026-09-04 (three reads of the same 2.26 MB entry bundle, plus the
exact `vendor-maplibre-*.js` asset class that truncated in #304's own finding, at 1,055,621 bytes):
all responses came back complete, no truncation observed. This is a point-in-time confirmation, not
proof the underlying office-network issue was fixed — #304's root cause was never resolved, only
diagnosed. Relying on `staging` more heavily (as this decision does) doesn't newly introduce this
risk; it was already the pre-prod gate. Worth a spot-check again if staging-targeted checks start
failing unexplained.

**Not affected:** `docs/testing/release-go-no-go-checklist.md`, the `staging → main` gate itself,
and the tenant-schema report — none of these depended on DEV.

**Deferred, not urgent:** `apps/dgfy-android-bridge`'s `dev` build flavor
(`apps/dgfy-android-bridge/imin-wrapper/README.md`) points at `pos.dev.dgfy.ph`. An
intentionally-outdated DEV means a `dev`-flavored mobile build now tests against stale backend code.
Not a problem today since mobile isn't under active development — flagged so it isn't rediscovered
as a surprise if/when mobile work resumes.

PR: (this PR). Refs #982, #304.

### 2026-09-04: Frozen promotion-candidate repair loop (#1542)

The three-stage default remains `develop -> staging -> main`, but a promotion is now treated as a
frozen release candidate rather than as repeated movement of the current `develop` branch.

- The promoter assigns a `YYYY-MM-DD-NN` candidate ID and records the initial `develop` SHA in a
  `sku-release-candidate/v1` manifest. The `to-staging/<candidate_id>` merge freezes that snapshot.
- Staging failures are repaired only from the candidate's current `staging` SHA, using disposable
  `fix/staging/<candidate_id>-rN` branches and PRs into `staging`. An isolated fix from `develop`
  may be cherry-picked after review; newer `develop` work is never merged wholesale into a live
  candidate.
- Code-level failures are handed to Conduct with exact-SHA evidence. Live database, secrets, SSH,
  and infrastructure work remains a human stop. The report-only
  `staging-candidate-observation.yml` workflow validates exact SHA, health, migration, API, UI,
  and read-only evidence before a release branch is cut.
- A failed pre-main release revision returns to staging, invalidates the old release head, and
  recuts `release/<candidate_id>-rN` from the repaired staging head. A post-main production failure
  uses the main hotfix path; once stable, the resolved main commit is backported to `develop`, with
  no separate staging backport.

The candidate manifest and observation validator are evidence contracts, not a replacement for the
existing promotion PR checks, production tenant-schema report, or `AGENTS.md` Merge Safety rules.
This is a dated amendment to `[default]` release procedure; no `[binding]` clause is changed.

PR: (this PR, `ci/1431-phase-cde-zero-local-gates`). Refs #1431, #1147, #1469, #1015, #925.

### 2026-09-04: Four `promotion-quality-gate.yml` contract-validation steps flip advisory →
blocking (#1550/#1551 triage); advisory-failure comments live on #1124, not #1063 (#1553)

#1124's own audit-and-repair pass on run `33789462561`'s advisory-failure batch (the most recent
`release/*→main` promotion, PR #1547) root-caused all four of that run's failing steps. Two were
outside the 16-gate `CI_ENFORCED_GATES` framework `gate:release:local` and its 2026-09-03 closeout
(above) cover, and had never gone through any blocking-flip triage at all — #1550 and #1551 both
name this gap explicitly.

**What changed.** `validate_pr_quality_workflow`, `validate_runner_routing`,
`validate_workspace_hygiene`, and `validate_compliance_sweep` (all four in `repository-quality`)
lose their step-level `continue-on-error: true` and join `check-pr-quality-workflow.js`'s
`BLOCKING_STEP_IDS['repository-quality']` and the reporter's `BLOCKING_STEP_NAMES` set. This is
their first recorded disposition — none of the four were ever discussed in a prior amendment here.
Rationale: all four are pure, deterministic checks over checked-in files (workflow YAML shape,
step ordering, contract regression tests) with no registry, network, or database dependency — the
safest class of gate to make blocking, unlike `dependencies.audit.full` (registry-dependent,
permanently advisory) or `backend.test_matrix` (#1469, gated on #1015/#925).

`validate_compliance_sweep`'s failure on run `33789462561` was a **gate bug**, not a real
regression: `scripts/check-compliance-sweep-workflow.test.js` required the "Clear stale per-run
temp state" step to sit at exactly `Checkout + 1`, and #1528's workspace-hygiene rollout had
inserted a read-only `Assert complete working tree (workspace-hygiene v1)` step between them. The
test now checks the actual invariant (#1393's stale-state guard: Clear runs after Checkout and
before Discover, and nothing that writes per-run state may sit between Checkout and Clear) via an
explicit allowlist, rather than a fixed offset — #1551's acceptance criterion was explicit that
this must be fixed "not by loosening the assertion to match an actually-wrong order," and the fix
here is the narrower invariant, not a blanket relaxation. The other three were already passing.

`Run deterministic F&B browser contract` and `Run dgfy-api test matrix` — the run's other two
failing steps — are **not** part of this flip. The former (#1550) is a real Playwright browser
test, structurally flakier than a pure contract check, without the clean run history this kind of
promotion warrants yet; the latter is #1469's own gated flip. Both stay advisory.

**#1553.** `promotion-quality-gate.yml`'s `report-advisory-failures` job has posted its dated
advisory-failure comments to **#1124**, not #1063, since 2026-08-29 (#1165, PR #1067) — #1063's own
root cause was found and fixed, and #1124 became the current epic this evidence pipeline serves.
The redirect was correctly implemented but recorded nowhere outside an inline YAML comment; this
entry, plus a comment on #1063 itself, is the discoverability fix.

PR: `claude/quality-test-gates-hljpv2`. Refs #1124, #1550, #1551, #1552, #1157, #1469. Closes #1553.

### 2026-09-04: Per-app container SemVer — versioning obligations layered onto every leg of this
flow (#1559, ADR 0081)

Decision record: [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md)
(epic #1548, Wave 1). Branch/promotion topology is unchanged by this entry — the flow diagram above
and the frozen-candidate mechanics of the 2026-09-04 "Frozen promotion-candidate repair loop" entry
still describe exactly what merges where and when. What's new is that each of the five apps
(`dgfy-api`, `dgfy-migration-runner`, `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`) now carries its own
`X.Y.Z` version, PR-authored, and every leg of this flow has an obligation about it.

**How a per-app version relates to `candidate_id`.** These are two different identities, not
competing ones: the `YYYY-MM-DD-NN` candidate ID (2026-09-04 entry above) stays the *promotion*
identity — one ID per frozen `develop` snapshot moving through the pipeline. The five app versions
are the *artifact* identities living inside that candidate — what actually gets tagged and pushed to
GHCR. A single candidate can, and typically will, carry unrelated versions per app (`dgfy-api:
1.3.6`, `dgfy-pos: 1.3.3`, `dgfy-storefront: 1.3.0` unchanged) — the candidate ID never encodes a
version, by ADR 0081's own design (its Related epic's Non-goals already ruled out naming
`release/<label>` after a version, for exactly this reason: five independent versions have no single
number to name a branch after).

**Obligations by leg** (full bump-level rule: ADR 0081 Decision 6):

- **Feature branch → `develop`.** Whoever's PR changes an app, or a `packages/*` `file:` dependency
  that app lists, bumps that app's `package.json` version in the same PR. Any increase qualifies;
  patch by default. Not policed at this leg — develop changes are non-blocking by design, and the
  PR-time check (#1560) ships advisory first regardless (ADR 0081 Decision 9).
- **`to-staging/<candidate_id>` → `staging` (promotion).** For every app whose files changed between
  `staging` and the candidate, the candidate's version must be **at least one minor** above
  `staging`'s current version for that app. Because a promotion branch carries no commits of its
  own, this bump has to already exist on `develop` by cut time: the promoter runs a pre-cut floor
  check (`origin/develop` vs `origin/staging`, per app) and, for anything below floor, opens and
  merges a `chore(release): bump <apps> to X.(Y+1).0 for candidate <id>` PR into `develop` first —
  this is a new promoter pre-flight step, alongside the existing candidate-manifest and staging-
  target checks, tracked for implementation in epic #1548's Wave 4 (planned Phase 279; not built by
  this entry).
- **`fix/staging/<candidate_id>-rN` → `staging` (staging repair), and a hotfix → `main`.** Patch
  only — major and minor unchanged, patch strictly greater. Prod ships whatever staging ended on;
  a prod hotfix patches again from there.
- **`release/<candidate_id>-rN` → `main`.** Inherits staging's versions unchanged — holds by
  construction since the branch is cut from `staging`.
- **`develop` back-port of a main hotfix** (per this doc's 2026-08-18 "Hotfix and back-port" entry
  above). Also bumps develop's version for the app the hotfix touched — same PR-authored obligation
  as any other `develop` PR, not a special case.

**Tag/label mechanics** (`:X.Y.Z[-channel]` tags, `org.opencontainers.image.version`,
`APP_VERSION` build-arg, the tag-immutability guard) are ADR 0081's own Decisions 1-4 and 7; not
restated here. The builder changes that actually stamp these, and the promoter's parity gate
(ADR 0081 Decision 8), are deferred to epic #1548's later waves (planned Phases 274, 277-279) — this
entry records the obligation, it does not yet change what any workflow does.

This is a `[default]`-tier procedure amendment under ADR 0039, layered on top of ADR 0081's own
Decision 6 (also `[default]`) — no `[binding]` clause of this policy or of ADR 0081 is changed by
this entry.

PR: (this PR). Refs #1559, #1548, #1560. Closes #1559.

### 2026-09-04: `check:app-versions` flip-readiness gate built, mechanism shipped **not armed**
(#1569, epic #1548 Wave 2, ADR 0081 Decision 9)

Decision record this implements: [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md)
Decision 9 — the PR-time version-bump check (#1560, the entry directly above) "lands advisory first
and flips to blocking only in a later, dedicated phase, once enough clean-run evidence exists."
This entry is that later phase's *mechanism*, not its *flip* — said plainly, matching #1569's own
"Explicitly out of scope" section: **`check:app-versions` is still advisory after this PR, in both
CI and `scripts/pr-checks.js`, exactly as it was before.**

**What this PR built:**

- `scripts/check-version-bump-flip-readiness.js` — measures the ADR 0081 Decision 9 evidence
  threshold (10 merged `develop`-base PRs since #1560's merge commit — PR #1562 — each with a
  pass/warn, not a crash, recorded for `check:app-versions`; OR one full `develop → staging → main`
  promotion cycle green throughout) directly from GitHub's own check-run/job-log history via
  `gh api`, walking `develop`'s commit log since PR #1562's merge SHA. No local counter file — every
  run re-derives the count from GitHub live. Run it by hand
  (`node scripts/check-version-bump-flip-readiness.js`, or `npm run
  check:version-bump-flip-readiness`) before ever considering the flip below. Exit 0 means ready;
  exit 1 is informational only (this script gates nothing in CI).
- `scripts/lib/version-bump-gate-toggle.js` — the single repo-level toggle both
  `.github/workflows/shared-changed-paths.yml`'s `check:app-versions` step and
  `scripts/pr-checks.js`'s own `blocking` argument for that check read directly, at runtime (a step
  can evaluate a `${{ }}` expression against a prior step's output, so this is a genuine read, not
  `scripts/lib/runner-routing-state.js`'s declared-constant-plus-checker pattern — see that file's
  own header for why *that* toggle needs a second validator script and this one doesn't). One
  module, one edit, both surfaces move together.

**Current state, restated so it doesn't need re-deriving from the diff:** `BLOCKING = false` in
`scripts/lib/version-bump-gate-toggle.js`. `check:app-versions` is advisory
(`continue-on-error: true`, sourced from that toggle) in `shared-changed-paths.yml`, and
non-blocking (`blocking: false`, same source) in `pr-checks.js`. As of this entry, zero PRs have
merged into `develop` since PR #1562 (this PR is itself one of the first) and no promotion cycle has
run since — the readiness script's own live dry run against this repo confirms `NOT READY, 0 of 10
PRs counted, promotion-cycle evidence: none yet`. It cannot possibly read ready yet; nothing here
claims otherwise.

**To arm it, later, in a separate PR:** run `node scripts/check-version-bump-flip-readiness.js`, confirm
it reports the threshold met, then edit exactly one line — `scripts/lib/version-bump-gate-toggle.js`'s
`BLOCKING` constant, `false → true` — and open that as its own PR referencing the readiness script's
output as evidence. See `docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s "`check:app-versions`
flip-readiness" entry for the same status, kept in sync with this one.

This is a `[default]`-tier procedure amendment under ADR 0039, matching ADR 0081 Decision 9's own
`[default]` tag — no `[binding]` clause of this policy or of ADR 0081 is changed by this entry.

PR: (this PR). Refs #1569, #1548, #1560. Does not close #1569's parent epic (#1548) — Wave 2 has
more phases beyond this one.

### 2026-09-04: `check_whitespace` root-caused and flipped blocking; `audit_indexes` root-caused,
fixed, stays advisory-with-reason (#1552)

Both of `promotion-quality-gate.yml`'s two remaining un-triaged repeat-advisory-failure steps
(`Check changed-file whitespace`, `repository-quality`; `Audit required indexes`,
`dgfy-api-quality` — 6/13 and 3/13 recurrence respectively in #1124's tally) are now root-caused
with direct log evidence. The two dispositions differ deliberately — this entry states why, rather
than leaving the asymmetry to look like an inconsistency between two otherwise-similar fixes.

**`check_whitespace` — fixed, and flipped blocking, same PR.** `git diff --check
"${BASE_SHA}...${HEAD_SHA}"` is a correct, deterministic, git-native whitespace check; it was never
a diff-range/SHA computation bug (one hypothesis the step's own inline comment floated, ruled out
by the actual failing-run log, which shows genuine trailing-blank-line violations at two specific
file:line locations). It recurred only because nothing upstream of CI caught the violation before a
commit landed — `.husky/pre-commit` ran zero whitespace checks. Fixed by adding a `git diff --cached
--check` block to the pre-commit hook (same git whitespace-diagnostic machinery, staged-vs-HEAD
instead of base...head), with the known, accepted gap stated plainly: `git commit --no-verify`
bypasses it like every other pre-commit check, which is why the CI-side step stays as a backstop
rather than being deleted. `check_whitespace` joins `check-pr-quality-workflow.js`'s
`BLOCKING_STEP_IDS['repository-quality']` and the reporter's `BLOCKING_STEP_NAMES` set (the same
two-list hand-sync #1557 already flags as drift-prone — see below) on the same rationale as the
2026-09-04 "Four contract-validation steps" entry above: pure, deterministic, zero flake surface,
no DB/registry/network dependency, over checked-in state a diff either does or doesn't violate.

**`audit_indexes` — root-caused and fixed, kept tracked-advisory-with-reason.** The prior
investigation's "NOT YET CONFIRMED" framing was based on one run that turned out to be an unrelated
job-envelope death, not evidence about this step itself. Pulling the actual per-step-failure
evidence from #1124's automated advisory-failure comments finds 5 genuine `audit_indexes` failures
in the 08-28–09-03 window; one run's raw log (`missing=3`, `duration_ms=21` — ruling out a
timeout/resource-contention read) shows the finding is real, fast, and deterministic, but **against
the wrong database**: `tenantSchemaBootstrap.integration.test.js`'s idempotent case creates a
`test_tenant_schema-bootstrap-idempotent_*` tenant via Sequelize `sync({ force: true })` — not the
real migration chain — so any index added via a raw migration rather than a model's own `indexes:
[]` is genuinely absent from that fixture's schema. `afterEach` reliably drops this tenant on every
ordinary pass/fail; it only survives into a later step when the test process dies before cleanup
runs — consistent with #1432's already-tracked hosted-runner OOM class (`run_test_matrix` OOMing
under a 2-vCPU runner), corroborated directly: `Run dgfy-api test matrix` (the step immediately
before `audit_indexes`) also failed in all 5 confirmed runs, not a coincidence.
`resolveAuditDatabases()` queries `tenants WHERE status = 'active'` with no opinion on whether a
tenant is a real one or an orphaned test fixture, so it audits the orphan's deliberately-partial
schema as if it were legitimate. The exclusion mechanism for exactly this already exists and is
already proven — `schemaIndexAuditService.js`'s `TEST_TENANT_DB_PREFIX`/
`applyAuditDatabaseFilters()`, gated by `SCHEMA_INDEX_AUDIT_MODE`/
`SCHEMA_INDEX_AUDIT_EXCLUDE_TEST_TENANTS`, already unit-tested, and already wired into the local
`audit:indexes:local` command — the CI workflow step was simply the one caller that never set
either env var. Fixed by adding both to the step's `env:` block (`SCHEMA_INDEX_AUDIT_MODE: test`,
matching the step's existing `NODE_ENV: test` rather than implying a different runtime mode;
`SCHEMA_INDEX_AUDIT_EXCLUDE_TEST_TENANTS: 'true'`) — config-only, zero new script logic, activating
the exact already-tested code path `audit:indexes:local` uses locally.

**Why the dispositions differ.** `check_whitespace` has no flake surface — a diff either introduces
trailing whitespace or it doesn't, over checked-in files, matching the "safest class of gate to make
blocking" rationale the 2026-09-04 "Four contract-validation steps" entry already established.
`audit_indexes` does not share that property: it depends on a live MySQL container's state, itself
downstream of whether `run_test_matrix` (still #1469-gated advisory, known OOM-prone) completes
cleanly in the same job. Fixing the *specific* orphan-leak mechanism found here doesn't rule out a
different tenant-name prefix or a different orphaned-fixture shape producing the same symptom later.
This matches this repo's own established evidence-gating discipline (#1431 Phase C: every step
there was flipped only after both a clean-pass *and* a fault-probe run confirmed it was genuinely
red-on-fault / green-on-clean — never on a same-PR fix alone). **Explicit unblock criterion:** flip
`audit_indexes` to blocking in a follow-up once either (a) a real `release/*→main` promotion run
shows it green post-fix, or (b) a `workflow_dispatch` run against a scratch branch confirms both a
clean pass and, ideally, a fault-probe reproducing the orphan scenario and showing the exclusion
filter catches it. `audit_indexes` does **not** join `BLOCKING_STEP_IDS['dgfy-api-quality']` or
`BLOCKING_STEP_NAMES` in this PR.

**Hand-synced-lists caveat (#1557).** `check_whitespace`'s blocking flip is the *second* step this
repo has added to both `BLOCKING_STEP_IDS` (id-keyed, `check-pr-quality-workflow.js`) and
`BLOCKING_STEP_NAMES` (name-keyed, the `report-advisory-failures` job's embedded `github-script`)
by hand, with no shared source between the two lists — #1557 tracks the underlying drift risk;
this entry does not fix it, only avoids becoming a new instance of it by editing both lists.

PR: (this PR, `fix/1552-quality-gate-steps`). Refs #1552, #1124, #1557, #1432, #1469.

### 2026-09-04: Promoter pre-cut floor step and promotion parity gate, executable (#1588, epic
#1548 Wave 4, Phase 279) — closes the loop the 2026-09-04 "Per-app container SemVer" entry above
left as "not built by this entry"

Decision record this implements: [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md)
Decisions 6 and 8. Not rewritten in place, same convention as every amendment above.

**The pre-cut floor step is now a real, run-it-every-time procedure**, not a stated obligation:
`node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop` before
cutting `to-staging/<candidate_id>` (reuses `--floor` mode, already shipped by #1560/PR #1562 — no
new script for this half), and one ordinary `develop`-base `chore(release): bump <apps> to
X.(Y+1).0 for candidate <id>` PR per app below floor, merged before the cut. Full sequence:
`.agents/skills/promoter/references/promotion-runbook.md`'s "Default: `develop` → `staging` →
`main`" section; obligation restated in `.agents/skills/promoter/SKILL.md`'s "Frozen candidate and
repair loop" section.

**The promotion parity gate is now `scripts/check-image-version-parity.js` (new)**, comparing each
app's `X.Y.Z-staging` and bare `X.Y.Z` published images' candidate-source-identity label. **A
correction the 2026-09-04 "Per-app container SemVer" entry above did not anticipate:** that entry
assumed Phase 277 would stamp this label as part of its own scope ("the builder changes that
actually stamp these ... are deferred to epic #1548's later waves (planned Phases 274, 277-279)").
Phase 277 (#1575/PR #1577, completed 2026-09-04) in fact stamped only
`org.opencontainers.image.version`, not a candidate-source-identity label — this PR (#1588) adds
that missing label-stamping step itself, in the same three builder workflows, naming the label
`org.dgfy-platform.candidate-source-sha` per Decision 8's own "naming and mechanics are that phase's
job" delegation. See ADR 0081's own 2026-09-04 Amendment for the full correction record, and
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s matching "Promotion-time per-app version gates"
section for the executable-mechanism summary.

**Candidate manifest, no longer a hand-waved reference.** `scripts/check-promotion-candidate.js`'s
manifest was already validated by this policy's prior entries but never had a documented on-disk
location or creation step; this PR fixes that gap too — written locally at
`.tmp/release-candidates/<candidate_id>.json` (never committed, matching
`.tmp/release-gates/<sha>/local_readiness.json`'s existing local-artifact convention) right after
the candidate branch is cut, updated on every staging repair and release cut. Full shape:
`.agents/skills/promoter/references/promotion-runbook.md`.

**The `IMAGE_TAG` contract #495 must honor**, restated here per #1588's own acceptance criteria (this
policy records the contract, it does not implement #495's compose split): a version tag of the shape
`X.Y.Z[-channel]` must exist and be pullable for whatever `IMAGE_TAG`-shaped variable(s) #495
introduces — the same tags this ADR's builders already publish, unaffected by this PR.

**What was and wasn't exercised.** No real `to-staging`/`release` promotion has run against this
mechanism yet — everything here is unit-tested (`scripts/check-image-version-parity.test.js`: label
match, missing-predecessor, mismatch) and shape-verified against this repo's real workflow files
(`node scripts/check-deploy-version-stamping-workflow.js`, extended by this PR to also assert the
new label/input wiring), not exercised end to end against a live GHCR push. Say so plainly rather
than implying otherwise on the next real promotion this mechanism runs against.

This is a `[default]`-tier procedure amendment under ADR 0039, layered on top of ADR 0081's own
Decisions 6 and 8 (both `[default]`) — no `[binding]` clause of this policy or of ADR 0081 is changed
by this entry.

PR: (this PR). Refs #1588, #1548, #1559, #1560, #1575. Closes #1588.

### 2026-09-05: `check:app-versions` flipped advisory → blocking (#1592, epic #1548, Phase 283,
ADR 0081 Decision 9) — the flip the 2026-09-04 "flip-readiness gate built, mechanism shipped not
armed" entry above deferred

Decision record this implements: [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md)
Decision 9. This entry is the flip itself — the 2026-09-04 entry above shipped the mechanism only,
explicitly out of scope for its own PR (#1569).

**Re-confirmed live at implementation time, not reused from #1592's own 2026-09-05 filing-time
snapshot** (that issue's Context section already carried a live-at-filing count; this PR re-ran the
same measurement again at PR-open time per the issue's own explicit "Do not... without re-confirming
the evidence threshold live at implementation time" instruction, since more PRs land between filing
and implementation):

```
[check-version-bump-flip-readiness] ADR 0081 Decision 9 evidence threshold, since 5eb17c3 (PR #1562, Refs #1560):

PR-count evidence: 10 of 10 qualifying develop-base PRs.
Promotion-cycle evidence: none yet

[check-version-bump-flip-readiness] READY -- the ADR 0081 Decision 9 evidence threshold is met.
```

Of the 10 counted PRs at this re-confirmation: 7 `pass` (#1591, #1583, #1582, #1581, #1580, #1579,
#1578) and 3 `warn` (#1586, #1567, #1566) — a different composition than #1592's own filing-time
snapshot (which cited 6 pass / 4 warn) since the qualifying window is a rolling one keyed off
ancestry from the PR #1562 anchor, not a fixed set; both outcomes count as valid evidence per
#1569's own design (a `warn` proves the check correctly caught a real violation without crashing,
which is exactly what needs demonstrating before trusting it to block).

**What changed:** `scripts/lib/version-bump-gate-toggle.js`'s `BLOCKING` constant, `false → true` —
the single edit both consuming surfaces derive from.

**A real bug was found and fixed alongside the flip, not assumed away.** The 2026-09-04 entry's own
claim that "both consumers move together; nothing else needs editing" held for
`.github/workflows/shared-changed-paths.yml` (its `continue-on-error:` expression already read the
toggle's boolean output directly) but not for `scripts/pr-checks.js`: that surface's `app version
bump` check hardcoded its `result` field to `'pass'`/`'warn'` regardless of the `blocking` argument
passed to `addCheck()`, so `computeOverallResult()` — which only escalates `overallResult` to `FAIL`
on `blocking && result === 'fail'` — could never actually reach `FAIL` for this check; a `'warn'`
can only degrade `PASS` to `PARTIAL`. Confirmed live before shipping the flip:
`computeOverallResult([{ result: 'warn', blocking: true }])` returned `'PARTIAL'`, not `'FAIL'`.
Fixed by deriving the result severity from the same `BLOCKING` toggle
(`resolveAppVersionsCheckResult()`, exported and unit-tested in `scripts/pr-checks.test.js`) rather
than a hardcoded string — this is a fix to the consuming surface's own severity mapping, not a
touch to `scripts/check-app-version-bump.js`'s check logic itself (out of #1592's scope per its own
"Do not" section).

**Both consuming surfaces confirmed to actually block, not just documented as blocking:**

- `scripts/pr-checks.js` — `scripts/pr-checks.test.js` now asserts, against the real
  `version-bump-gate-toggle.js` module (not a mock), that a missing/insufficient bump produces
  `result: 'fail'` and `computeOverallResult(...) === 'FAIL'` — the same test would have failed
  against the pre-fix code.
- `.github/workflows/shared-changed-paths.yml` — a throwaway branch/PR combining this flip with a
  deliberately unbumped `apps/dgfy-api` source change was opened against `develop` to observe the
  "Enforce per-app version bump on source changes" step actually fail the job (red, not a swallowed
  warning) under live CI, then closed without merging once confirmed. See #1592's own PR body for
  the run link.

**Currently open PRs affected by this flip:** stated in #1592's PR body / final report at
implementation time — a heads-up rather than a silent flip landing mid-flight, per that issue's own
"Risks / notes" section.

**Consequential update:** `.agents/skills/pr-reviewer/SKILL.md`'s "Version level" audit item
(#1568/PR #1570) had its severity language updated from "`nit` while advisory,
`should-fix` once flipped" to reflect blocking is now live — a mismatched version level (the
narrower case CI's `any-increase` mode does not itself catch — a nonzero-but-too-small bump) is now
a `blocker`, matching the standing severity CI itself applies to a missing/insufficient bump. See
that file directly rather than a restated copy here.

This is a `[default]`-tier procedure amendment under ADR 0039, matching ADR 0081 Decision 9's own
`[default]` tag — no `[binding]` clause of this policy or of ADR 0081 is changed by this entry. See
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s "`check:app-versions` flip-readiness" entry for the
same status, kept in sync with this one.

PR: (this PR). Closes #1592. Refs #1548. Does not close epic #1548 — Wave 2 may have further phases
beyond this one.

### 2026-09-05: `deploy-main.yml` auto-skips a build whose version tag is already published and content-unchanged (#1610, epic #1548 Wave 4 residue) — closes a second, distinct #1610 symptom alongside Decision 8's per-app resolution above

Decision record this implements: [ADR 0081](../architecture/adr/0081-per-app-container-semantic-versioning.md),
2026-09-05 Amendment (`[snapshot]` tier — Decision 7 itself is unmodified). Not rewritten in place,
same convention as every entry above.

`deploy-main.yml` rebuilds every app on every dispatch by default — its four `build_*` inputs are
manual, and this policy's own promotion runbook never set them. A retry after one app's Decision 7
refusal therefore re-rebuilt every app that already succeeded too, tripping the same guard for each
in turn. A new `resolve-build-plan` job now resolves, per app, whether a build is safely skippable
(tag already published under the current revision, or under a different revision with
content-identical tracked build inputs) — Decision 7's guard itself is untouched and still runs,
unconditionally, in every build that is actually attempted. Full mechanism and the fail-closed
reasoning: `scripts/resolve-build-skip-plan.js`'s own header comment; the amendment above for the
full argument. `.agents/skills/promoter/references/promotion-runbook.md`'s PROD dispatch section
now notes that neither canonical dispatch command needs any manual `build_*` unchecking as a result.

This is a `[snapshot]`-tier procedure change under ADR 0039 — no `[binding]`/`[default]` clause of
this policy or of ADR 0081 changes. **Not yet exercised against a real dispatch** — see the ADR
amendment and `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s Phase 295 entry for what is and isn't
verified.

PR: (this PR). Refs #1610 (not Closes — needs deployed verification). Refs #1548.

### 2026-09-06: Every production promotion carries a release-note record (#1278, ADR 0082)

Decision record this implements: [ADR 0082](../architecture/adr/0082-production-release-record-and-release-notes.md),
new in this PR. Not rewritten in place, same convention as every entry above. This entry states the
obligation per promotion leg; it does not restate ADR 0082's own reasoning — read that ADR for why,
this entry only for when/how within the flow this policy already governs.

**Pre-cut — the release note is authored in the bump PR, not a separate step.** The same
`chore(release): bump <apps> …` PR that ADR 0081 Decision 6's pre-cut floor step already requires
(or opens as a note-only PR if every app is already at or above floor — the note PR is not optional
even when no version bump is otherwise needed) now also adds/commits
`docs/releases/notes/<candidate_id>.md`, following `docs/releases/notes/TEMPLATE.md`'s shape.
`production_commit` is written as the literal sentinel `pending` at this point (ADR 0082 Decisions
4/8) — the real `main` merge-commit SHA does not exist yet — and stays `pending` through every
subsequent leg until the post-deploy finalization step below. This is the only workable seam for
authoring at all: a promotion branch (`to-staging/*`/`release/*`) carries no commits of its own, so
the note has to already be on `develop` at cut time to ride `develop → staging → main` with the code
it describes — the same constraint ADR 0081 Decision 6 already reasoned through for version bumps
themselves.

**`fix/staging/*` — each repair amends the candidate's existing note, in the repair PR itself.** A
repair branch does carry its own commit(s) (unlike a promotion branch), so it edits
`docs/releases/notes/<candidate_id>.md` directly: one new `## Included` item line for the repair and
an updated version-table row for whichever app(s) it touched — never a second release-note file for
the same `candidate_id`. `production_commit` stays `pending` through a repair; nothing about the
repair leg finalizes it.

**`release/* → main` — `check:release-notes` runs on this PR, advisory in its first landing (Phase
296, a separate PR from this one), blocking only in the later dedicated phase ADR 0082 Decision 8
names.** At this point the note's `production_commit` is still the literal `pending` sentinel — the
check's contract (ADR 0082 Decision 8) must accept that value or a real 40-hex SHA, never require
the latter here, since the real `main` SHA cannot exist until after this exact PR merges. This entry
records the obligation the check enforces; the script itself, its `package.json` wiring, and its
`promotion-quality-gate.yml` step are out of scope for this PR — see
`docs/features/IMPLEMENTATION_PHASE_LEDGER.md`'s Phase 296 entry once it lands, and ADR 0082's
Follow-up 3 for the exact contract to build against.

**After `deploy-main.yml` succeeds — the promoter finalizes `production_commit` to the real 40-hex
SHA, tags `release-<candidate_id>` on the deployed `main` commit, and publishes the GitHub Release
from the note file**, mirroring the #615 Android precedent: finalize the field on `develop` via its
own small PR, then `gh release create release-<candidate_id> --title … --notes-file
docs/releases/notes/<candidate_id>.md --target <main SHA>`. This runs after the promotion parity
gate (ADR 0081 Decision 8) confirms the deployed image traces back to the candidate — full command
sequence, including the runbook's own `grep` self-check before publish (no CI gate re-validates the
finalization yet, ADR 0082 Follow-up 3):
`.agents/skills/promoter/references/promotion-runbook.md`. Publishing the Release is a post-deploy
record of a deploy Pat already authorized, not a new deploy mutation — see
`.agents/skills/promoter/SKILL.md`'s checkpoint table for the explicit unattended classification.

**A `main` hotfix and a #1007 expedited promotion each get their own release-note record**, keyed by
their own `candidate_id`, per ADR 0082 Decision 6 — neither path is exempt from Decision 3's binding
obligation just because it skips the staging soak or the ordinary bump-PR seam. **The two paths are
not symmetric for enforcement purposes, stated here rather than left implicit:** the #1007 path cuts
`release/<candidate_id>-rN` — the identical branch pattern the default flow uses — so
`check:release-notes` already covers it once Phase 296 lands, no special-casing needed. A hotfix's
branch does not match that pattern (`fix/*`, per `implement`'s own naming convention), so its copy of
Decision 3's binding obligation is enforced procedurally today, via the release-note-authoring step
added to `.agents/skills/incident-responder/SKILL.md`'s hotfix procedure in this same PR — not by
any script. ADR 0082 Follow-up 3 tracks closing this mechanically.

This is a `[default]`-tier procedure amendment under ADR 0039, layered on top of ADR 0082's own
Decisions 1, 2, 4-8 (all `[default]`) — Decision 3 (`[binding]`: no production promotion reaches
`main` without a release-note record for its candidate) is the substantive obligation this entry
describes the mechanics of, not a change to its tier. No `[binding]` clause of this policy or of any
other ADR is changed by this entry.

PR: (this PR). Refs #1278, #1548. Does not close #1278 — Phase 296 (enforcement) is a separate PR.

### 2026-09-06: Mid-soak `develop` update — ship the frozen candidate, don't fold new work in (#1660)

Names, as its own decision, a case the 2026-09-04 "Frozen promotion-candidate repair loop" entry
above already implied but never stated directly: **new work lands on `develop` while a candidate is
already soaking in `staging`, still on its way to `main`.** Do you fold the new work into what's
about to ship, or not?

**Resolved: ship the current candidate as already qualified; the new `develop` work becomes the seed
of the next ordinary candidate.** Three options were weighed:

1. Hold the current candidate, merge the new `develop` work into it, requalify the combined set
   under a bumped version before shipping anything.
2. Keep the current candidate's version number, merge the new work in anyway, and call the result a
   "hotfix" to that same version.
3. Ship the current candidate to `main` as already qualified; treat the new `develop` work as the
   seed of the next ordinary candidate, cut whenever it's ready.

**Option 2 is rejected outright, not just discouraged.** It collides with two separate rules at
once: ADR 0081 Decision 7 (`[binding]`, tag immutability) forbids changing what a published version
tag's content is without a real version bump — there is no such thing as silently re-shipping the
same number with different contents. And it misuses the `fix/staging/<candidate_id>-rN` repair
mechanism, which exists specifically to fix a defect discovered *in* the candidate already soaking —
not to admit unrelated new feature work that happened to land on `develop` in the meantime. The word
"hotfix" doesn't change what the merge structurally is.

**Option 1 is mechanically valid but strictly worse than Option 3, not a cheaper path.** The frozen-
candidate rule already requires that merging anything new into an active candidate invalidates its
qualification — so Option 1 pays the exact same full re-soak cost Option 3 does, while additionally
throwing away a candidate that was otherwise ready to ship. There is no version of "fold it in to
save a promotion cycle" that is actually cheaper once the re-soak requirement is accounted for.

**Option 3 is simply the frozen-candidate rule working as designed, not a special case.** Cutting a
new candidate shortly after the previous one shipped is unremarkable — nothing in the per-candidate
floor-check (ADR 0081 Decision 6) or release-note obligation (ADR 0082 Decision 3) treats back-to-
back candidates as exceptional. If the new `develop` work is genuinely too urgent to wait for its own
ordinary `staging` soak, that is what the #1007 expedited `develop → main` override exists for
(phrase-gated, logged every invocation) — a deliberate, separate lever, not a reason to fold new
scope into an already-soaking candidate.

This is a `[default]`-tier clarification under ADR 0039 of the existing frozen-candidate principle —
no `[binding]` clause is changed, including ADR 0081 Decision 7 itself, which this entry only cites
as the reason Option 2 fails.

PR: (this PR). Closes #1660.

### 2026-09-06: Compliance preflight execute-and-resolve moves to the `develop → staging` leg, not
just verified before `main` (#1648)

Resolves the gap named in #1648, itself filed right after #1618 — the seventh occurrence of the
identical `compliance:preflight-handoff` ticket (#1387, #1419, #1430, #1505, #1544, #1574, #1618,
all closed by a human or credentialed AI session happening to notice the standing issue, not by any
step in this flow). The continuous sweep (`compliance-preflight-sweep.yml`) reconciles most
declarations within minutes of landing on `develop`, but its reconciliation PR can't auto-merge
(org-blocked `github-actions[bot]`, #1295/#1374) — and nothing checked for that stuck handoff until
`promoter`'s pre-`main` gate ran, which can be days or weeks after `to-staging/<candidate_id>`
already merged during a full staging soak. Deferring the check to right before `main` deferred the
fix for just as long.

**What changed.** `promoter` now runs the same check as before — full-scan for outstanding
`NOT-EXECUTED-*` declarations, plus a check for a stuck `compliance:preflight-handoff` issue — much
earlier, before `to-staging/<candidate_id>` is even cut, not only before `release/<label>` merges
into `main`. It also now **goes past verify into resolve** at that point: if either check turns up
something, `promoter` dispatches `compliance-preflight-sweep.yml` itself and then opens and merges
the resulting reconciliation PR itself (an ordinary `develop`-base PR, already unattended-mergeable
per `promoter`'s own merge table — no new merge authority granted by this entry), rather than
leaving that step for a human to notice a separate GitHub issue after the fact. Full procedure:
`.agents/skills/promoter/SKILL.md`'s "Frozen candidate and repair loop" section;
executable commands: `.agents/skills/promoter/references/promotion-runbook.md`'s
"Default: `develop` → `staging` → `main`" section. This changes ADR 0074 Decision 5's own anchor
(`[default]` tier) — amended in the same PR, see that ADR's 2026-09-06 #1648 amendment rather than
restated here.

**The compliance verification ladder table** (2026-08-22 amendment above, updated 2026-08-25,
2026-09-02) is **not rewritten in place**, same established convention as every amendment on this
table before it. Read it as follows going forward: its "`develop → staging`" row's "What runs" cell
now additionally includes the execute-and-resolve compliance-preflight step described above, run
before the branch is cut — this is new, not previously true of that row. Its "`develop → main`" row
still lists the compliance preflight check, but per the decision below that check is now largely
redundant there for the default flow, kept as an explicit defense-in-depth double-check rather than
the primary gate the ladder table's original wording implied.

**Decision on the existing pre-`main` check: kept, not removed — and why, explicitly, rather than
silently.** Deleting it outright would have been wrong, not just less thorough: the #1007-gated
expedited `develop → main` exception (this document's 2026-08-25/2026-09-02 amendments above) skips
the `develop → staging` leg entirely, so for that specific flow the pre-`main` check is not
redundant at all — it remains the **only** compliance-preflight gate that flow ever runs. For the
default three-stage flow, by contrast, it genuinely is defense-in-depth: the frozen-candidate rule
(no wholesale `develop` merge into an active candidate) and the mid-soak "ship, don't fold" rule
(this document's own 2026-09-06 #1660 entry above) together guarantee nothing new lands into a
candidate between the `to-staging/<candidate_id>` cut and the `release/<label>` cut, so the pre-`main`
check should always find the same clean state the staging-leg check already established. **Not a
symmetric substitution, though**: the default flow's pre-`main` check scans `origin/staging` (what
`release/<label>` is actually cut from there), and because the sweep's reconciliation PR is
hardcoded to `--base develop`, a finding against `origin/staging` cannot go through the same
dispatch-and-merge resolve path — it's a frozen-candidate anomaly instead, escalated and routed
through a `fix/staging/*` repair. The `#1007`-gated exception's and the staging-leg's own checks
(both against `origin/develop`) do share the identical execute-and-resolve behavior. Full split by
flow: `.agents/skills/promoter/SKILL.md`'s "Compliance preflight sweep" section under "Pre-`main`
gates".

**What's unchanged:** "No `NOT-EXECUTED-*` declaration may reach `main`" (this document's own
standing rule), the full-scan discovery method (#1374, not a `develop..main` diff), the supervised
handoff mechanics themselves (#1295/#1374 — `github-actions[bot]` still cannot open or approve PRs,
`promoter` doing so on its behalf is the same "ordinary `develop`-base PR, already
unattended-mergeable" authority it already had, not a new grant), and #1007's expedited override as
the one case a `NOT-EXECUTED-*` declaration may legitimately still reach `main`, logged and
authorized, not silent.

PR: (this PR). Closes #1648. Refs #1618.

### 2026-09-07: `repository-quality` split into 3 concern-based jobs (#1690)

`promotion-quality-gate.yml`'s `repository-quality` job bundled 13 steps across dependency audits,
compliance/env posture, CI-self-test contracts, and docs/release hygiene into a single job — every
other job in this workflow already follows a one-job-per-concern pattern
(`dgfy-api-quality`, the three `frontend-*-quality` jobs, `frontend-budgets-quality`), so a red
`repository-quality` check-run in a PR's Checks tab named only "1 of 13 steps failed," with no clue
which of 3 unrelated domains it was without opening the run and reading the step list.

**What changed.** `repository-quality` is replaced by 3 jobs, each keeping its steps' exact ids,
commands, and blocking/advisory status unchanged — only the job grouping changed:

- **`repository-dependency-quality`** — dependency/compliance/env posture: `run_dependency_audit_prod`
  (blocking), `run_dependency_audit_full` (advisory), `run_compliance_contracts` (blocking),
  `run_production_env_fixtures` (blocking), `run_compat_seams` (advisory).
- **`repository-ci-contracts-quality`** — CI/workflow self-validation (validates this repo's own CI
  configuration, not product code): `validate_pr_quality_workflow`, `validate_runner_routing`,
  `validate_workspace_hygiene`, `validate_compliance_sweep` — all blocking.
- **`repository-docs-quality`** — docs/release/repo hygiene: `run_docs_lint` (blocking),
  `run_release_notes` (advisory), `check_retired_path_resurrection` (advisory), `check_whitespace`
  (blocking, PR-context only).

Each new job duplicates the standard 5-step bootstrap (sparse-checkout clear/assert, checkout,
setup-node, `npm ci`) this workflow already repeats per job by established convention, not a new
pattern. `report-advisory-failures`'s `needs:` list and its `github-script` body are updated to read
3 separate `*_FAILURES` outputs (`REPOSITORY_DEPENDENCY_FAILURES`, `REPOSITORY_CI_CONTRACTS_FAILURES`,
`REPOSITORY_DOCS_FAILURES`) in place of the single `REPOSITORY_FAILURES`. Each new job's own
"Record real per-step outcomes" step now also writes its `STEP_OUTCOMES` table to
`$GITHUB_STEP_SUMMARY`, so a red job's own run summary shows the failing step immediately without
scrolling logs — new, cheap (reuses data already computed for the advisory-failure reporter), not
previously true of `repository-quality`.

`scripts/check-pr-quality-workflow.js`'s `QUALITY_JOB_NAMES` and `BLOCKING_STEP_IDS` are updated as
a data change, not a logic rewrite — the advisory-shape and reporter-shape validators
(`checkStepLevelAdvisory`, `checkAdvisoryFailureReportingShape`, `checkStagingLegSkipShape`) already
loop generically over `QUALITY_JOB_NAMES`. `scripts/gate-release-local.js`'s 6
`CI_ENFORCED_GATES` entries that named `job: 'repository-quality'`
(`dependencies.audit.prod`, `dependencies.audit.full`, `docs.lint`, `compliance.contracts`,
`production.env.fixtures`, `release.notes`) now name the correct one of the 3 new jobs.
`docs/ops/GATE_RELEASE_LOCAL_CI_MAPPING.md`'s row references are updated to match (documentation
accuracy only, not functional).

**Not changed by this entry:** no `[binding]` clause of ADR 0074/0081/0082 is touched, no promotion
leg's own gating changes (`repository-quality`'s three replacement jobs are skipped/advisory on
exactly the same legs the original job was), and no architecture boundary is crossed (no `apps/*`
runtime code touched). This is a `[default]`-tier clarification under ADR 0039, hence a dated
amendment here rather than a new or superseding ADR.

**Explicitly out of scope, left for a follow-up under epic #1124 (not decided or built here):**
moving any of these checks to run earlier (PR-open against `develop`, or a `promoter` pre-cut step
— #1690's own Q1), and true step-level incremental re-run (a `strategy: matrix` restructuring —
#1690's own Q3, rejected for this ticket since it would require rewriting
`check-pr-quality-workflow.js`'s `(job, step-id)` data model, not just its data). GitHub's native
"re-run failed jobs" already benefits proportionately from the 3-job split with zero extra
engineering, since it operates at job granularity. Fixing #1551 (`validate_compliance_sweep`'s own
failure, currently tracked separately) is not this entry's job either — if unresolved by the time
this split lands, `repository-ci-contracts-quality` starts out red for that already-tracked,
unrelated reason, not a regression this split introduced.

PR: (this PR). Closes #1690.

### 2026-09-07: Promotion-time divergence check before the `to-staging` cut (#1696)

Extends #1611's backport mechanism rather than replacing it. #1611 established a mandatory
`fix/staging/*` → `develop` backport, discovered live when a staging-only fix was never ported
back and `develop` kept shipping the bug it fixed. This entry closes the adjacent gap: even when
every staging-side change *is* eventually reconciled, nothing checked whether `develop` would
still merge cleanly into `staging` *before* the next `to-staging/<candidate_id>` cut — the
conflict surfaced only as `mergeable_state: dirty` on an already-opened PR (confirmed live,
candidate `2026-09-07-01`, PR #1688).

**What changed.** `promoter` now runs `scripts/check-promotion-divergence.js` (new) before
cutting `to-staging/<candidate_id>` — a `git merge-tree`-based, read-only mergeability check plus
a provenance audit of every staging-only commit against the four tracked branch patterns
(`to-staging/*`, `fix/staging/*`, `docs/release/*`, `compliance-sweep/*`). A real conflict is a
hard stop, resolved before the cut rather than discovered during it;
`scripts/check-merge-hygiene.js` (pre-existing, previously unwired — see
`docs/ops/MERGE_ADOPTION_GATE.md`) is now the documented post-resolution verification step,
replacing an ad hoc manual `git diff` check with a repeatable one.

**Explicitly rejected: a periodic/scheduled divergence scan.** `staging` only changes through
promoter-driven, PR-based branches (the four patterns above) — there is no organic between-
promotions drift the way `develop` accumulates feature work continuously. A nightly or
on-push scan would report clean on nearly every run and only ever surface something actionable
right when a promotion is about to happen anyway, which is exactly when the new pre-cut check
already runs — matching this document's own established preference for promotion-time gates
over standalone periodic ones (see the 2026-09-06 #1648 entry moving the compliance-preflight
check earlier in the flow for the identical reason).

**Explicitly rejected: a blanket reconciliation requirement for every staging-side change.**
Investigated live: every staging-only commit in this repo's actual history already traces to one
of the four tracked branch patterns above; nothing has ever landed on `staging` outside a named,
reviewable PR. The gap was in this document's own wording (naming only `fix/staging/*`), not in
the underlying mechanism — fixed by generalizing the stated scope
(`.agents/skills/promoter/SKILL.md`'s backport paragraph), not by adding a new mandatory step for
content that already reconciles correctly today.

**Q3, resolved (not just believed).** `git diff origin/develop origin/staging --
.agents/skills/promoter/SKILL.md` is empty as of this entry — `develop`'s content (which won PR
#1688's manual resolution) is exactly what's live on `staging` too. No further backport needed for
that specific resolution.

This is a `[default]`-tier procedure amendment under ADR 0039 — no `[binding]` clause of any ADR
is changed by this entry.

PR: (this PR). Closes #1696. Refs #1611.

### 2026-09-07: Pre-cut floor step scoped to changed apps -- it was force-bumping every app regardless (#1740)

Found investigating PR #1738 (candidate `2026-09-08-01`): the pre-cut floor step (2026-09-04 entry
above, `node scripts/check-app-version-bump.js --floor --base origin/staging --head origin/develop`)
force-bumped all five apps' versions even though the candidate's only real code change was two files
in `apps/dgfy-storefront/src/`. Same pattern on candidates `2026-09-07-03` and `2026-09-07-04`.

**Root cause.** `runFloor()` (the `--floor` mode this step invokes) had no change detection at all --
it iterated the full, hardcoded five-app list unconditionally, unlike `check:app-versions`'s own
PR-time check (`runCheck()`), which correctly scopes to apps with a direct `apps/<app>/` change or a
changed `file:`-dependency package. This directly contradicted this document's own 2026-09-04 entry
and ADR 0081 Decision 6's text ("Apps with no changes keep their version untouched") -- the spec was
right, the code simply didn't implement it for this entry point.

**Consequence beyond noise.** The 2026-09-05 build-skip entry above (`resolve-build-skip-plan.js`)
already skips rebuilding an app whose version tag is published and content-unchanged -- a spurious
bump defeats that outright, since a newly bumped tag is by definition not yet published. Every
force-bumped-but-unchanged app was rebuilt and republished to GHCR on every promotion for no content
reason, burning CI minutes and registry storage.

**Resolution.** `runFloor()` now reuses `detectChangedApps()` -- the same function `runCheck()`
already uses -- and evaluates the floor only for apps that actually changed between the two refs.
`file:` fan-out (a `packages/web-core` change still bumping every dependent frontend) is unaffected.
An unchanged app is now reported informationally as skipped, never as below floor. **No change to
the obligation itself** -- an app that did change still needs the same minor-floor bump it always
did; only the scoping was wrong.

`[snapshot]`-equivalent procedure fix, no policy text above changed in substance (this document
already described the scoped behavior correctly; only the script's implementation was fixed to
match). Full detail: ADR 0081's matching 2026-09-07 Amendment,
`.agents/skills/promoter/references/promotion-runbook.md`'s floor-step section,
`scripts/check-app-version-bump.js`'s `runFloor()`, issue #1740.

PR: (this PR). Refs #1740.
