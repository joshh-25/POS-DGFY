---
status: reference
owner: engineering
last_reviewed: 2026-04-07
related_adr: 0007-dual-mode-pos-compliance-program.md
declaration_id: 2026-04-07-dual-mode-pos-hardening-phase-remediation
classification: regulatory
surfaces: pos,terminal,settings,payments,compliance
reason_codes_impacted: LEGACY_MODE_SELECTION_REQUIRED,NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED,TERMINAL_DEVICE_MISMATCH,VERIFICATION_REQUIRED,IMPACT_DECLARATION_REQUIRED
policy_version: 2026.04.07
verification_evidence: npm run check:compliance,npm run check:architecture,npm -C backend test -- compliancePolicyEngine,npm -C frontend test
rollback_note: Revert compliance module/UI/doc updates as a scoped set and run migration undo only if deployment policy permits.
---

# 2026-04-07 Dual-Mode POS Hardening Remediation

## Compliance Impact Classification
Regulatory

## Affected Surfaces
- Compliance lifecycle and verification enforcement (`backend/src/modules/compliance/**`)
- POS runtime contract and terminal gating (`backend/src/modules/pos/**`, `frontend/src/features/pos/**`)
- Settings compliance dashboard (`frontend/Pages/Settings.jsx`, `frontend/src/features/compliance/**`)
- Compliance-sensitive declaration guardrails (`scripts/check-compliance-impact.js`, `.husky/pre-commit`)
- Reference governance/docs (`docs/architecture/adr/0007-*`, `docs/compliance/*`)

## Compliance Preconditions
1. Legacy tenants must complete one-time mode selection before POS continues.
2. Compliance verification is authority-gated (tenant master admin or platform admin).
3. Compliant activation remains checklist-gated and fail-closed.
4. Terminal/peripheral checks evaluate verified and terminal-eligible devices only.
5. Feature work must be blocked when preflight/declaration policy is unmet.

## Verification Evidence
- `npm run check:compliance`
- `npm run check:architecture`
- `npm -C backend test --runInBand tests/compliancePolicyEngine.test.js tests/complianceUsecases.authorization.test.js`
- `npm -C frontend test --runInBand`
