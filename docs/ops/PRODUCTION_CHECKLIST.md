# Production Deployment Checklist

Use this checklist for every production rollout.

## 1. Pre-Deployment (Local)
- [ ] All intended code/docs changes are committed
- [ ] Changes are pushed to the remote branch you will deploy
- [ ] Optional: CI checks are green

## 2. Server Prep
- [ ] SSH to server
- [ ] Go to project root: `cd /var/www/skupervisor`
- [ ] Resolve target commit:
  ```bash
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git fetch origin "$BRANCH"
  EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
  ```

## 3. Run Deployment
- [ ] Execute:
  ```bash
  bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
  ```

Notes:
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
- [ ] Public endpoints respond with 2xx/3xx:
  - [ ] `https://skupervisor.surebizcorp.com`
  - [ ] `https://pos.surebizcorp.com`
  - [ ] `https://surebizcorp.com`
  - [ ] `https://surebizcorp.com/tenant-store`
- [ ] Tenant-store asset URLs from `https://surebizcorp.com/tenant-store` resolve correctly:
  - [ ] JS bundle URL returns JavaScript (not HTML fallback)
  - [ ] Manifest URL returns manifest/json (not HTML fallback)
- [ ] `surebizcorp.com` Nginx applies `/tenant-store/` rewrite before proxying to `127.0.0.1:5175`
- [ ] Latest deploy summary exists under `logs/deploy/`

## 6. Rollback (If Needed)
1. Revert safely with a new commit:
   ```bash
   git revert --no-edit <deployed_commit_sha>
   git push origin <branch>
   ```
2. Re-run deployment with pinned expected commit.
