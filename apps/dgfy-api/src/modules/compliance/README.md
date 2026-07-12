# compliance module

Scaffolded in Phase 8 Wave 3 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-06-PLAN.md`): the tenant-scoped compliance-mode state machine (FSC-01) and the single shared gate port `assertComplianceGate` (FSC-02) that Checkout, Shift-open, and receipt issuance will all call in Phase 9. This phase builds the state and the port; Phase 9 wires the port into its own call sites.

## D-05 — the most important decision in this phase

Legacy's `compliancePolicyEngine.js` forces a `compliant_active` business into Fiscal-only output (denies any non-fiscal request once activated). That is wrong for this architecture: a formal/BIR-registered business runs two app builds side by side — an "Omni" build (fiscal off, the default for every sale) and a "Fiscal" build (switched to only when a customer explicitly asks for an Official Receipt) — against the SAME backend. `compliant_active` must mean **"Fiscal is now available to choose,"** not **"Fiscal is now mandatory."**

`policy/policyEngine.js` ports `compliancePolicyEngine.js`'s `evaluateComplianceDecision` with exactly ONE deletion: the `compliant_active` branch's deny-on-non-fiscal block. Everything else — including the `non_compliant_active` (fiscal denied, non-fiscal allowed) and `compliant_pending` (fiscal requires setup, non-fiscal allowed) branches, which were already correct — ports unchanged. `complianceGate.test.js` is the regression guard proving `compliant_active + non_fiscal -> ALLOW` (the exact case legacy denies) alongside the fiscal/pending/non-compliant truth table, and asserts the ported source carries no denial path keyed on document context for `compliant_active`.

## Layout

- `policy/constants.js` — verbatim port of the 8 frozen enum objects from legacy's `complianceConstants.js` (D-02/D-03), plus `DOCUMENT_CONTEXTS`/`POS_OPERATIONS` hoisted from the engine file so every consumer shares one source of truth for the D-05 `requestedDocumentContext` vocabulary.
- `policy/policyPacks.js` — verbatim port of the versioned BIR/NPC/BSP policy-pack structure (D-03: full depth, not narrowed to BIR-only).
- `policy/policyEngine.js` — the ported `evaluateComplianceDecision` (D-05 deviation) plus its full checklist/receipt-contract/preflight support, unchanged from legacy except for the one deletion above. Pure functions only — no I/O, no model imports.
- `repositories/complianceModeStateRepository.js`, `entities/complianceEntity.js`, `usecases/complianceUseCases.js`, `usecases/complianceGate.js`, `controllers/complianceController.js`, `routes.js` — built in Task 2 (state machine persistence, manual review/transition path, and the `assertComplianceGate` port).

## Endpoints (Task 2, mounted under `/compliance` in 08-08)

- `GET /compliance/state` — read the tenant/branch compliance-mode state (membership required)
- `POST /compliance/evidence` — submit compliance evidence (staff/owner)
- `POST /compliance/review` — review and transition state (verifier actor type required — manual path, D-04)

## Prohibitions honored

- No `backend/` writes — `compliancePolicyEngine.js`/`policyPacks.js`/`complianceConstants.js` are read-only pattern-porting sources.
- No `DOCUMENT_CONTEXT_NOT_ALLOWED`-equivalent deny branch for `compliant_active` in `policy/policyEngine.js` (D-05).
- No automatic compliance-mode state transition logic (D-04 — manual review/transition only, automation explicitly deferred).
