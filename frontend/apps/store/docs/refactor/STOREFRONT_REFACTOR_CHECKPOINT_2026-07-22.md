---
status: reference
authority_level: reference
owner: storefront_frontend
last_reviewed: 2026-07-22
applies_to: storefront_frontend_refactor_checkpoint
topic: storefront_refactor_checkpoint_2026_07_22
---

# Storefront Refactor Checkpoint - 2026-07-22

## Branch

- Remote: `sieitzz`
- Branch: `fix/storefront-refactor-progress-20260722`
- Pushed checkpoint SHA: `4c478ea2156fadb9da9f7e9721a8f2e790eed38a`
- Base used for final validation: `sieitzz/develop` at `92df93c2d828145a5d196860e8bad8796cdd7561`
- Branch position after synchronization: `0 behind`, `11 ahead`

This is a development checkpoint branch. It is not a production release and no pull request was created in this pass.

## Purpose

This checkpoint preserves the latest Storefront frontend refactor so another developer can continue without moving feature code back into `StorefrontApp.jsx`.

The refactor follows the Storefront plan and architecture guide:

- `STOREFRONT_REFACTOR_PLAN.md`
- `STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
- `STOREFRONT_REFACTOR_IMPLEMENTATION_GOAL.md`
- `STOREFRONT_REFACTOR_PROGRESS_REPORT.md`
- `STOREFRONT_REFACTOR_HANDOFF.md`

## Current State In Simple Terms

- `StorefrontApp.jsx` is now `9,183` lines.
- It is still too large, but major UI and runtime sections now live in ownership folders.
- New feature logic must not be added directly to `StorefrontApp.jsx` when an ownership folder exists.
- The branch contains `215` changed files compared with the synchronized `develop` base.

## Main Ownership Areas In This Checkpoint

### Customer Dashboard

Location: `frontend/apps/store/src/customer-dashboard/`

Includes dashboard routes, pages, tabs, notifications, customer data handling, tracking actions, drawer/page presentation, and POS access behavior.

### Discovery And Map

Location: `frontend/apps/store/src/discovery/`

Includes search result preparation, map and marker presentation, clustered pin behavior, result-panel state, responsive result layout, and Discovery route composition.

Discovery is shared across Storefront modes. Do not move it under F&B, Services, or Simple.

### F&B Mode

Location: `frontend/apps/store/src/modes/fnb/`

Includes the F&B storefront, catalog and product details, cart, checkout steps, guest email OTP UI/runtime, promotions, order summaries, tracking, and order-completion presentation.

### Services Mode

Location: `frontend/apps/store/src/modes/services/`

Includes Services storefront and booking ownership. The latest bounded slice extracted the booking details form and retained booking-specific cart persistence.

### Simple Mode

Location: `frontend/apps/store/src/modes/simple/`

Includes Simple storefront and checkout ownership. Checkout composition and prop assembly now live inside the mode boundary.

### Shared Storefront Code

Location: `frontend/apps/store/src/shared/`

Includes mode-neutral UI, cart storage and synchronization, URL builders, theme primitives, formatting, and other reusable helpers.

### Tests

Location: `frontend/apps/store/src/__tests__/`

Includes contracts for customer dashboard presentation, Discovery/map behavior, F&B checkout and tracking, guest OTP, promo/order payloads, and cart persistence.

## Latest Fix Included

The final checkpoint replaces JavaScript imports from the Vite `public` directory with the public URL `/dgfy-logo.png` in:

- `frontend/apps/store/src/Components/store/StoreDashboard.jsx`
- `frontend/apps/store/src/customer-dashboard/components/CustomerDashboardSidebar.jsx`
- `frontend/apps/store/src/shared/components/storefront/hero/StorefrontHeaderNav.jsx`

This removes the Vite public-asset import warning while preserving the existing logo and UI.

## Local Backend Readiness

The Storefront proxy expects the backend at `127.0.0.1:5000`.

During final validation, the backend initially refused connections because pending local database migrations had not been applied. Running the repository migration command applied the pending migrations, after which:

- port `5000` was listening;
- the database connection was healthy;
- the runtime schema audit was healthy;
- no migrations or environment files were committed by this checkpoint.

The local health endpoint remains degraded when Redis is configured as required but Redis is not running. This is a local runtime prerequisite, not a Storefront build failure.

## Validation Evidence

Completed after merging the latest `sieitzz/develop`:

- Storefront production build: passed.
- Targeted Storefront tests: `11` files passed, `59` tests passed.
- Scoped ESLint for the final logo fix: `0` errors, `2` existing unused-prop warnings.
- Git diff whitespace check: passed.
- Prohibited commit-marker scan: no matches in the branch diff.
- Environment/local-development path scan: no `.env` or `local-dev/` files in the branch diff.
- Final merge from `sieitzz/develop`: completed without conflicts.

Build warnings that remain:

- Browserslist data is stale.
- Large Storefront JavaScript chunks still need future code splitting.

These warnings did not fail the production build.

## Explicitly Excluded

The following local untracked paths were not staged or pushed:

- `frontend/dgfy-logo.png`
- `local-dev/`

No SMTP credentials, `.env` files, API keys, tokens, certificates, or private keys were added by this checkpoint.

## Manual QA Recommended

Before using this branch as a new integration base, verify:

1. Discovery search, category filters, pins, clusters, and Show/Hide Results controls.
2. Customer Dashboard overview, orders, bookings, addresses, loyalty, account, business, notifications, and sign-out.
3. F&B catalog, product details, add-to-cart behavior, cart drawer, checkout Steps 1-3, promo apply/remove, guest OTP, place order, tracking, and order completion.
4. Services booking cart restore after refresh and booking steps.
5. Simple checkout Steps 1-4.
6. Header, dashboard, and template DGFY logos load without Vite public-import warnings.

## Next Safe Refactor Work

1. Continue with one bounded ownership slice at a time.
2. Keep behavior changes separate from file moves.
3. Re-run focused tests, scoped lint, and `build:store` after every slice.
4. Update `STOREFRONT_REFACTOR_PROGRESS_REPORT.md` after each completed slice.
5. Prioritize shrinking `StorefrontApp.jsx`, but do not move checkout submission, payment, OTP, promo calculation, tracking polling, or map behavior together in one change.
6. Preserve Hospitality as a separate mode unless an explicit product decision changes that boundary.

## Exact Change Inventory

Use this command from the repository root to list every checkpoint file against the synchronized base:

```powershell
git diff --name-status sieitzz/develop...fix/storefront-refactor-progress-20260722
```

Use this command to inspect the checkpoint commits only:

```powershell
git log --oneline sieitzz/develop..fix/storefront-refactor-progress-20260722
```
