# PR25 POS Setup/Cashier UI Hotfix

## Summary
This hotfix restores the richer POS setup and cashier experience from PR #25 while keeping the current production terminal-pairing safeguards.

## Included
- POS setup/profile/storefront workflow UI.
- Cashier unlock and username/email cashier login.
- POS setup cashier list/create APIs using existing tenant users.
- POS Settings access PIN verification with hash-only storage.
- Shared POS shell and transaction-history pending-sync affordance.

## Excluded
- Payment-channel or PayMongo work.
- Android/native bundle rebuild.
- Database migrations.
- Branch retirement.

## Validation
- POS frontend contracts: passed, 69 tests.
- POS production build: passed.
- SKUpervisor production build: passed.
- Backend POS terminal-pairing tests: passed, 9 tests.
- Docs lint, architecture, compliance, and development-to-production tests: passed.

## Production Accuracy Required
After deployment, production proof must show the exact deployed `origin/master` SHA and the live POS bundle must contain the richer PR #25 setup/cashier UI strings.
