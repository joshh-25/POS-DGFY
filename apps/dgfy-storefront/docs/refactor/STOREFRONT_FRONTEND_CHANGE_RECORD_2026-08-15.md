# Storefront Frontend Change Record

Date: 2026-08-15
Status: Committed locally on `feat/storefront-frontend-change-record`; not pushed or opened as a PR.

## Purpose

This record describes the committed storefront frontend work prepared for the
next review and push. It is a frontend-only change record: it does not change
the Storefront API, POS API, database schema, POS behavior, shared POS
constants, or local environment files.

It is the current release-status reference for the storefront slices listed
below. Earlier slice notes may still say "not committed" because they were
written before the local commits were created.

## Architecture basis

This work stays within the existing storefront ownership boundary:

- `StorefrontApp.jsx` acts as an application shell and dispatcher.
- Each industry owns its catalog, item-detail, checkout, and tracking flow.
- Shared storefront sections remain limited to Hero/navigation, business
  information, promo, reviews, footer, and neutral low-level primitives.
- A shared layout must not choose industry behavior through mode flags.
- No backend response shape or checkout request contract was changed.

Authoritative references used:

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`
- `apps/dgfy-web/apps/store/docs/refactor/STOREFRONT_FRONTEND_ARCHITECTURE_GUIDE.md`
- `docs/ops/RELEASE_CANDIDATE_POLICY.md`

Architecture classification: within the existing frontend module boundary. No
ADR amendment is required because ownership and API contracts were preserved.

## Included work

### Retail storefront

- Stabilized product-details and cart access without changing Retail backend
  contracts.
- Moved Retail catalog and route composition into Retail-owned storefront
  modules.
- Added Retail-owned tracking route, active/completed views, drawer, runtime,
  adapter, payload mapper, and presentation helpers.
- Kept Retail catalog controls mode-owned, including its toolbar and responsive
  pagination alignment.
- Preserved the existing Retail visual direction while improving mobile catalog
  controls, product-details presentation, cart access, and tracking flow.

### Simple MSME storefront

- Added mode-owned catalog route and catalog controls: search, price filter,
  categories, cards, responsive pagination, and Simple palette presentation.
- Kept Simple Hero, About, Gallery, contact/location, and mobile information
  cards inside the Simple mode while reusing only neutral shared sections.
- Improved Simple cart and checkout presentation across customer, fulfillment,
  payment, review, success, address, and mobile-summary surfaces.
- Kept calculations visible without a separate quote action, added promo-summary
  presentation, and retained the existing checkout API flow.
- Added Simple-owned tracking runtime, route frame, drawer mapping, completed
  order view, and responsive pickup status presentation. The mobile tracking
  flow now keeps all progress stages visible and removes the oversized mobile
  status illustration.

### Food & Beverage storefront

- Added an F&B-owned catalog route and dispatched F&B catalog rendering to it.
- Preserved the current F&B menu UI, toolbar, pagination, cards, item details,
  checkout, and tracking behavior.
- Added contract coverage to ensure F&B remains available when community data
  is absent and to protect the mode-ownership boundary.

### Shared storefront route and loading infrastructure

- Added a branded loading/error boundary so the storefront does not present an
  empty catalog area while storefront data is loading or unavailable.
- Kept catalog routing and cart drawer mounting at the app-shell level while
  delegating industry UI to mode-owned route pages.
- Added responsive image fetch-priority support and reduced development-only
  browser warning noise without changing production data behavior.
- Added contract tests for loading, failure, route ownership, and development
  warning behavior.

## Local commit inventory

| Commit | Description |
| --- | --- |
| `7e9d11c1` | Retail product-details and cart-access stabilization. |
| `943a7019` | Retail mobile catalog-control refinements. |
| `d8fa81e4` | Initial Simple-owned catalog and Retail tracking modules. |
| `3f5336ed` | Route dispatch to industry-owned catalog and tracking pages. |
| `018650c7` | Contract tests for mode ownership and responsive routes. |
| `58845a96` | Storefront ownership-boundary documentation. |
| `1c8851de` | Retail-owned catalog route. |
| `2255cb8b` | Retail catalog dispatch moved out of the shared route container. |
| `00396363` | Retail catalog ownership contract test. |
| `88e9cc7d` | F&B-owned catalog route. |
| `dcfc93d9` | F&B catalog dispatch moved to the F&B route owner. |
| `c3b4d2f6` | F&B catalog ownership contract test. |
| `6f195b02` | F&B catalog remains available without community data. |
| `84fe15f8` | Retail storefront route composition becomes mode-owned. |
| `08ff2da9` | Simple MSME catalog, checkout, and tracking refinement. |
| `2f5c40a1` | Shared storefront loading and route boundary. |
| `c6def588` | Retail catalog pagination alignment. |
| `10b080bd` | F&B ownership contract coverage for the shared boundary. |
| `57788462` | Storefront image-priority compatibility and deferred-shell test stabilization. |

## Files and scope

The storefront batch changes files only under:

```text
apps/dgfy-web/apps/store/docs/refactor/
apps/dgfy-web/apps/store/src/StorefrontApp.jsx
apps/dgfy-web/apps/store/src/app/
apps/dgfy-web/apps/store/src/modes/fnb/
apps/dgfy-web/apps/store/src/modes/retail/
apps/dgfy-web/apps/store/src/modes/simple/
apps/dgfy-web/apps/store/src/shared/
apps/dgfy-web/apps/store/src/store/
apps/dgfy-web/apps/store/src/__tests__/
```

The following work is explicitly excluded from this storefront push:

- `apps/dgfy-api/**`
- `apps/dgfy-web/src/features/pos/**`
- `apps/dgfy-web/src/features/settings/**`
- `packages/shared-constants/**`
- `AGENTS.md`
- local `.env` files

Those files may be present as local working-tree changes, but they are not part
of the storefront commit inventory and must not be staged for this branch.

## Backend support and intentional limits

- Product/catalog, promo, checkout, order-status, and storefront-content data
  continue to use the existing backend contracts.
- The frontend does not invent stock, discount, payment, or tracking status
  truth. It presents normalized responses from the existing runtime.
- Loading and error UI improves the customer experience when the local API is
  unavailable, but it does not replace the API. A running backend and valid
  storefront configuration are still required for live catalog content.
- No new API endpoint, migration, secret, local environment value, or POS
  workflow is included.

## Validation evidence and current qualification status

Completed before this documentation record:

```text
cmd /c npm test -- apps/store/src/__tests__/fnbStorefront.contract.test.js apps/store/src/__tests__/simpleStorefrontRoute.contract.test.js apps/store/src/__tests__/simpleTrackingPresentation.test.js apps/store/src/__tests__/simpleCheckoutSuccessStep.test.jsx apps/store/src/__tests__/simpleCheckoutSummaryPresentation.test.js apps/store/src/__tests__/simpleTrackingCompletedView.test.jsx apps/store/src/__tests__/storefrontDevelopmentWarnings.test.js apps/store/src/__tests__/storefrontLoadFailurePresentation.test.js
```

Result: 8 test files passed, 40 tests passed.

Follow-up storefront validation completed after the loading-boundary change:

- the responsive-image component uses the lowercase HTML `fetchpriority`
  attribute required by the current React runtime, with a narrow ESLint
  compatibility suppression;
- profile and discovery integration coverage waits for the lazy, mode-owned
  shell to become interactive instead of assuming it mounts immediately;
- a catalog-load failure asserts the remaining safe actions (`Shop` and
  `Track Order`) rather than presenting `Order Now` while no catalog is
  available.

The focused storefront lint check passed. The focused Vitest run emitted the
expected React Router future-flag and Browserslist-data notices; it is not a
release blocker by itself. The local terminal did not return a final suite
summary before its execution window elapsed because other local Node/Vite
processes were active, so this record does not claim that run as a complete
pass.

The following gates must pass on this branch before push/PR:

```text
cmd /c npm run lint:docs
cmd /c npm run check:architecture
cmd /c npm run build:store
cmd /c npm run gate:release:local
```

The local release gate is the repository's documented substitute while the
GitHub quality-check workflow is paused. Its result must be recorded in the PR
testing evidence.

### Local release-gate result on this branch

`cmd /c npm run gate:release:local` was run before the follow-up storefront
lint correction. It passed documentation lint, architecture guardrails,
compliance checks, runtime diagnostics, storefront build/budget checks, and
the production build bundles. It did not pass as a whole because of the
following blockers:

- the local dependency-audit runner could not spawn `npm` (`ENOENT`);
- the backend test matrix does not have the local `sku_test` database;
- unrelated Settings and Tenant Manager integration tests timed out or had
  incomplete mocks;
- storefront integration tests needed the deferred-shell stability corrections
  included in `57788462`.

The storefront lint error from that gate is corrected by `57788462`, but the
full release gate must be re-run after the audit runner and local test database
are available. Therefore this branch is **not yet validated as locally green**
and must not be pushed as a ready-for-review change.

## Safe push and PR sequence

1. Fetch `sieitzz/develop` and re-check branch drift.
2. Reconcile this feature branch with the latest `sieitzz/develop` before
   pushing. At the time this record was created, the storefront branch was 59
   commits behind `sieitzz/develop`; do not treat the current local test result
   as merge-ready evidence after that branch changes.
3. Re-run the validation commands above on the reconciled commit.
4. Confirm `git diff --cached --name-only` contains only the storefront batch
   and this document.
5. Push `feat/storefront-frontend-change-record` and open a PR targeting
   `develop`.
6. Use `.github/pull_request_template.md`, including `## Summary`,
   `## Testing Evidence`, architecture classification, excluded work, and the
   remaining API-runtime dependency note.
7. Wait for GitHub PR checks to pass before merge. Do not claim production
   deployment: only a later `main` merge triggers production deployment.

## Rollback

The changes are frontend-only. A rollback can revert the relevant storefront
commits or the final PR merge without database migration or API rollback.
For any customer-visible regression, the first rollback target is the
mode-owned route or presentation commit that introduced it; shared loading
boundary rollback is separate from Retail, Simple, and F&B behavior.
