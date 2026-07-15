# compliance module

Scaffolded in Phase 8 Wave 3 (`.planning/phases/08-commerce-foundation-product-catalog-booking-shift-cash-drawe/08-06-PLAN.md`): the tenant-scoped compliance-mode state machine (FSC-01) and the single shared gate port `assertComplianceGate` (FSC-02) that Checkout, Shift-open, and receipt issuance will all call in Phase 9. This phase builds the state and the port; Phase 9 wires the port into its own call sites.

## D-05 — the most important decision in this phase

Legacy's `compliancePolicyEngine.js` forces a `compliant_active` business into Fiscal-only output (denies any non-fiscal request once activated). That is wrong for this architecture: a formal/BIR-registered business runs two app builds side by side — an "Omni" build (fiscal off, the default for every sale) and a "Fiscal" build (switched to only when a customer explicitly asks for an Official Receipt) — against the SAME backend. `compliant_active` must mean **"Fiscal is now available to choose,"** not **"Fiscal is now mandatory."**

`policy/policyEngine.js` ports `compliancePolicyEngine.js`'s `evaluateComplianceDecision` with exactly ONE deletion: the `compliant_active` branch's deny-on-non-fiscal block. Everything else — including the `non_compliant_active` (fiscal denied, non-fiscal allowed) and `compliant_pending` (fiscal requires setup, non-fiscal allowed) branches, which were already correct — ports unchanged. `complianceGate.test.js` is the regression guard proving `compliant_active + non_fiscal -> ALLOW` (the exact case legacy denies) alongside the fiscal/pending/non-compliant truth table, and asserts the ported source carries no denial path keyed on document context for `compliant_active`.

## Layout

- `policy/constants.js` — verbatim port of the 8 frozen enum objects from legacy's `complianceConstants.js` (D-02/D-03), plus `DOCUMENT_CONTEXTS`/`POS_OPERATIONS` hoisted from the engine file so every consumer shares one source of truth for the D-05 `requestedDocumentContext` vocabulary.
- `policy/policyPacks.js` — verbatim port of the versioned BIR/NPC/BSP policy-pack structure (D-03: full depth, not narrowed to BIR-only).
- `policy/policyEngine.js` — the ported `evaluateComplianceDecision` (D-05 deviation) plus its full checklist/receipt-contract/preflight support, unchanged from legacy except for the one deletion above. Pure functions only — no I/O, no model imports.
- `repositories/complianceModeStateRepository.js` — tenant-scoped data access adapter (mirrors `shiftRepository.js`'s `TenantDatabaseUnavailableError`/`resolveDatabaseName`/`withModel` scaffold), exposing `getForBusinessBranch`/`upsertState`/`recordVerification`.
- `entities/complianceEntity.js` — `ComplianceEntity` with the `allowsFiscalChoice()` domain helper (D-05) and the stable public `toPlain()` response shape.
- `usecases/complianceUseCases.js` — `getComplianceState` (any member), `submitComplianceEvidence` (staff-or-owner), `reviewComplianceState` (D-04 manual review/transition path).
- `usecases/complianceGate.js` — `buildAssertComplianceGate({ repository })`, the FSC-02 hand-off contract. Loads the tenant's compliance_mode_state row, calls the ported `evaluateComplianceDecision`, and maps ALLOW -> return the decision / DENY -> throw a 403 / REQUIRES_SETUP -> throw a 409.
- `controllers/complianceController.js`, `routes.js` — transport-only controller + `createComplianceRoutes(useCases, { authenticateAccount })` route factory (mirrors `accounts/routes.js`).
- `index.js`'s `buildComplianceModule({ tenantConnector, businessDatabaseRegistryRepository, businessRepository })` returns `{ repository, useCases, assertComplianceGate }` — the bound gate function 08-08's composition root and Phase 9 will inject elsewhere (e.g. `buildShiftsModule({ assertComplianceGate })`).

## D-04 manual review — why "owner" gates `reviewComplianceState`

Legacy's `COMPLIANCE_VERIFIER_ACTOR_TYPE` distinguishes `tenant_master_admin` from `platform_admin`, but neither role exists yet in this system's Accounts/Businesses APIs (landlord `business_memberships` only has `owner`/`member`). `reviewComplianceState` therefore requires the caller to be an active business owner (the closest available authority in the current role model) AND to explicitly supply a valid `verifierActorType`, which is recorded verbatim on the row (`verified_by_actor_type`) exactly as legacy's enum intends. A future phase can tighten the access-control check alone without changing `verifierActorType`'s shape.

## Endpoints (mounted under `/compliance` in 08-08)

- `GET /compliance/state?businessId=...&branchId=...` — read the tenant/branch compliance-mode state (membership required)
- `POST /compliance/evidence` — submit compliance evidence, `{ businessId, branchId?, complianceProfile, activePolicyPackVersion? }` (staff-or-owner); always resets `verification_status` to `pending_review`
- `POST /compliance/review` — review and transition state, `{ businessId, branchId?, verifierActorType, verificationStatus, newState? }` (owner + valid `verifierActorType` required — manual path, D-04; `newState` is required and reviewer-chosen when `verificationStatus === 'verified'`, never computed automatically)

## Prohibitions honored

- No `backend/` writes — `compliancePolicyEngine.js`/`policyPacks.js`/`complianceConstants.js` are read-only pattern-porting sources.
- No `DOCUMENT_CONTEXT_NOT_ALLOWED`-equivalent deny branch for `compliant_active` in `policy/policyEngine.js` (D-05).
- No automatic compliance-mode state transition logic (D-04 — manual review/transition only, automation explicitly deferred); `reviewComplianceState` always requires an explicit human-supplied `newState` when verifying.
- `assertComplianceGate` is exposed but not called from any real call site this phase (Phase 9's scope, FSC-02).
