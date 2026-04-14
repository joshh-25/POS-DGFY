---
status: reference
owner: engineering
last_reviewed: 2026-04-13
related_adr: 0008-tenant-workflow-mode-msme-simplification.md
declaration_id: 2026-04-13-msme-pos-readiness-remediation
classification: major
surfaces: pos,terminal,settings
reason_codes_impacted: POS_READINESS_INCOMPLETE,ALLOWED
policy_version: 2026.04.07
verification_evidence: npm --prefix backend test -- posUsecases.applicationResult.test.js,npm --prefix frontend test -- msmeItemPatch.contract.test.js,npm --prefix frontend run build:skupervisor,npm --prefix backend run check:architecture-guardrails,npm --prefix backend run check:controller-boundaries,npm run check:compliance
rollback_note: Revert POS-readiness gate + wizard-first POS setup changes together to preserve consistent override behavior across item/product/MSME flows.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-04-13T17:30:00+08:00
preflight_request_ref: MSME-POS-READINESS-REMEDIATION-2026-04-13
---

# 2026-04-13 MSME POS Readiness Remediation

## Compliance Impact Classification
Major

Computed classification rationale:
1. Change touches POS override behavior and terminal-facing readiness flows.
2. Compliance lifecycle state machine and fiscal document contracts remain unchanged.

## Affected Surfaces
- POS catalog override update contract (`pos_visible` enable-path gate).
- Inventory item/product wizard POS setup UX and readiness remediation flow.
- POS readiness checklist and terminal preview routing from wizard context.

## Compliance Preconditions
1. Compliance lifecycle (`non_compliant_active`, `compliant_pending`, `compliant_active`) remains independent from workflow mode.
2. Receipt and checkout compliance contracts remain unchanged.
3. Existing `pos_visible=true` items are not auto-mutated; gate applies to new enable attempts.

## Verification Evidence
1. `npm --prefix backend test -- posUsecases.applicationResult.test.js`
2. `npm --prefix frontend test -- msmeItemPatch.contract.test.js`
3. `npm --prefix frontend run build:skupervisor`
4. `npm --prefix backend run check:architecture-guardrails`
5. `npm --prefix backend run check:controller-boundaries`
6. `npm run check:compliance`

