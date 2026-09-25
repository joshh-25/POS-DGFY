---
status: reference
owner: engineering
last_reviewed: 2026-09-25
declaration_id: 2026-09-25-pos-items-catalog-responsive-ui
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.09.25
verification_evidence: npm run check:compliance,npx vitest run packages/web-core/src/features/pos/__tests__/categoryManagement.contract.test.js packages/web-core/src/features/pos/__tests__/itemsAddModal.contract.test.js packages/web-core/src/features/pos/__tests__/itemsButtonConsistency.contract.test.js packages/web-core/src/features/pos/__tests__/itemsPagination.contract.test.js packages/web-core/src/features/pos/__tests__/posTextSizeIntegration.contract.test.js packages/web-core/src/features/pos/__tests__/posTextSizeLayout.contract.test.js packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js,npm run build:pos
rollback_note: Revert the scoped POS Items/catalog commits together, then rerun the focused contract suite and POS production build before reattempting delivery.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-25T22:30:00+08:00
preflight_request_ref: POS-ITEMS-2026-09-25
---

# POS Items Catalog Responsive UI

## Compliance Impact Classification

Major. The change is limited to the POS Items/catalog workspace and its responsive terminal presentation. It does not change fiscal calculations, payment authorization, tenant permissions, audit retention, or backend compliance decisions.

## Affected Surfaces

- POS Items/catalog workspace: item cards, categories, Item Options, add/edit item flows, pagination, shared toolbar/button styling, and responsive layouts.
- POS terminal presentation infrastructure used by the Items workspace: tablet orientation handling, header text-size control, modal viewport behavior, and scroll-region behavior.

## Compliance Preconditions

- Existing POS authorization, tenant scoping, item persistence, and audit behavior remain unchanged.
- Catalog edits continue to use the existing POS/inventory service contracts and validation paths.
- Responsive and text-size changes remain presentation-only and must not hide required actions or alter saved item values.
- The Items workspace remains isolated from checkout/payment state and from non-POS IMS-only screens.

## Verification Evidence

- `git diff --check` passed for the staged Items scope.
- Focused POS Items/catalog contract suites passed: 7 files, 40 tests.
- `npm run build:pos` is required before finalizing the branch audit.
- The repository compliance guardrail is run by the pre-commit hook and this declaration is included with the sensitive POS commit.
- Shared catalog primitives (CSV import, image gallery, QR, wizard navigation, and storefront info) retain their existing non-POS defaults; the responsive additions are opt-in through POS-scoped props/classes.

## Residual Risk

- Full POS test execution is currently limited by repository-local dependency gaps (`jsdom`, React/shared packages) and unrelated stale contract expectations; those failures are documented in the branch change record and are not represented as passing evidence.
- Browser-level visual verification should still be performed against normal, large, and extra-large text-size settings and portrait/landscape tablet profiles before release.
- The POS bulk-image worker also remains fail-safe when Redis is unavailable: it idles and retries rather than polling the queue repository, with queued imports recoverable after Redis returns.
- The edit-image contract suite covers the current deferred gallery queue, local previews, multi-file selection, and modal shell rather than the retired drag/drop-only flow.
