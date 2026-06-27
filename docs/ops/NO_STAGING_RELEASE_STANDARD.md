# No-Staging Release Standard

## Purpose
Enforce production safety when no staging environment exists by requiring QA evidence before every production deploy.

Development-to-production branch promotion is governed by `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`. This no-staging standard remains the production hard gate for the exact `origin/master` SHA after `staging -> master` promotion.

## Hard Gate Policy
Production release is blocked unless all of the following are true for the exact target SHA:
0. Batch inventory exists for the target SHA and every changed file belongs to exactly one release batch.
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

Routine releases should create QA parity before this hard gate. The wrapper can promote the pushed target SHA to QA before production only when QA is configured as a distinct host or app directory:
```bash
DEPLOY_PROMOTE_QA_BEFORE_PROD=auto
```

If `.env.qa.local` points at the production host and production app directory, automatic QA promotion fails before the production gate. Set a real QA host/app dir, or explicitly disable the promotion step with:
```bash
DEPLOY_PROMOTE_QA_BEFORE_PROD=off
```

Production-as-QA evidence mode can fetch and validate existing deploy-summary evidence, but it cannot create pre-production parity and must not mutate production as a "QA" step.

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
3. `scripts/deploy-remote.sh` fetches fresh QA deploy-summary evidence every run before invoking the hard gate.
4. Emergency override remains available only through the explicit bypass metadata contract below and remains incident-only.
5. `npm run gate:release:observability` records traceability evidence and stale-QA review context. It starts in report mode and should be switched to enforce mode after one successful production release includes the artifact.

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

For the current production-host-as-QA evidence path, keep `.env.qa.local` and `.env.qa.secrets.local` complete before release work starts:
1. `.env.qa.local` owns non-secret host inputs such as `QA_BASE_URL`, `QA_SSH_HOST`, `QA_SSH_PORT`, `QA_SSH_USER`, `QA_APP_DIR`, and any local `QA_DEPLOY_SUMMARY_FILE` override.
2. `.env.qa.secrets.local` owns `QA_COMPANY_TOKEN`, `QA_AUTH_JWT` when used, and any credential-like values.
3. `QA_COMPANY_TOKEN` must be a real active tenant token for the same environment named by `QA_BASE_URL`; placeholders such as `token-original` are release blockers, not warnings.
4. Rollback and restore drill connectivity must pass before code freeze. Missing SSH port, stale host alias, or broken drill credentials are hard gate setup failures.
5. If a release uses a clean linked worktree, the push step must push the release worktree `HEAD` to the deployment branch explicitly or prove `origin/master` already equals the release SHA. Do not rely on a different checked-out local `master` worktree.

QA promotion inputs:
1. `DEPLOY_PROMOTE_QA_BEFORE_PROD=auto|off|0` controls whether `scripts/deploy-remote.sh` tries to deploy QA before the production gate. Default: `auto`.
2. `QA_DEPLOY_BRANCH` selects the QA branch to fetch/deploy. Default: `master`.
3. `QA_APP_DIR` must identify the QA checkout. If it equals the production app dir on the same host, promotion refuses to run.
4. `QA_DEPLOY_DRY_RUN=1 npm run deploy:qa:target` validates the target and remote command without SSH mutation.

Tenant index headroom:
1. `scripts/deploy-remote.sh` forwards `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=0` by default while redundant index cleanup remains an accepted report-mode deploy concern.
2. Set `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1` to restore strict headroom enforcement for a release.

## Windows OpenSSH Compatibility
The QA rollback and restore drill scripts suppress warning-only SSH stderr where supported. Some Windows OpenSSH versions reject `WarnWeakCrypto=no`; the scripts now probe support before adding that option, then always keep `LogLevel=ERROR`. If a drill still fails, inspect the generated JSON artifact before treating warning text as a real rollback/restore failure.

## Windows Line-Ending And Manual SSH Safety
Windows shells must not pipe generated multi-line deploy scripts or here-strings directly into remote `bash` when the command includes SHA or branch arguments. CRLF can become part of arguments such as `--expect-commit <sha>\r` or `--branch master\r`, causing false expected-SHA mismatches or invalid refspecs.

Preferred paths:
1. Use Git Bash for the local wrapper:
   ```powershell
   & "C:\Program Files\Git\bin\bash.exe" scripts/deploy-remote.sh --yes
   ```
2. If a manual remote command is unavoidable, pass one remote command argument through SSH instead of piping stdin:
   ```powershell
   ssh.exe <host> "cd /var/www/skupervisor && git fetch origin master && EXPECTED_COMMIT=$(git rev-parse origin/master) && bash scripts/deploy.sh --branch master --expect-commit $EXPECTED_COMMIT"
   ```
3. If a script file must be transferred, write it with LF line endings and run `sed -i 's/\r$//' <script>` on the server before execution.

Do not use emergency bypass solely to work around line-ending corruption. Fix the invocation path, rerun the gate, and keep `--expect-commit` enabled for routine releases.

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
5. Missing batch inventory.
6. Payment-sensitive release uncertainty.
7. Unknown or production-equivalent QA target.

## References
1. `docs/ops/PRODUCTION_CHECKLIST.md`
2. `docs/guides/SCRIPTS_GUIDE.md`
3. `DEPLOYMENT_GUIDE.md`
