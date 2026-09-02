---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-09-03
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
| `develop → staging` (optional, non-default soak) | merge gate for the `to-staging/<label>` PR, if a promoter chooses to route through it | Same `pr-checks.yml`/`promotion-quality-gate.yml` checks any promotion PR gets (the CI gate triggers on this shape too) — **skipped entirely as of 2026-08-26, see the amendment below (#1063)**. **`npm run gate:release:local` does NOT run on this leg** — stated explicitly here (#1097) rather than left implicit by its absence from this row, after a live promotion attempt ran it here anyway and stopped a `develop → staging` promotion on findings that were never this leg's gate to fail on. Does **not** substitute for anything in the row above — the preflight sweep and tenant-schema report still run at the `develop → main` leg regardless of whether this optional soak happened | DEV (or STAGING) |
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

PR: (this PR, `ci/1431-phase-cde-zero-local-gates`). Refs #1431, #1147, #1469, #1015, #925.
