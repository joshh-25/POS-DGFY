# Quick Reference

## Production Deploy
```bash
cd /var/www/skupervisor
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$BRANCH"
EXPECTED_COMMIT=$(git rev-parse "origin/$BRANCH")
bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

If lock error appears and no deploy process exists:
```bash
ps -ef | grep deploy.sh | grep -v grep
rm -f /tmp/skupervisor_deploy.lock
DEPLOY_REEXECED=1 bash scripts/deploy.sh --branch "$BRANCH" --expect-commit "$EXPECTED_COMMIT"
```

## Strict Gates (manual)
```bash
cd /var/www/skupervisor/backend
npm run repair:indexes
npm run audit:indexes
npm run audit:billing-funnel
```

## Billing Audit Drift Cleanup
```bash
mysql -h localhost -u <DB_USER> -p -D <DB_NAME> -e "DELETE FROM webhook_logs WHERE webhook_id LIKE 'test_webhook_%' AND event_type='PAYMENT.SALE.COMPLETED';"
```

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
