---
status: reference
owner: engineering
last_reviewed: 2026-07-26
related_adr: docs/architecture/adr/0037-unified-product-domain-and-capability-driven-store-types.md
declaration_id: 2026-07-26-unified-product-domain-phases-0-4
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED
policy_version: 2026.07.26
verification_evidence: backend jest --runInBand targeted sweep across every file touched by this PR (posRepository.js, posUseCases.js, registerCompanyRequestUseCase.js, and their existing test suites — 186 passed, 13 pre-existing failures confirmed unchanged via git-stash A/B comparison against the pre-PR baseline),frontend vitest run Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/modePresentationRegistry.test.js (24 passed),npm run check:architecture,npm run lint:docs,npm run build:all (skupervisor+pos+store all succeed)
rollback_note: Revert this PR's diff. posRepository.js's BASE_POS_ITEM_ATTRIBUTES change only adds 3 read-only attribute names to an existing SELECT list (mode_item_preset, min_threshold, fifo_enabled) — reverting removes them with no schema impact. posUseCases.js's cost_snapshot fix is a one-line conditional change (isStockExemptLine to isServiceItem) with no new code path — reverting restores the prior (buggy but not security-relevant) always-null-for-exempt-lines behavior. registerCompanyRequestUseCase.js's industryTag is purely additive (new optional input, stored in the existing Tenant.settings JSON column, echoed back in the response) — reverting drops the field with no effect on any other registration behavior, since workflowMode/legal-acknowledgement/subscription verification logic is untouched. PosTenantSetupModal.jsx's change swaps a local preset-filtering constant for the equivalent shared helper introduced in this same PR — reverting is a no-op for behavior.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-26T06:15:00Z
preflight_request_ref: PR-101
---

# Unified Product Domain — Phases 0-4

## Compliance Impact Classification

Regulatory, per the `settings`/`compliance` surface floor triggered by
`backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js` being one of the
compliance-sensitive files this PR touches. The PR as a whole implements Phases 0-4 of the unified
product domain design (ADR 0037): documentation, foundational constants/taxonomy de-duplication,
a retail item-taxonomy correction, stock-bearing report/COGS bug fixes, and an onboarding change
that separates "business industry" (a free-text, purely descriptive field) from `workflowMode`
(the engineering operating mode). None of this touches fiscal document classification, tax
computation, receipt numbering, payment-provider settlement, terminal identity/authorization, or
compliance-mode activation/downgrade decisions — the four compliance-sensitive files this PR
changes are each touched narrowly and additively (see Affected Surfaces), and the registration
use case's legal-acknowledgement, subscription-verification, and DGFY-account-authorization logic
is unmodified line-for-line.

## Affected Surfaces

- `backend/src/modules/pos/repositories/posRepository.js` (`pos`, `terminal`): adds
  `mode_item_preset`, `min_threshold`, and `fifo_enabled` to the existing `BASE_POS_ITEM_ATTRIBUTES`
  read-only attribute list used by POS catalog queries. This is a pure attribute-list addition (more
  columns selected, same rows, same query shape) — it fixes a pre-existing bug where
  `mode_item_preset === 'service'`-based stock-exemption checks could never fire on this catalog path
  because the column was silently missing from the SELECT. No write path, permission check, or
  pricing/tax computation is touched.
- `backend/src/modules/pos/usecases/posUseCases.js` (`pos`, `terminal`): checkout's `cost_snapshot`
  assignment for a stock-exempt line now checks `isServiceItem` instead of the broader
  `isStockExemptLine` (which also covered `pos_always_available` physical items). This only changes
  which lines get a null vs. real `cost_snapshot` for internal COGS accounting — it does not change
  `sale_price`, `stock_effect_type`, tax computation, or any customer-facing checkout total. Fiscal
  print/receipt fields are unaffected.
- `backend/src/modules/tenants/usecases/registerCompanyRequestUseCase.js` (`settings`, `compliance`):
  adds one new optional input, `industryTag`, normalized to a trimmed string capped at 120 chars and
  stored in the existing `Tenant.settings` JSON column alongside (not replacing) `workflow_mode`, then
  echoed back in both success response payloads. No change to the required-field validation, the
  `workflowMode` validation/normalization, the legal-acknowledgement flow
  (`assertDgfyLegalAcknowledgement` / `recordLegalAcknowledgement`), subscription/PayPal verification,
  auto-approval-mode resolution, or `compliance_mode_state`/`compliance_policy_version` assignment —
  every line of that logic is byte-identical to the pre-PR version.
- `frontend/src/features/pos/components/PosTenantSetupModal.jsx` (`pos`, `terminal`): replaces a
  locally-duplicated `ONBOARDING_CUSTOMER_FACING_PRESETS` constant and its inline filter with a call to
  the shared `filterCustomerFacingPresets` helper introduced in this same PR (`packages/shared-constants`
  re-exported through `frontend/src/features/settings/modeItemTaxonomy.js`). The preset key lists are
  identical to what this file already had for `food_manufacturing`/`msme`/`services`/`fnb`, plus the new
  shared helper additionally covers `retail`; no permission, terminal-setup-flow, or identity logic in
  this component is touched.
- Also relevant to the `settings`/`compliance` surface even though it isn't in the compliance-sensitive
  file list: `frontend/Pages/RegisterCompany.jsx` relabels the `workflowMode` select from "Business
  Industry" to "Operating Mode" (with a clarifying caption) and adds the new, separate, optional
  "Industry" text input that supplies `industryTag`. This is the field the prior
  `2026-06-03-dgfy-business-registration-session-handoff.md` declaration described as collecting
  "company name plus Business Industry" — that description is now more accurate as "company name,
  operating mode, and an optional free-text industry tag." The legal-acknowledgement checkbox, terms
  versions submitted, and DGFY-account-derived admin fields are unchanged.

## Compliance Preconditions

1. `industryTag` must remain purely descriptive: it is never read by `normalizeWorkflowMode`,
   `isWorkflowMode`, any `requireWorkflowCapability` check, or any RBAC/taxonomy/stock-bearing
   resolution added or touched elsewhere in this PR — it only round-trips through
   `Tenant.settings.industry_tag` and the registration response.
2. Company registration must continue requiring a signed-in active DGFY account, a valid phone
   number, and current company/marketplace terms acknowledgement before a tenant record is created —
   unchanged in this PR.
3. The `cost_snapshot` change must not alter which lines are stock-exempt for movement purposes
   (`stock_effect_type`, `stock_exempt_reason`, and the stock-movement-skip check at checkout are all
   untouched) — only the COGS bookkeeping value attached to an already-movement-exempt line.
4. The new POS catalog attributes (`mode_item_preset`, `min_threshold`, `fifo_enabled`) must remain
   read-only additions to an existing SELECT — no new write path reads or trusts client-supplied values
   for these fields as part of this change.

## Verification Evidence

1. Backend: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand` across every test file for a service/use case touched by this PR, including
   `tests/registerCompanyRequestUseCase.autoApproval.test.js`, `tests/posCheckoutFnbContracts.usecase.test.js`,
   `tests/posUsecases.applicationResult.test.js`, `tests/costValuationService.test.js`,
   `tests/inventoryItemRepository.test.js`, `tests/workflowModes.crossLayer.contract.test.js`,
   `tests/modeItemTaxonomy.contract.test.js`, `tests/stockBearingPolicy.test.js`,
   `tests/posRepository.locationStockFallback.test.js`, `tests/storeRepository.locationStockFallback.test.js`,
   `tests/storeFnbModifiers.usecases.test.js`, `tests/modeRolePresets.test.js`, and the AI-tool-registry/
   alerts/analytics/forecast/dashboard/storage use-case suites: 186 passed, 13 failed. All 13 failures were
   confirmed pre-existing and unrelated to this PR via `git stash` A/B comparison (same failures reproduce
   on the pre-PR baseline with this PR's changes stashed out).
2. Frontend: `npx vitest run Pages/__tests__/RegisterCompanyLoginHandoff.test.jsx apps/store/src/__tests__/modePresentationRegistry.test.js` — 24/24 passed, including the updated "Operating Mode" label
   assertion and the exact registration-POST-body assertion now including `industryTag: ''`.
3. `npm run check:architecture` — `[ArchitectureGuardrails] OK. Checked 37 modules and 361 code files.` /
   `[ControllerBoundary] OK. Checked 75 controller files with no unauthorized model imports.`
4. `npm run lint:docs` — `[docs-lint] OK. Validated 21 governed docs.`
5. `npm run build:all` — `build:skupervisor`, `build:pos`, and `build:store` all complete successfully.
