# Handoff: CI runner migration (PR #118)

Context for whoever (human or AI) picks this branch back up. Delete this file
when PR #118 finally merges — it exists only to survive context loss across
sessions while the PR sits open.

## Status as of 2026-07-28

**Blocked on GitHub Actions billing, not on the code.** The branch
`ci/optimize-pr-and-build-workflows` (PR #118, base `develop`) is complete and
verified statically, but is being kept open/unmerged intentionally until the
team's GHA billing issue is resolved. Until then, self-hosted runners remain
in use for real work on `develop`/`staging`/`main` (those workflows are
untouched outside this branch). Do not merge this PR just because it looks
finished — confirm with the user first that GHA billing has actually been
resolved.

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
- Adds a `cancelled`-result check to `pr-checks-summary.yml`'s gate (it
  previously only checked for `failure`).
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
