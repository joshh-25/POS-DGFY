---
status: reference
owner: engineering
last_reviewed: 2026-04-13
related_adr: 0008-tenant-workflow-mode-msme-simplification.md
declaration_id: 2026-04-13-msme-sari-sari-simplification-v1-1
classification: major
surfaces: settings,pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.04.07
verification_evidence: npm -C backend test -- tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js,npm -C frontend test -- --run src/features/inventory/__tests__/msmeItemPatch.contract.test.js,npm run check:architecture
rollback_note: Revert MSME v1.1 inventory/supplier sync and workflow-aware purchasable changes together, then rerun inventory and POS regression suites.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-13T13:10:00+08:00
preflight_request_ref: MSME-V1-1-PR-2026-04-13
---

# 2026-04-13 MSME Sari-Sari Simplification v1.1

## Compliance Impact Classification
Major

Computed classification rationale:
1. Change is cross-boundary across settings, inventory, and POS-adjacent workflows.
2. Compliance lifecycle and receipt contracts are unchanged; workflow simplification is non-destructive.

## Affected Surfaces
- Settings-governed workflow mode behavior (`ops_workflow_mode`) as runtime source of truth.
- MSME item create/edit and MSME supplier attachment workflow.
- MSME supplier coverage and PO selection eligibility behavior.

## Compliance Preconditions
1. Workflow mode remains independent from compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`).
2. Existing compliance policy engine, receipt contract, and POS compliance gates remain unchanged.
3. Mode toggling remains reversible with no destructive data migration.

## Verification Evidence
1. `npm -C backend test -- tests/itemHandlers.transport.test.js tests/inventoryItemRepository.test.js`
2. `npm -C frontend test -- --run src/features/inventory/__tests__/msmeItemPatch.contract.test.js`
3. `npm run check:architecture`
