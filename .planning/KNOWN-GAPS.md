# Known Gaps & Carry-Forward Register

Durable, milestone-independent register of accepted-but-unclosed items. Survives milestone archival. Update status here as items are addressed; do not delete resolved items — mark them `RESOLVED` with the closing reference so the history stays auditable.

Last updated: 2026-07-15 (at v2.1 Legacy Data Migration milestone close).

---

## Blocking-before-production (must close before real production cutover)

### G-01 — Compliance mode not demoted on rejected/revoked fiscal review (FSC-01)
- **Severity:** blocking · **HTTP-reachable today** via `POST /compliance/review`.
- **What:** `buildReviewComplianceStateUseCase` (`apps/dgfy-api/.../complianceUseCases.js:274-329`) patches verification metadata but never demotes `compliance_mode_state.state` when a review outcome is `rejected`/`revoked`. `evaluateComplianceDecision()` branches only on `state` (never `verification_status`), and `complianceGate.js` never forwards `verification_status` into the decision context. Net effect: a `compliant_active` business whose fiscal paperwork is later revoked keeps `ALLOW` for Fiscal `POS_CHECKOUT` indefinitely.
- **Evidence:** independently confirmed by `08-REVIEW.md` (CR-01) and `08-VERIFICATION.md` (third pass).
- **Recommended fix:** a focused gap-closure plan analogous to 08-09/08-10 — have the review use case demote `state` on rejection/revocation, and/or have the gate consider `verification_status`.
- **Status:** OPEN. Not closed by any planned phase (no roadmap phase touches this path).

### G-02 — Compliance verification + state writes are non-transactional (CR-03)
- **Severity:** blocking-before-ship (narrow race window) · **Non-deterministic** (needs interruption exactly between two writes).
- **What:** `complianceUseCases.js:307-320` calls `recordVerification` then `upsertState` as two independent, non-transactional writes. A crash/race between them can leave a review recorded (e.g. `rejected`) without `compliance_mode_state.state` demoted, or vice versa — a tenant that should be fiscal-blocked could briefly still look compliant.
- **Evidence:** `08-VERIFICATION.md` fourth pass (CR-03); accepted non-blocking for Phase 8 UAT sign-off 2026-07-13.
- **Recommended fix:** add a single `recordVerificationAndState()` repository method wrapping both writes in one `sequelize.transaction()` with a row lock, mirroring `shiftRepository.js` (the CR-02/CR-03 shift/booking lock-race fix from 08-12).
- **Related file/todo:** `.planning/todos/completed/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md` (filed but the underlying fix is not confirmed landed).
- **Status:** OPEN (closely related to G-01 — worth fixing together).

---

## Defense-in-depth debt (non-blocking, close opportunistically)

### G-03 — `business_database_registry.business_id` has no unique constraint
- **Severity:** non-blocking (no exploitable production path confirmed by security audit).
- **What:** A duplicate-row bug was found and fixed at every production-reachable call site (`findOrCreateForBusiness()`), but the underlying schema gap remains. Also left unfixed in one test helper (`businessRoutes.test.js`).
- **Evidence:** Phase 4; tracked in `04-.../deferred-items.md`.
- **Recommended fix:** add the unique constraint before more registry write paths are added.
- **Status:** OPEN.

---

## v2.1 migration-fidelity carry-forward

### G-04 — `product_embedding` carry-over never exercised on real vectors
- **Severity:** informational (accepted at Phase 14 close under operator decision D-14-10-01, "empty is truthful").
- **What:** The dgfy-temp production-parity snapshot had zero `item_embeddings` rows across all 26 tenants, so the `item_embeddings → product_embeddings` carry-over path migrated 0 → 0. The mapper/apply/verify code is built and unit-tested, but the real-vector path has not run on real data.
- **Recommended action:** re-verify opportunistically the first time a tenant with populated `item_embeddings` is migrated (e.g. during the eventual production cutover).
- **Status:** OPEN by design.

### G-05 — EMB-01: embedding-model metadata tagging deferred
- **Severity:** deferred (v2.x).
- **What:** Embedding-model name/version/timestamp tagging on carried-over `product_embeddings` vectors. Doesn't block migration fidelity, but is cheap now and expensive to reconstruct once a second embedding-model generation exists.
- **Status:** DEFERRED (v2.x).

### G-06 — RPT-01: human-readable per-tenant migration summary report deferred
- **Severity:** deferred (v2.x). Add if support/audit workflows justify.
- **Status:** DEFERRED (v2.x).

---

## Cross-cutting note

- **Phase 7 (production cutover rehearsal)** stays paused. It will likely be revisited once this migration is proven end-to-end, and can reuse the disposable EC2 (`dgfy-temp`) rehearsal approach proven during v2.1. The real production migration must move Product/Availment data too, not just Accounts/Businesses/Tenancy — G-01/G-02 should be closed before that cutover.
- **Next milestone intent:** integrate the new `dgfy-api` as the live API into the frontend apps (dgfy-storefront/pos/business) once the migration branch merges. G-01/G-02 (fiscal compliance gating) are the most relevant of the above to surface early in that work, since checkout flows depend on the compliance gate.
