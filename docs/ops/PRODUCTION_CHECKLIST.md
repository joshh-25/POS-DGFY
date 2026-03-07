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
- Legacy hooks are skipped by default. Enable only when needed:
  ```bash
  bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT" --run-legacy-hooks
  ```
- Strict gates must pass:
  - `npm run audit:indexes`
  - `npm run audit:billing-funnel`

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

## 5. If Billing Audit Fails (`webhook_without_telemetry`)
- [ ] Remove synthetic test webhook rows:
  ```bash
  mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
  ```
- [ ] Verify audit returns healthy:
  ```bash
  cd backend
  npm run audit:billing-funnel
  cd ..
  ```

## 6. Post-Deploy Verification
- [ ] `pm2 list` shows services online
- [ ] `GET /health` returns healthy status
- [ ] Login and critical flows work
- [ ] Latest deploy summary exists under `logs/deploy/`

## 7. Rollback (If Needed)
1. Revert safely with a new commit:
   ```bash
   git revert --no-edit <deployed_commit_sha>
   git push origin <branch>
   ```
2. Re-run deployment with pinned expected commit.
