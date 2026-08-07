---
status: authoritative
authority_level: authoritative
owner: release
last_reviewed: 2026-07-30
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
- `changes` also runs the **compliance impact guardrail**
  (`npm run check:compliance`), and that step **does block**. It is the one
  non-advisory folded-in step.
- `backend-build-check` / `frontend-build-check` — the actual Docker images
  build cleanly, gated by `shared-changed-paths.yml` so an unrelated change
  doesn't force both.

There is **no** `code-quality` job and no `conventional-commits` job. Both were
removed; earlier revisions of this document listed them, which is how PRs #284
and #288 came to state in good faith that "CI's compliance gate will still
block merge" while nothing was in fact running. Architecture guardrails,
controller boundaries, tenant schema coverage and lint now run only in
`.husky/pre-commit`, which `git commit --no-verify` skips — treat them as
developer conveniences, not gates. The compliance guardrail was restored to CI
on 2026-08-07 precisely because a bypassable local hook was the only thing
standing behind a mandatory declaration.

There is no inventory/regression-risk/QA-evidence gate on `main` today. The
scripts for one exist (`check:batch-inventory`, `check:regression-risk`,
`check:documentation-closure`, `build:release-candidate-evidence`,
`npm run promote:staging-to-master`) and their tests still pass, but nothing
in `.github/workflows/` invokes them anymore — wiring them into a live gate
on `release/* -> main` is a real process decision (what evidence is
mandatory, who reviews it, whether it blocks merge) and is deliberately left
as a follow-up, not assumed here.

## Known gaps (tracked, not solved by this document)

- `release-controller/config/controller.example.json` still lists
  `staging-qualification` / `exact-master-sha-qualification` as required
  checks for a controller that was never installed. Reconciling or removing
  it is a separate decision.
- No live RC gate beyond the PR checks above (see previous section).
- `develop` and `staging` have drifted before without a backport in the
  other direction — the compliance bypass this document depends on
  (`scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_BY_BASE`) existed
  on `staging` for several days before it was ported back to `develop` as
  part of this same change. Worth an audit of what else has diverged.
