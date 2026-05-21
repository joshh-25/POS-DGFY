# Quick Reference

## One-Time SSH Setup (Per Machine)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/skupervisor_deploy_ed25519 -C "skupervisor-deploy"
cat ~/.ssh/skupervisor_deploy_ed25519.pub | ssh -p 64428 root@192.53.116.33 'umask 077; mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys'
ssh -o BatchMode=yes -i ~/.ssh/skupervisor_deploy_ed25519 -p 64428 root@192.53.116.33 "echo AUTH_OK && hostname"
```

## Production Deploy
```bash
cd /var/www/skupervisor
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
RELEASE_TARGET_SHA="$EXPECTED_COMMIT" npm run gate:release:no-staging
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

If server worktree is dirty:
```bash
STAMP=$(date +'%Y%m%d_%H%M%S')
mkdir -p /root/deploy-prep
git status --short > /root/deploy-prep/status_$STAMP.txt
git diff > /root/deploy-prep/working_$STAMP.patch || true
git diff --cached > /root/deploy-prep/index_$STAMP.patch || true
git stash push -u -m "predeploy-$STAMP"
```

If lock error appears and no deploy process exists:
```bash
ps -ef | grep deploy.sh | grep -v grep
rm -f /tmp/skupervisor_deploy.lock
DEPLOY_REEXECED=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

If deploy script reports `$'\\r': command not found`:
```bash
sed -i 's/\r$//' scripts/deploy.sh
bash scripts/deploy.sh --help
```

## Strict Gates (manual)
```bash
cd /var/www/skupervisor/backend
npm run repair:indexes
npm run audit:indexes
```

## Phone Completion Rollout
```bash
cd /var/www/skupervisor/backend
npm run verify:phone-rollout
npm run verify:phone-rollout:users
npm run verify:phone-rollout:config-safe
npm run verify:phone-rollout:complete
```

Recommended sequence:
1. Keep `PHONE_COMPLETION_ENFORCEMENT_MODE=observe` until unresolved historical accounts are reviewed.
2. Use `PHONE_COMPLETION_ENFORCEMENT_MODE=tenant_allowlist` plus `PHONE_COMPLETION_ENFORCED_TENANTS=<tenant-id-or-company-token>` only for tenants whose verifier count is already zero.
3. Switch to `PHONE_COMPLETION_ENFORCEMENT_MODE=all` only after `npm run verify:phone-rollout:complete` passes.

## PM2 Operations
```bash
pm2 list
pm2 logs --lines 100
pm2 startOrReload ecosystem.config.cjs --env production --update-env
pm2 save
```

## Live Deploy Log
```bash
cd /var/www/skupervisor
LOG=$(ls -1t logs/deploy/deploy_*.log | head -1)
tail -f "$LOG"
```

## Git Safety
```bash
git status
git log --oneline -5
git rev-parse HEAD
git rev-parse origin/$(git rev-parse --abbrev-ref HEAD)
```
