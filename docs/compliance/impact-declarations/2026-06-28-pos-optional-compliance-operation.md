---
status: reference
owner: engineering
last_reviewed: 2026-06-28
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-28-pos-optional-compliance-operation
classification: regulatory
surfaces: pos,terminal,settings,compliance
reason_codes_impacted: ALLOWED,LEGACY_MODE_SELECTION_REQUIRED,NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,COMPLIANT_ACTIVATION_PENDING
policy_version: 2026.06.28
verification_evidence: npm run check:architecture,npm run lint:docs,npm run check:compliance,npm -C backend test -- --runTestsByPath tests/compliancePolicyEngine.test.js,npm -C frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/TerminalPageLayout.capabilityNotice.test.jsx,npm -C frontend run build:pos
rollback_note: Revert the compliance policy change, POS terminal UI removal, related tests, and ADR/API documentation as one unit; then rerun compliance, architecture, docs, backend, and POS frontend checks.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-28T15:48:00+08:00
preflight_request_ref: POS-OPTIONAL-COMPLIANCE-2026-06-28
---

# POS Optional Compliance Operation

## Compliance Impact Classification
Regulatory

The change narrows runtime compliance gating for POS terminal and checkout operation. POS may continue as non-compliant/non-fiscal when compliance mode choice or readiness is unavailable or incomplete. Fiscal/compliant-only output and payment capability enablement remain policy-gated.

## Affected Surfaces
- Compliance policy engine (`backend/src/modules/compliance/policy/compliancePolicyEngine.js`)
- POS terminal runtime UI (`frontend/src/features/pos/pages/TerminalPage.jsx`, `frontend/src/features/pos/components/TerminalPageLayout.jsx`)
- POS settings and setup surfaces (`frontend/Pages/Settings.jsx`)
- POS/compliance contract tests
- ADR/API documentation for dual-mode POS compliance

## Compliance Preconditions
1. POS operation must default to non-compliant/non-fiscal behavior when compliance mode is not selected.
2. Non-compliant tenants must still be blocked from fiscal document output.
3. Compliant-active fiscal controls remain enforced by the policy engine.
4. Payment capability enablement remains blocked when mode choice is unresolved.
5. Compliance settings remain available; only POS terminal blocking reminders are removed.

## Verification Evidence
- `npm run check:architecture`
- `npm run lint:docs`
- `npm run check:compliance`
- `npm -C backend test -- --runTestsByPath tests/compliancePolicyEngine.test.js`
- `npm -C frontend test -- --run src/features/pos/__tests__/terminalViewModeContracts.test.js src/features/pos/__tests__/TerminalPageLayout.capabilityNotice.test.jsx`
- `npm -C frontend run build:pos`

## Deferred Verification
- `tests/posSalesReconciliation.db.integration.test.js` includes the checkout integration assertion but cannot run in this local environment because the `sku_test` database is missing.
