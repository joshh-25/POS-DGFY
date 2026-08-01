# Archived workflows

Archived 2026-07-30: all seven of these were confirmed dead before the move,
not deprecated speculatively. `staging-qualification.yml` and
`cleanup-merged-branches.yml` were failing on every recent run;
`promote-staging-to-master.yml` was permanently skipped as a result;
`exact-master-sha-qualification.yml` and the `workflow_run` trigger it fed on
`deploy-production.yml` targeted a `master` branch that does not exist in
this repository. GitHub only executes YAML directly under
`.github/workflows/`, so moving a file here stops it from running while
keeping it reviewable and trivially restorable (`git mv` back into
`.github/workflows/`).

These are not being maintained going forward. The actively maintained set is
`build-*.yml`, `deploy-*.yml`, `deployment-orchestrator.yml`, `pr-*.yml`,
`publish-platform.yml`, and `publish-pos-receipt.yml`, all still in
`.github/workflows/`.

| File | Was triggered by | What it did |
|---|---|---|
| `playwright-qa.yml` | push to every branch except `master` | Playwright E2E + performance + security suite |
| `ci.yml` | push/PR to `master` | lint-docs, release-verdict-contract, merge-adoption, batch-inventory, dependency-audit, backend/frontend tests, journey E2E gate |
| `nightly-ims-pos-sales-e2e.yml` | weekly cron (Sun 01:00 UTC) | IMS -> POS -> Sales browser journey matrix |
| `cleanup-merged-branches.yml` | PR closed into `staging`/`master` | deletes merged source branches per `.github/branch-cleanup-policy.json` |
| `staging-qualification.yml` | push to `staging` | ADR-0030 staging promotion qualification gate |
| `promote-staging-to-master.yml` | `workflow_run` <- Staging Qualification | opened/updated the staging->master promotion PR |
| `exact-master-sha-qualification.yml` | push to `master` | ADR-0030 production release qualification gate; fired `deploy-production.yml` via `workflow_run` |

## Known consequences

- PRs targeting `main`/`master` no longer get any automated CI (`pr-checks.yml`
  only covers `develop`/`staging`/`main` pull requests, and `ci.yml` above was
  the only workflow covering pushes/PRs to `master`).
- Retiring `staging-qualification.yml` and `exact-master-sha-qualification.yml`
  removes the check runs that `release-controller/config/controller.example.json`
  lists as required (`staging-qualification`, `exact-master-sha-qualification`).
  That config still references them; reconciling the release-controller config
  itself is a separate decision, not folded into this change.
  `docs/architecture/adr/0030-free-tier-signed-release-authorization.md` and
  `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md` are marked superseded in
  this same change (see `docs/ops/RELEASE_CANDIDATE_POLICY.md`) precisely
  because they described this now-archived flow as still enforced.
- `deploy-production.yml` is kept (still in `.github/workflows/`), but its
  `workflow_run` trigger keyed on "Exact Master SHA Qualification" is now
  unreachable and was removed in the same change that created this archive --
  it runs via `workflow_dispatch` only going forward.
- `scripts/promote-staging-to-master.js` and the
  `npm run promote:staging-to-master` script still work; they just no longer
  run automatically after a staging qualification success.
