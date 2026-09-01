---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-08-31
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

**Default, since #980/ADR 0074 (2026-08-25):**

```text
feature branch -> develop -> release/<label> -> main
```

1. Feature branches PR into `develop`. Ordinary PR checks apply
   (`pr-checks.yml`).
2. A **release candidate** branch — `release/<label>`, e.g. `release/2026-08-25` — is cut fresh from
   `origin/develop` at the exact commit being promoted, whenever a batch of work is ready to ship.
   It carries no new commits of its own; it exists only to be a PR head. Cut it fresh each time,
   never reused.
3. `release/<label>` PRs into `main`. Once its checks pass and it is merged, production is live at
   that commit (once someone dispatches `deploy-main.yml` — see "The one fact that matters" above).

**Optional, non-default: a `staging` soak first.** The three-stage flow this document described
before 2026-08-25 still works and is not deleted — a promoter may still choose to cut
`to-staging/<label>` fresh from `origin/develop`, PR it into `staging`, and only then cut
`release/<label>` from `origin/staging` instead of `origin/develop`, before merging into `main`.
Nothing requires this; it exists for a promoter who judges a specific batch risky enough to want a
`staging` soak before it ships. See ADR 0074 for why this wasn't removed outright, and its Decision
4 for the explicit statement that `staging` is refreshed on demand only — it is not kept
automatically current, so treat it as possibly stale before relying on it for anything.

```text
feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main   (optional)
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
| `develop → main` promotion | merge gate for the promotion PR, plus a **preflight sweep** and the **production tenant-schema report** | `npm run gate:release:local` (`run_mode: "full"`, per `docs/testing/release-go-no-go-checklist.md`) against the exact target SHA; the CI-side `promotion-quality-gate.yml` run triggered automatically by the `release/*` PR itself (#1018) — **temporarily `continue-on-error` as of 2026-08-26, see the amendment below (#1063): it runs and records real failures as a comment on #1063, but does not block, and (since the #1066 correction below) does not show red in the Checks tab either**; a real `POST /api/v1/compliance/preflight` run against a deployed non-production host (DEV suffices) for every `NOT-EXECUTED-*` declaration in the batch, reconciled via a small cut branch and PR into `develop` — same pattern as the hotfix back-port below, never a direct commit — merged before `release/<label>` is cut (a **supervised handoff, not an auto-merge**, #1295/#1374, 2026-09-02: the workflow pushes and attempts the PR, but `github-actions[bot]` is org-blocked from creating/approving it, so a human or credentialed AI session opens/merges it in the ordinary case — `.agents/skills/promoter/SKILL.md`'s "Compliance preflight sweep" section owns the fast-signal check for a stuck handoff); **and** `sync-tenant-schemas.js --mode report` (`tenant-schema-report.yml`, #1017) checked against **production** tenant databases. **No `NOT-EXECUTED-*` declaration may reach this leg.** All four run once per promotion batch, before `release/<label>` merges. `.agents/skills/promoter/SKILL.md` owns the executable form. See the 2026-08-25 amendment below for which of these may be skipped under #1007's expedited override (never the tenant-schema report) | DEV (or STAGING) for the preflight sweep — production for the tenant-schema report |
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
