# No-Staging Release Standard

## Purpose
Enforce production safety when no staging environment exists by requiring QA evidence before every production deploy.

## Hard Gate Policy
Production release is blocked unless all of the following are true for the exact target SHA:
1. QA deploy evidence proves commit-pinned deployment success.
2. QA multi-location smoke/contract checks pass.
3. QA rollback drill result is passing.
4. QA restore drill result is passing.
5. Local governance gates pass (`lint:docs`, `check:architecture`).
6. Deploy source contract passes: the deploy target is a clean, committed SHA and local-only files are not silently excluded.
7. Merge adoption proof passes when high-risk Storefront, checkout, DGFY auth, tracking, customer dashboard, or customer-order paths changed.
8. Production deploy completion proves remote Git HEAD, `.deploy-state/last_deployed_commit`, deployment summary, and runtime health SHA all match the target SHA.

The enforced command is:
```bash
RELEASE_TARGET_SHA=<target_sha> npm run gate:release:no-staging
```

Recommended local wrapper:
```powershell
powershell -ExecutionPolicy Bypass -Command ". .\scripts\load-qa-env.ps1 -EnvFile .env.qa.local -SecretsFile .env.qa.secrets.local; npm run gate:release:no-staging"
```

`scripts/deploy-remote.sh` runs this gate automatically after push and before production SSH deploy when:
```bash
DEPLOY_ENFORCE_NO_STAGING_GATE=1
```

Before push, `scripts/deploy-remote.sh` now runs a prerequisite preflight:
```bash
npm run gate:release:no-staging:preflight
```
The preflight fails early if required QA environment inputs are missing.

For multi-branch or PR-adoption releases, provide a manifest so the hard gate proves the intended changes survived the final tree:
```bash
MERGE_ADOPTION_MANIFEST=path/to/merge-adoption.json RELEASE_TARGET_SHA=<target_sha> npm run gate:release:no-staging
```

Use `docs/templates/MERGE_ADOPTION_MANIFEST_TEMPLATE.json` and `docs/ops/MERGE_ADOPTION_GATE.md`.

The hard gate now runs `check:merge-adoption-required` for every release. `merge.adoption.not_required` is valid only when that checker proves no high-risk customer-flow paths changed between the configured merge-adoption base and the target SHA. Missing adoption proof for high-risk changes is non-bypassable.

The one-command remote deploy wrapper now refuses dirty local worktrees, including untracked files. Commit or stash local changes before deployment; `--yes` does not mean "deploy only committed HEAD while ignoring local files."

## Evidence Contracts
Default evidence root:
```text
.tmp/release-gates/<target_sha>/
```

Required files:
1. `qa_deploy_summary.txt`
2. `smoke_result.json`
3. `rollback_drill_result.json`
4. `restore_drill_result.json`
5. `release_verdict.json` (final aggregated verdict)
6. `observability_evidence.json` (report-mode until one production release proves the workflow)
7. `merge_adoption_report.json` (required when `MERGE_ADOPTION_MANIFEST` is set)
8. `deploy_source_contract.json`
9. `frontend_build_manifest.json` from production deploy logs
10. `production_contract.json` from production deploy logs

Current behavior note:
1. `qa_deploy_summary.txt` must prove that QA deployed the exact `RELEASE_TARGET_SHA`.
2. A missing or mismatched `deployed_head` is a hard gate failure.
3. Emergency override remains available only through the explicit bypass metadata contract below.
4. `npm run gate:release:observability` records traceability evidence and stale-QA review context. It starts in report mode and should be switched to enforce mode after one successful production release includes the artifact.

## QA Configuration Inputs
1. QA smoke:
   - `QA_BASE_URL` (required)
   - `QA_COMPANY_TOKEN` (required in practice for active tenant context; avoid legacy fallback values)
   - `QA_EMAIL` / `QA_PASSWORD` (optional defaults)
   - `QA_AUTH_JWT` (optional)
2. QA deploy summary:
   - `QA_DEPLOY_SUMMARY_FILE` (local file path) or pipeline-produced equivalent
3. QA drill connectivity:
   - `QA_SSH_HOST` (required for remote validation)
   - `QA_SSH_PORT` (default `22`)
   - `QA_SSH_USER` (default `root`)
   - `QA_APP_DIR` (default `/var/www/skupervisor`)
4. Drill mode:
   - `QA_ROLLBACK_DRILL_APPLY=0|1` (default simulation)
   - `QA_RESTORE_DRILL_APPLY=0|1` (default simulation)

## Windows OpenSSH Compatibility
The QA rollback and restore drill scripts suppress warning-only SSH stderr where supported. Some Windows OpenSSH versions reject `WarnWeakCrypto=no`; the scripts now probe support before adding that option, then always keep `LogLevel=ERROR`. If a drill still fails, inspect the generated JSON artifact before treating warning text as a real rollback/restore failure.

Recommended local secret source:
1. Keep non-secret defaults in `.env.qa.local`.
2. Keep credentials/tokens in `.env.qa.secrets.local` (gitignored).
3. `scripts/deploy-remote.sh` and `scripts/load-qa-env.ps1` auto-load the secrets overlay when present.
4. Explicit process environment values take precedence over local file defaults, so `RELEASE_TARGET_SHA=<sha> npm run gate:release:no-staging:qa-env` can safely target the intended release even if a local QA env file is older.

## Emergency Bypass
Allowed only during incident response with explicit metadata:
1. `RELEASE_EMERGENCY_BYPASS=1`
2. `RELEASE_EMERGENCY_REASON=<reason>`
3. `RELEASE_EMERGENCY_ACTOR=<name_or_id>`

Bypass is recorded in `release_verdict.json` and must be linked in incident notes.

Emergency bypass cannot override:
1. Dirty or mismatched deploy source contract.
2. Missing or failing merge adoption proof when high-risk paths changed.
3. Stale frontend build parity.
4. Production runtime SHA mismatch after deploy.

## References
1. `docs/ops/PRODUCTION_CHECKLIST.md`
2. `docs/guides/SCRIPTS_GUIDE.md`
3. `DEPLOYMENT_GUIDE.md`
