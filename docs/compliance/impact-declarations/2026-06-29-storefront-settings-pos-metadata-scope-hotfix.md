---
status: reference
owner: engineering
last_reviewed: 2026-06-29
related_adr: docs/architecture/adr/0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-06-29-storefront-settings-pos-metadata-scope-hotfix
classification: major
surfaces: settings,storefront,pos-receipt-metadata
reason_codes_impacted: ALLOWED
policy_version: 2026.06.29
verification_evidence: cd backend && npm test -- --runInBand tests/settingsUsecases.applicationResult.test.js tests/settingsComplianceChangedKeys.integration.test.js,cd frontend && npm exec vitest run src/pages/__tests__/Settings.deepLinking.integration.test.jsx --pool=threads,npm run check:architecture,npm run check:compliance
rollback_note: Revert the Settings tab-scoped save payload filter, the narrow missing-row default for pos_fiscal_buyer_details_required false, and their regression tests; no receipt rendering, fiscal calculation, platform approval authority, payment, checkout, or POS software identity behavior is changed.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-29T15:45:00+08:00
preflight_request_ref: STOREFRONT-SETTINGS-POS-METADATA-SCOPE-HOTFIX-2026-06-29
---

# Storefront Settings POS Metadata Scope Hotfix

## Compliance Impact Classification

Major. This hotfix changes how the Settings page scopes bulk settings saves and touches POS receipt metadata change detection. The intended effect is to prevent Storefront-only saves from accidentally submitting POS receipt metadata fields into the platform admin approval workflow.

## Affected Surfaces

1. IMS Settings Storefront tab save payload.
2. IMS Settings POS Setup tab save payload.
3. Backend changed-setting detection for missing `pos_fiscal_buyer_details_required` rows.
4. POS receipt metadata pending-review creation guardrails.

## Compliance Preconditions

1. Storefront saves must not submit POS receipt metadata fields.
2. POS Setup saves may still submit POS receipt metadata fields for the existing platform approval workflow.
3. A missing `pos_fiscal_buyer_details_required` row plus incoming `false` must be treated only as the default/no-op case.
4. Other POS receipt metadata fields must not receive invented legal defaults.
5. Platform-controlled POS software identity keys remain blocked from tenant updates.
6. Receipt rendering, fiscal calculation, checkout, payment, and terminal session behavior remain unchanged.

## Verification Evidence

The commands listed in front matter must pass before deployment. Production verification should confirm a Storefront settings save updates a Storefront field without creating or modifying `pos_receipt_metadata_pending_changes`.
