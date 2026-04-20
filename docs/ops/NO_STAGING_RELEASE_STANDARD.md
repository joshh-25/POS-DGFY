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

The enforced command is:
```bash
RELEASE_TARGET_SHA=<target_sha> npm run gate:release:no-staging
```

`scripts/deploy-remote.sh` runs this gate automatically after push and before production SSH deploy when:
```bash
DEPLOY_ENFORCE_NO_STAGING_GATE=1
```

## Evidence Contracts
Default evidence root:
```text
.tmp/release-gates/<target_sha>/
```

Required files:
1. `qa_deploy_summary.txt` (must contain `deployed_head=<target_sha>`)
2. `smoke_result.json`
3. `rollback_drill_result.json`
4. `restore_drill_result.json`
5. `release_verdict.json` (final aggregated verdict)

## QA Configuration Inputs
1. QA smoke:
   - `QA_BASE_URL` (required)
   - `QA_COMPANY_TOKEN` (optional default `token-original`)
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

## Emergency Bypass
Allowed only during incident response with explicit metadata:
1. `RELEASE_EMERGENCY_BYPASS=1`
2. `RELEASE_EMERGENCY_REASON=<reason>`
3. `RELEASE_EMERGENCY_ACTOR=<name_or_id>`

Bypass is recorded in `release_verdict.json` and must be linked in incident notes.

## References
1. `docs/ops/PRODUCTION_CHECKLIST.md`
2. `docs/guides/SCRIPTS_GUIDE.md`
3. `DEPLOYMENT_GUIDE.md`
