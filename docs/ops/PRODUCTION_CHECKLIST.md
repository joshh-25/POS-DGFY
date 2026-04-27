# Production Deployment Checklist

Use this checklist for every production rollout.

## 0. One-Time Access Setup (Per Operator Machine)
- [ ] Configure SSH key-based access for production deploy user.
- [ ] Confirm server allows key auth (`pubkeyauthentication yes`).
- [ ] Verify non-interactive login works:
  ```bash
  ssh -o BatchMode=yes skupervisor-prod "echo AUTH_OK && hostname"
  ```

## 1. Pre-Deployment (Local)
- [ ] All intended code/docs changes are committed
- [ ] Changes are pushed to the remote branch you will deploy
- [ ] Optional: CI checks are green
- [ ] No-staging hard gate passes for the exact target SHA:
  ```bash
  # Required QA inputs:
  # export QA_BASE_URL="https://<qa-host>"
  # export QA_DEPLOY_SUMMARY_FILE=".tmp/release-gates/<sha>/qa_deploy_summary.txt"
  RELEASE_TARGET_SHA="<target_sha>" npm run gate:release:no-staging
  ```
- [ ] Production multi-location contract smoke gate is green:
  ```bash
  # one-time local setup
  # cp .env.prod.local.example .env.prod.local
  # set PROD_COMPANY_TOKEN to active production tenant token
  npm run gate:release:prod-contracts:env
  # or run directly if env is already exported in shell
  # Prefer cached JWT to avoid auth rate limits:
  # export PROD_AUTH_JWT="<valid_jwt>"
  npm run gate:release:prod-contracts
  ```

## 2. Server Prep
- [ ] SSH to server
- [ ] Go to project root: `cd /var/www/skupervisor`
- [ ] Confirm server working tree is clean:
  ```bash
  git status --short
  ```
- [ ] Resolve target commit:
  ```bash
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch origin "$BRANCH"
  EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
  ```
- [ ] Optional sanity check for deploy script parseability:
  ```bash
  bash scripts/deploy.sh --help
  ```

If server worktree is not clean, snapshot and stash before deploy:
```bash
STAMP=$(date +'%Y%m%d_%H%M%S')
mkdir -p /root/deploy-prep
git status --short > /root/deploy-prep/status_$STAMP.txt
git diff > /root/deploy-prep/working_$STAMP.patch || true
git diff --cached > /root/deploy-prep/index_$STAMP.patch || true
git stash push -u -m "predeploy-$STAMP"
```

## 3. Run Deployment
- [ ] Execute:
  ```bash
  bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
  ```

Notes:
- Strict tenant gates are on by default:
  - `DEPLOY_TENANT_SYNC_REQUIRE_ZERO=1`
  - `DEPLOY_TENANT_INDEX_HEADROOM_STRICT=1`
- **Key Limit Fix**: If schema sync fails with "Too many keys", run:
  ```bash
  node backend/scripts/cleanup-duplicate-indexes.js
  ```
- **Seeding Quality Data**: To reset the QA environment with 100% verified data:
  ```bash
  node backend/scripts/seed_qa_data.js
  ```
- Strict gates must pass:
  - `npm run audit:indexes`
- Frontend builds included by deploy script:
  - `build:skupervisor`
  - `build:pos`
  - `build:store` (with `/tenant-store/` base path)

Optional deep verification gate:
```bash
DEPLOY_VERIFY_TENANT_NAME="Premium Corp" DEPLOY_VERIFY_SKIP_IF_MISSING=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --verify
```

If using local one-command remote deploy:
```bash
# This command now runs no-staging hard gate after push and before prod SSH deploy.
bash scripts/deploy-remote.sh
```

## 4. If Lock Error Appears
- [ ] Check active deploy process:
  ```bash
  ps -ef | grep deploy.sh | grep -v grep
  ```
- [ ] If no process exists, clear stale lock and rerun with:
  ```bash
  rm -f /tmp/skupervisor_deploy.lock
  DEPLOY_REEXECED=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
  ```

## 5. Post-Deploy Verification
- [ ] `pm2 list` shows services online
- [ ] `GET /health` returns healthy status
- [ ] Login and critical flows work
- [ ] Re-run production multi-location contract smoke gate:
  ```bash
  npm run gate:release:prod-contracts:env
  # or run directly if env is already exported in shell
  # Use fresh token or cached JWT from active session
  npm run gate:release:prod-contracts
  ```
- [ ] Public endpoints respond with 2xx/3xx:
  - [ ] `https://skupervisor.surebizcorp.com`
  - [ ] `https://pos.surebizcorp.com`
  - [ ] `https://surebizcorp.com`
  - [ ] `https://surebizcorp.com/tenant-store`
- [ ] Public upload assets proxy correctly on all surfaces:
  - [ ] `https://skupervisor.surebizcorp.com/uploads/...` returns `200 image/*`
  - [ ] `https://pos.surebizcorp.com/uploads/...` returns `200 image/*`
  - [ ] `https://surebizcorp.com/uploads/...` returns `200 image/*`
- [ ] Tenant-store asset URLs from `https://surebizcorp.com/tenant-store` resolve correctly:
  - [ ] JS bundle URL returns JavaScript (not HTML fallback)
  - [ ] Manifest URL returns manifest/json (not HTML fallback)
- [ ] `surebizcorp.com` Nginx applies `/tenant-store/` rewrite before proxying to `127.0.0.1:5175`
- [ ] Latest deploy summary exists under `logs/deploy/`
- [ ] Summary commit matches target commit:
  ```bash
  ls -1t logs/deploy/deploy_*.summary.txt | head -1 | xargs -I{} tail -n 30 {}
  ```

## 6. If `npm ci` Fails with `EPERM`/File Lock
- [ ] Treat as transient lock unless repeated after retries.
- [ ] Re-run deploy (script now retries automatically with backoff).
- [ ] If lock persists on Windows/local runners, close processes holding `node_modules` binaries (commonly `esbuild.exe`) and re-run.
- [ ] Do not bypass `npm ci` unless incident commander approves.

## 7. Rollback (If Needed)
1. Revert safely with a new commit:
   ```bash
   git revert --no-edit <deployed_commit_sha>
   git push origin <branch>
   ```
2. Re-run deployment with pinned expected commit.
3. If server drift was stashed pre-deploy, inspect and re-apply intentionally:
   ```bash
   git stash list
   git stash show -p stash@{0}
   ```
