# POS MapLibre Tile Routing Hotfix

## Plain-English Summary

This hotfix makes the POS setup and settings maps load real map tiles instead of a blank gray panel when the POS production host does not provide a local `/openfreemap` tile proxy.

## Included

- POS map style fallback to OpenFreeMap when no POS tile proxy is configured.
- Non-POS surfaces keep the existing same-origin `/openfreemap` proxy behavior.
- Focused regression tests for POS and non-POS MapLibre routing.

## Excluded

- PayMongo or payment-channel work.
- Database migrations.
- Backend API changes.
- PR #25 POS cashier/setup UI changes already represented by the previous hotfix.
- Storefront discovery map behavior changes.
- Branch retirement.

## Regression Risk Notice

- Level: high
- Warning: A mistake could keep POS onboarding/settings maps blank or accidentally alter non-POS tile proxy behavior.
- Evidence reducing risk: focused MapLibre tests, POS production build, live resource content-type check, docs lint, architecture check, and whitespace check passed.
- Remaining gap: production still needs rendered POS proof after deployment.

## Rollback

Revert this hotfix commit and redeploy the previous production SHA. No migration rollback is required.

## Production Proof Required

- Production remote HEAD, deploy marker, deploy summary, and runtime health SHA match the final `origin/master` SHA.
- Production POS assets include the external OpenFreeMap fallback for the POS app surface.
- Live POS setup or settings map renders a real map tile layer, not only the pin shell.
