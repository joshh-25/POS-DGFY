---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-08-12
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

**A push to `main` deploys production.** `build-main.yml` fires on `push:
[main]` and immediately builds and dual-deploys both `beta.dgfy.ph` and
`dgfy.ph` (shared backend, two frontend builds from two GitHub Environments'
`VITE_*` vars). There is no separate production-deploy approval step, no
external signed authorization, and no environment reviewer gate — GitHub Free
does not support any of those. Merging a PR into `main` **is** the deploy.
Treat every PR into `main` accordingly.

## Flow

```text
feature branch -> develop -> staging -> release/<label> -> main
```

1. Feature branches PR into `develop`. Ordinary PR checks apply
   (`pr-checks.yml`).
2. `develop` PRs into `staging` when a batch of work is ready to qualify
   together.
3. A **release candidate** branch — `release/<label>`, e.g.
   `release/2026-07-30` — is cut from `staging` at the exact commit being
   promoted. It carries no new commits of its own; it exists only to be a PR
   head. Cut it fresh each time from `origin/staging`, never reused.
4. `release/<label>` PRs into `main`. Once its checks pass and it is merged,
   production is live at that commit.

`release/*` is already in `.github/branch-cleanup-policy.json`'s
`protectedHeadPrefixes`, so a release branch is never eligible for automatic
deletion even if the (currently archived) cleanup workflow is restored.

## Why a release branch instead of `staging` directly

`scripts/check-compliance-impact.js` recognizes both shapes as an aggregate
promotion (`PROMOTION_HEAD_BY_BASE` for an exact `staging` head,
`PROMOTION_HEAD_PREFIX_BY_BASE` for a `release/` head into `main`) and skips
re-validating every bundled compliance declaration against the combined diff
— each one already passed this same check on its own PR into `develop`.
Re-validating the bundle produces false positives; see the failure this
caused on the first attempt at this promotion (PR #143), fixed alongside this
document.

A named release branch exists mainly for a clean, reviewable PR title/diff
and a stable reference if the promotion needs to be reopened; functionally it
is the same qualified snapshot as `staging`.

## What actually gates a release into `main` today

Everything in `pr-checks.yml`, same as any other PR:

- `changes` — resolves which image builds the diff needs, and folds in three
  advisory checks (`continue-on-error: true`, visible but never blocking): PR
  title format, PR body sections, and the POS receipt version bump.
- `quality-checks` — blocking API matrix/open-handle diagnostics, migration
  smoke, required-index audit, frontend lint/F&B contract tests/builds, the
  deterministic Storefront F&B Playwright contract, architecture guardrails,
  governed-doc lint, compatibility seams, and diff hygiene.
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

`quality-checks` (described above as blocking) is currently disabled in
`pr-checks.yml` (`if: false`, paused since 2026-08-11 over #345's ~14min
unfiltered run) — see "Known gaps" below. Until that's resolved, the human
supplement is `npm run gate:release:local`, run by hand before a
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
- `quality-checks` is currently short-circuited with `if: false` in
  `pr-checks.yml` (see #345), so the "blocking" description above is
  aspirational until that's re-enabled. `npm run gate:release:local` (see
  above) is the only place the full test matrix runs meanwhile.
- `develop` and `staging` have drifted before without a backport in the
  other direction — the compliance bypass this document depends on
  (`scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_BY_BASE`) existed
  on `staging` for several days before it was ported back to `develop` as
  part of this same change. Worth an audit of what else has diverged.
