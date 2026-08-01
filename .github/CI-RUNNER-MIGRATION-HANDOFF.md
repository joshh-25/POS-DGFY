# Handoff: CI runner migration (PR #118)

Context for whoever (human or AI) picks this branch back up. Delete this file
when PR #118 finally merges — it exists only to survive context loss across
sessions while the PR sits open.

## Status as of 2026-08-01

**No longer blocked on billing — the user decided to fully retire
self-hosted and accept the GitHub-hosted minute cost.** A measured cost
analysis (see the PR description / conversation this session) found the
original assumption backwards: the *push/deploy* builds run on self-hosted
today at $0, and moving them to `ubuntu-latest` alone would add ~1,450
billed min/month against the org's 2,000-minute free allowance. The
resolution: retire self-hosted everywhere (this PR's original scope), but
every `runner_labels_json` site now carries a **commented self-hosted
fallback** right above the active hosted-runner line, e.g.:

```yaml
      # Switch back to the free self-hosted runners if Actions minutes run
      # out. Pin the label so jobs avoid vm-sieitzstaging (AVX-less CPU ->
      # exit 132 on native addons like @napi-rs/canvas).
      # runner_labels_json: '["self-hosted","sieitz-ubuntu-runner"]'
      runner_labels_json: '["ubuntu-latest"]'
```

Uncommenting that line (and commenting the active one) is the whole
switch-back — no other changes needed. `sieitz-ubuntu-runner` is a label
unique to `vm-openproject`, routing switch-back builds off the AVX-less
`vm-sieitzstaging` box.

On top of the original runner migration, this session also collapsed the PR
Checks fan-out from 6 billable jobs to 3 (see "What this branch does,
continued" below) — measured billing is per-job, rounded up to the nearest
minute, so trivial sub-60s jobs (conventional-commits, summary) were pure
rounding waste, and `code-quality` (`continue-on-error: true`, so it could
never block a merge) was 22% of the entire PR Checks bill for zero
enforcement. Do not merge this PR just because it looks finished — confirm
with the user first.

This branch will keep getting `origin/develop` merged into it (merge, not
rebase) as part of the ongoing process while it sits open. Resolve conflicts
in favor of keeping this branch's runner/gating changes; re-verify per the
checklist below after each merge, and expect a steady trickle of merge commits
from `develop` in the history rather than a rebased/linear log.

## What this branch does

- Moves every PR check and image build off the two self-hosted runners onto
  GitHub-hosted `ubuntu-slim` (git/bash-only jobs) or `ubuntu-latest` (Docker
  builds, code-quality, the OpenVPN->SSH publish step).
- Generalizes `pr-changed-paths.yml` into reusable `changed-paths.yml`
  (adds a `base_sha` input for push-mode diffing, with a build-both fallback
  for new branches / force-pushes) and wires it into `build-develop.yml` so
  pushes to `develop` only rebuild the image domain that actually changed,
  instead of always rebuilding both. `deployment-orchestrator.yml` gained
  `build_backend`/`build_frontend` inputs (default `true`) so staging/main/
  manual/beta callers are unaffected and still always build both, per the
  user's explicit instruction.
- Narrows the `.github/workflows/` clause in the changed-paths filters so only
  build-relevant workflow edits force an image rebuild (previously *any*
  workflow edit rebuilt both).
- Replaces the self-hosted-only retained `dgfy-builder` buildx setup with
  ephemeral builders + `type=gha` cache (canonical scope in `deploy-*`,
  PR-scoped write-only cache in `pr-*-build-checks`).
- Added a `cancelled`-result check to `pr-checks-summary.yml`'s gate (it
  previously only checked for `failure`). **Superseded 2026-08-01** —
  `pr-checks-summary.yml` was deleted in this session's fan-out collapse
  (see below); that gate no longer exists.
- Archives 7 workflows outside the user's stated maintained set
  (`build-*`/`deploy-*`/`deployment-orchestrator`/`pr-*`/`publish-platform`/
  `publish-pos-receipt`) into `.github/workflows-archive/`, with its own
  README explaining what/why. `deploy-production.yml` is kept but trimmed to
  `workflow_dispatch`-only since its trigger workflow was archived.

Full rationale and the original design tradeoffs are in the PR #118
description; the plan this was built from also covered rejected alternatives
(e.g. keeping the retained buildx builder, leaving `.github/workflows/` broad
in the path filter) if you need to understand *why* something is shaped the
way it is rather than just *what* it does.

## What this session added (2026-08-01) — measured cost pass

Merged `origin/develop` in (resolving conflicts from develop's own
`shared-changed-paths.yml` rename), then applied a plan built from *measured*
billing data (`gh api .../actions/runs/<id>/jobs`, `gh api
/orgs/Sieitzz/settings/billing/actions`), not estimates:

- **Self-hosted switch-back comments** on every `runner_labels_json` site in
  `build-develop.yml`, `build-staging.yml`, `build-main.yml`,
  `build-manual.yml` (see "Status" above).
- **Fixed the stale changed-paths regex**: `shared-changed-paths.yml`'s two
  filters still matched `\.github/workflows/(changed-paths|...)`, a filename
  that no longer exists post-rename — self-edits to the filter workflow
  triggered neither image build. Also added `\.dockerignore` to both filters
  (it directly determines Docker build context content, `context: .`).
- **Fixed `build-main.yml`'s `publish` job condition** — it required all
  three image builds `== 'success'`; a `skipped` build (e.g. once a
  changed-paths gate is added there, still TODO) would have silently blocked
  publish forever. Now mirrors `deployment-orchestrator.yml`'s existing gate
  shape (`!cancelled() && != 'failure' && (...any succeeded...)`).
- **Collapsed the PR Checks fan-out from 6 billable jobs to 3.** Deleted
  `pr-code-checks.yml` (`code-quality` job) outright — it was
  `continue-on-error: true`, so with no branch protection available on this
  repo's free org plan (confirmed via `gh api .../branches/develop/protection`
  → 403 "Upgrade to GitHub Pro"), it could never have blocked a merge, yet
  cost ~22% of the entire PR Checks bill. Folded `pr-conventional-commits.yml`
  (PR title/body format) and the `check:pos-receipt-version` step formerly in
  `pr-code-checks.yml` into `shared-changed-paths.yml`'s `changes` job behind
  a new `validate_pr_metadata` input (PR-mode only; each new step keeps
  `continue-on-error: true` at the step level, same advisory behavior as
  before). Deleted `pr-checks-summary.yml` — with no branch protection to
  feed, it just aggregated already-advisory checks into another advisory
  check.
- **Coverage gap opened by deleting `code-quality`**: `npm --prefix backend
  run lint` / `npm --prefix frontend run lint` (eslint) are no longer run in
  CI at all. The pre-commit hook (`.husky/pre-commit`) already covers
  architecture guardrails, tenant-schema coverage, compat-seams, compliance,
  and doc lint, but not eslint. The plan calls for adding `lint-staged` to
  the pre-commit hook to close this — **deliberately not done in this
  session** (a new devDependency + lockfile change felt like it needed its
  own confirmation rather than riding along). Flagged for the user as a
  fast-follow.
- Not yet done from the full plan (deferred, see the plan file
  `are-we-using-ubuntu-slim-vectorized-mountain.md` if still on disk, or the
  conversation this session): dropping the `edited` PR trigger, skipping
  draft PRs, gating `build-staging.yml`/`build-main.yml` on changed paths,
  and untracking the ~528 MB of committed `Standalone POS/app/build` +
  `backups/` (incl. a committed `.sql` dump — separate security finding).

## What's verified vs. not

**Verified (static, safe to trust):**
- `actionlint` clean across all 19 active workflow files.
- No functional `self-hosted` runner-label references remain in
  `.github/workflows/` (only two explanatory comments).
- Every internal `uses: ./.github/workflows/...` reference resolves to a file
  that still exists after the archive move.
- `scripts/collect-github-actions-unavailability.test.js`,
  `scripts/build-release-candidate-evidence.test.js`,
  `scripts/deploy-master-ci.test.js` (11/11) still pass — these reference
  `"staging-qualification"` as a string fixture and one reads
  `deploy-production.yml` directly.
- Pre-commit `check:compliance`/`check:compliance:api-contracts` passed.

**Not yet verified (needs a real GitHub Actions run — do this before merging):**
- This PR itself should trigger both `frontend-build-check` and
  `backend-build-check` under the new filter (it touches `.github/workflows/`
  broadly) — confirm that actually happens and both builds go green on hosted
  runners.
- A follow-up PR touching only one domain (e.g. `backend/src/**`) should show
  the other build check as *skipped*, with the summary gate still green.
- A `develop` push after merge should exercise the new `changes` job in
  `build-develop.yml` and correctly skip the untouched image; then confirm the
  `publish` job still runs and the server ends up healthy.
- The OpenVPN->SSH deploy path (`publish-platform.yml`, used by
  `build-develop.yml`/`build-staging.yml` with `vpn_required: true`) has not
  been run from a GitHub-hosted runner in this repo's actual history despite
  being designed for it — the user confirmed it *should* work, but watch the
  first real hosted DEV/STAGING deploy closely. Rollback if it fails: revert
  `runner_labels_json` in `build-develop.yml`/`build-staging.yml` back to
  `'["self-hosted"]'`, independent of every other change here.

## Known stale references (out of scope for this PR)

Retiring the 7 archived workflows leaves some docs/config pointing at paths
that no longer exist under `.github/workflows/`:
`release-controller/config/controller.example.json` (required-check names),
`docs/ops/WORKSPACE_CLEANUP_AND_BRANCH_POLICY.md`,
`docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`,
`docs/architecture/adr/0030-free-tier-signed-release-authorization.md`. See
`.github/workflows-archive/README.md` for the full list. Updating the
release-governance docs is a separate decision the user hasn't made yet —
don't fold it into this PR without asking.
