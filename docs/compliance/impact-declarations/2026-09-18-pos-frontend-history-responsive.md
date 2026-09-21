---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-09-21
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md,docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-09-18-pos-frontend-history-responsive
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,CONFLICT
policy_version: 2026.09.18
verification_evidence: npm --prefix apps/dgfy-pos run lint,npm --prefix apps/dgfy-pos run build,npx vitest run --maxWorkers=1 ../../packages/web-core/src/features/pos ../../packages/web-core/Components/ui/__tests__/pagination.test.jsx,npm --prefix apps/dgfy-ims test -- ../../packages/web-core/src/features/pos/__tests__/posCurrentSaleActions.behavior.test.jsx --maxWorkers=1 --fileParallelism=false,npm run smoke:pos-terminal-ui,node scripts/check-app-version-bump.js,npm run check:compliance,git diff --check
rollback_note: Revert the POS-only frontend commits and this declaration together if responsive checkout, catalog, terminal operations, transaction history, receipt actions, or pagination regress. Leave the unrelated apps/dgfy-api/src/services/csvExportService.js change untouched because it is outside this POS branch scope.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-18T21:56:14+08:00
preflight_request_ref: POS-FRONTEND-HISTORY-RESPONSIVE-2026-09-18
---

# POS Frontend History and Responsive Surface Audit

## Compliance Impact Classification

Major.

This branch contains a broad POS frontend refinement across checkout, catalog, terminal operations,
and transaction history. The work changes presentation, responsive layout, interaction state, and
frontend test contracts for compliance-sensitive terminal surfaces, so the declaration is classified
as major even though the implementation is frontend-only.

The changes do not alter backend routes, payment settlement, fiscal calculations, tax rules, receipt
persistence, tenant schemas, authentication, permissions, migrations, or database contracts. Existing
POS backend contracts and fail-closed validation remain authoritative.

## Affected Surfaces

1. POS checkout dialogs, receipt actions, responsive checkout layouts, and stable mobile sheet
   transitions.
2. POS catalog layout, image loading, category presentation, responsive tablet sizing, and catalog
   pagination.
3. POS transaction history filters, calendar dialogs, overlays, pagination, mobile bottom spacing,
   tablet landscape action columns, and responsive history presentation.
4. POS terminal top-bar controls, text-size selection, terminal lock/company selection, notification
   presentation, and responsive terminal viewport classification.
5. POS operational workspaces including audit, cashier history, F&B, pricelist, voucher, and terminal
   operations panels using the shared pagination and dialog primitives.
6. Shared web-core dialog and pagination primitives consumed by POS surfaces in this change.
7. POS frontend contract, behavior, workflow, and viewport tests plus POS app configuration and E2E
   login fixture support.

## Compliance Preconditions

1. Existing payment-method validation, checkout submission guards, fiscal totals, discount rules,
   receipt fields, and backend settlement contracts remain unchanged.
2. Responsive layout changes must preserve usable operator controls and readable transaction evidence
   across desktop, tablet portrait, tablet landscape, and mobile POS viewports.
3. History action controls must remain available and aligned with their table column without changing
   transaction authorization or void semantics.
4. Catalog and pagination changes must not change item visibility, price, stock, or tenant-scope
   policies.
5. Dialog overlays and transitions must not bypass dismiss/confirm behavior or expose payment or
   customer data in browser storage.
6. Terminal lock, cashier, company, notification, and operating-location controls remain governed by
   existing authorization and terminal contracts.
7. The unrelated API working-tree change is excluded from this POS commit series and must not be
   staged or pushed with this branch.

## Verification Evidence

1. POS subtree audit passed: 201 test files and 1,304 tests passed, including the shared pagination
   test.
2. `npm run lint` passed in `apps/dgfy-pos`.
3. `npm run build` passed in `apps/dgfy-pos`.
4. `npm run smoke:pos-terminal-ui` passed for desktop, tablet, and mobile viewport scenarios with no
   console or HTTP errors in the captured terminal evidence.
5. The focused POS action test passed after aligning the tablet cash-drawer accessible name with its
   visible label (`9` tests passed).
6. `node scripts/check-app-version-bump.js` passed with `dgfy-pos` version `1.20.0` → `1.21.0`.
7. `git diff --check` passed.
8. `npm run check:compliance` is required again after this declaration is staged and after the final
   commits are created.
9. A full IMS test run is not the branch gate because IMS is outside the requested POS push scope; its
   remaining inventory contract failure is documented separately as an out-of-scope baseline issue.

## Rollback Boundary

Rollback consists of reverting the POS frontend commits and this declaration together. Do not revert
or include the unrelated `apps/dgfy-api/src/services/csvExportService.js` working-tree change as part
of this branch's POS rollback.

## Commit Scope Note

The first implementation commit adds the shared pagination control and its focused unit test. The
remaining POS frontend commits carry this declaration forward while separating checkout/catalog work
from history/terminal responsive work for review and rollback clarity.

The second implementation commit covers checkout and catalog workflow presentation, including the
POS app integration points that consume the shared web-core surface and the associated contract and
behavior tests.

The third implementation commit covers transaction history and terminal responsive behavior,
including tablet landscape action-column alignment, mobile pagination spacing, filter/calendar dialog
presentation, terminal controls, operational panels, and the shared POS stylesheet.
