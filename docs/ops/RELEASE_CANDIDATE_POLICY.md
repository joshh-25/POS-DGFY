---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-08-22
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

```text
feature branch -> develop -> to-staging/<label> -> staging -> release/<label> -> main
```

1. Feature branches PR into `develop`. Ordinary PR checks apply
   (`pr-checks.yml`).
2. A **staging-candidate** branch — `to-staging/<label>`, e.g. `to-staging/2026-08-16` — is cut
   fresh from `origin/develop` at the exact commit being promoted, whenever a batch of work is
   ready to qualify together. It carries no new commits of its own; it exists only to be a PR
   head. Cut it fresh each time, never reused — the same pattern as `release/<label>` below, not
   a separate one.
3. `to-staging/<label>` PRs into `staging`. Once its checks pass and it is merged, `staging`
   reflects that commit.
4. A **release candidate** branch — `release/<label>`, e.g.
   `release/2026-07-30` — is cut from `staging` at the exact commit being
   promoted. It carries no new commits of its own; it exists only to be a PR
   head. Cut it fresh each time from `origin/staging`, never reused.
5. `release/<label>` PRs into `main`. Once its checks pass and it is merged,
   production is live at that commit.

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

Everything in `pr-checks.yml`, same as any other PR:

- `changes` — resolves which image builds the diff needs, and folds in three
  advisory checks (`continue-on-error: true`, visible but never blocking): PR
  title format, PR body sections, and the POS receipt version bump.
- `quality-checks` — blocking API matrix/open-handle diagnostics, migration
  smoke, required-index audit, frontend lint/F&B contract tests/builds, the
  deterministic Storefront F&B Playwright contract, architecture guardrails,
  governed-doc lint, compatibility seams, and diff hygiene. **Removed from
  `pr-checks.yml` 2026-08-14 (#416)** — it had been permanently `if: false`
  there since 2026-08-11 (#345), so this was dead wiring, not a live check.
  The workflow itself (`pr-quality-checks.yml`) is untouched and still
  `workflow_dispatch`-runnable by hand from the Actions tab.
- `backend-build-check` / `frontend-build-check` — the actual Docker images
  build cleanly, gated by `shared-changed-paths.yml` so an unrelated change
  doesn't force both.

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

`quality-checks` (described above as blocking) is not wired into
`pr-checks.yml` at all — removed 2026-08-14 (#416) after sitting disabled
(`if: false`, since 2026-08-11 over #345's ~14min unfiltered run) with no
path back in decided yet — see "Known gaps" below. Until that's resolved,
the human supplement is `npm run gate:release:local`, run by hand before a
`staging`/`main` promotion. It is documented in
`docs/testing/release-go-no-go-checklist.md`, which is the authoritative
runbook for that gate — see #375. Do not propose rebuilding it (#345, #330);
invoke it.

## Known gaps (tracked, not solved by this document)

- `release-controller/config/controller.example.json` still lists
  `staging-qualification` / `exact-master-sha-qualification` as required
  checks for a controller that was never installed. Reconciling or removing
  it is a separate decision.
- No live RC gate beyond the PR checks above (see previous section).
- `quality-checks` is not wired into `pr-checks.yml` at all (removed
  2026-08-14, #416; was short-circuited with `if: false` since #345 before
  that), so the "blocking" description above is aspirational until a path
  back in is decided. `npm run gate:release:local` (see
  above) is the only place the full test matrix runs meanwhile.
- `develop` and `staging` have drifted before without a backport in the
  other direction — the compliance bypass this document depends on
  (`scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_BY_BASE`) existed
  on `staging` for several days before it was ported back to `develop` as
  part of this same change. Worth an audit of what else has diverged.

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

Applying that split to what this repo actually has:

| Stage | Gate type | What runs | Environment needed |
|---|---|---|---|
| `feature → develop` | merge gate | `pr-checks.yml` (build checks) + pre-commit statics, including `npm run check:compliance` (a static, sub-second document-shape check — see `docs/compliance/request-time-preflight-protocol.md`). A `major`/`regulatory` declaration may carry a disclosed `NOT-EXECUTED-*` preflight placeholder at this stage — that is the accepted norm, not a defect | none |
| `develop → staging` promotion | merge gate for the promotion PR, plus a **preflight sweep** | `npm run gate:release:local` (the 25-min test-matrix gate, per `docs/testing/release-go-no-go-checklist.md`) **and** a real `POST /api/v1/compliance/preflight` run against a deployed non-production host (DEV suffices — see the protocol doc) for every `NOT-EXECUTED-*` declaration in the batch, reconciling each declaration's front matter before the sweep's fix-up commits land on `develop` and the promotion branch is cut. `.agents/skills/promoter/SKILL.md` owns the executable form of this step | DEV (or STAGING) — not production |
| `staging → main` | merge gate | `gate:release:local` on the release SHA, tenant-schema sync checked against **production** tenant databases, the go/no-go checklist's remaining non-technical blockers. **No `NOT-EXECUTED-*` declaration may reach this leg** — the promotion-time sweep above must already have cleared it | none beyond what's already required |
| post-`deploy-main.yml` | release verification, never a merge gate | `verify-deployment.yml` (BETA+PROD infra health), the credential-free PayMongo webhook probe (`verify:paymongo:webhook`, asserts `401` on an unsigned payload), a BETA frontend canary, and — only once PayMongo's Linked Accounts blocker clears — a live low-value payment canary per `docs/ops/PAYMONGO_PRODUCTION_ACTIVATION.md` | production |

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
