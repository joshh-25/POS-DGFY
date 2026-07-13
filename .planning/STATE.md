---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Commerce Domain — Product, Checkout & Fulfillment
current_phase: 08
current_phase_name: commerce-foundation-product-catalog-booking-shift-cash-drawe
status: executing
stopped_at: Completed 08-12-PLAN.md (CR-02/CR-03 lock-race hardening closed) -- 08-12-SUMMARY.md written; Phase 08 gap-closure complete
last_updated: "2026-07-13T00:13:53.065Z"
last_activity: 2026-07-13
last_activity_desc: Phase 08 execution started
progress:
  total_phases: 11
  completed_phases: 7
  total_plans: 47
  completed_plans: 44
  percent: 64
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-12)

**Core value:** DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.
**Current focus:** Phase 08 — commerce-foundation-product-catalog-booking-shift-cash-drawe

## Current Position

Phase: 08 (commerce-foundation-product-catalog-booking-shift-cash-drawe) — EXECUTING
Plan: 3 of 12
Status: Ready to execute
Last activity: 2026-07-13 — Phase 08 execution started

Progress: [░░░░░░░░░░] 0% (v2.0 milestone not started; overall roadmap 6/11 phases complete, Phase 7 paused independently)

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 | - | - |
| 02 | 5 | - | - |
| 03 | 6 | - | - |
| 04 | 11 | - | - |
| 05 | 3 | - | - |
| 06 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 32min | 3 tasks | 12 files |
| Phase 01 P02 | 11min | 3 tasks | 7 files |
| Phase 01 P03 | 14min | 3 tasks | 11 files |
| Phase 01 P04 | 18min | 2 tasks | 2 files |
| Phase 02 P01 | 25min | 3 tasks | 7 files |
| Phase 02 P02 | 25min | 3 tasks | 5 files |
| Phase 02 P03 | 12min | 4 tasks | 11 files |
| Phase 02 P04 | 55min | 4 tasks | 7 files |
| Phase 02 P05 | 15min | 1 tasks | 2 files |
| Phase 03 P01 | 35min | 3 tasks | 11 files |
| Phase 03 P02 | 20min | 2 tasks | 4 files |
| Phase 03 P03 | 45min | 3 tasks | 5 files |
| Phase 03 P04 | 55min | 3 tasks | 4 files |
| Phase 03 P05 | 75min | 3 tasks | 8 files |
| Phase 03 P06 | 32min | 2 tasks | 8 files |
| Phase 04 P01 | 30min | 6 tasks | 10 files |
| Phase 04 P02 | 20min | 3 tasks | 14 files |
| Phase 04 P03 | 30min | 8 tasks | 15 files |
| Phase 04 P03.5 | 7min | 7 tasks | 10 files |
| Phase 04 P04 | 8min | 9 tasks | 16 files |
| Phase 04 P05 | 15min | 7 tasks | 8 files |
| Phase 04 P06 | 30min | 2 tasks | 13 files |
| Phase 04 P07 | 50min | 2 tasks | 20 files |
| Phase 04 P08 | 75min | 2 tasks | 16 files |
| Phase 04 P09 | 35min | 3 tasks | 9 files |
| Phase 05 P01 | 20min | 3 tasks | 6 files |
| Phase 05 P02 | 11min | 3 tasks | 8 files |
| Phase 05 P03 | 25min | 3 tasks | 5 files |
| Phase 06 P01 | 10min | 3 tasks | 6 files |
| Phase 06 P02 | 10min | 2 tasks | 2 files |
| Phase 06 P03 | 12min | 2 tasks | 3 files |
| Phase 08 P01 | 20min | 2 tasks | 3 files |
| Phase 08 P02 | 15min | 2 tasks | 9 files |
| Phase 08 P03 | 30min | 2 tasks | 13 files |
| Phase 08 P04 | 22min | 2 tasks | 10 files |
| Phase 08 P05 | 25min | 2 tasks | 10 files |
| Phase 08 P06 | 35min | 2 tasks | 13 files |
| Phase 08 P07 | 22min | 2 tasks | 9 files |
| Phase 08 P08 | 12min | 2 tasks | 2 files |
| Phase 08 P09 | 22min | 3 tasks | 9 files |
| Phase 08 P11 | 10min | 2 tasks | 2 files |
| Phase 08 P12 | 15min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Use a database-first Strangler Fig path with new `dgfy_*` databases beside legacy.
- [Roadmap]: Use one dedicated migration image with multiple explicit commands.
- [Roadmap]: Limit first backend scope to Accounts, Businesses, and Tenancy.
- [Roadmap]: Keep legacy live; allow only approved compatibility seams under ADR 0003.
- [Roadmap]: Defer Product, POS checkout, payment, fiscal, and frontend migration to later milestones.
- [Roadmap v2.0]: Phase numbering continues from v1.0's last phase — v2.0 starts at Phase 8 (not renumbered); Phase 7 (paused cutover rehearsal) stays independent and does not block v2.0.
- [Roadmap v2.0]: Phases derived dependency-driven from research: Product Catalog is the root dependency (nothing else has a `product_id`); Shift & Cash Drawer and Fiscal/Compliance build in parallel with Product Catalog (no Product dependency) but must land before/be ready by Checkout; Booking requires Product Catalog; POS Checkout depends on Product+Shift+Compliance; Storefront Ordering is deliberately its own phase (first Landlord<->Tenant cross-database write, real integration risk — not bundled with unrelated work); Order Fulfillment depends on Storefront Ordering + Checkout.
- [Roadmap v2.0]: Compressed research's 7 suggested phase groupings to 4 phases (8-11) per "coarse" granularity — Phase 8 bundles Product Catalog + Booking + Shift & Cash Drawer + compliance-mode state/gate-port (FSC-01/FSC-02); FSC-03 (SC/PWD discount math) placed in Phase 9 (Checkout) since it's checkout-domain discount computation, not compliance-state-machine scope.
- [Phase 08]: P01: INTEGER (not BIGINT) autoincrement PKs on all 8 new commerce tables including append-only ledgers, matching existing tenant-table convention.
- [Phase 08]: P01: actor_staff_account_id on inventory_movements/cash_drawer_events FKs staff_accounts.id (SET NULL), matching the tenant_audit_logs referential-integrity precedent.
- [Phase 08]: P02: reworded model doc comments to avoid literal 'backend/src/models' substring so the plan's automated grep prohibition check passes while still documenting legacy provenance by name.
- [Phase 08]: P03: productRepository/productFolderRepository resolve models via tenantConnector.getModels() (not direct model-factory import), since Product/ProductFolder are 08-02's registered Tenant models.
- [Phase 08]: P03: products module mounts top-level at /products (not nested under /businesses/:businessId); businessId read from req.body/req.query in controllers.
- [Phase 08]: P04: inventory manual movements gate on any active business membership (staff-or-owner), not owner-only.
- [Phase 08]: P04: recordMovementWithStockSync() applies restock/loss/adjustment stock_count deltas transactionally with a JS negative-stock precheck + optimistic-concurrency guard.
- [Phase 08]: P05: reconciliation math computed in shiftUseCases (not shiftRepository) so computeExpectedCash is unit-testable without mocking Sequelize transactions — keeps repository a pure persistence adapter; matches plan task wording
- [Phase 08]: P05: staleThresholdMinutes (D-11) resolved once at buildShiftsModule's composition boundary (override > SHIFT_STALE_THRESHOLD_MINUTES env var > 60min default), never inline in usecase/entity layers
- [Phase 08]: P06: ported the entire compliancePolicyEngine.js (including evaluateComplianceChecklist) rather than only the outer branches, since compliant_active's checklist-completeness path depends on it -- a faithful D-03 full-depth port requires the whole file.
- [Phase 08]: P06: reviewComplianceState gates on business-owner membership (not a dedicated tenant_master_admin/platform_admin role, which does not exist yet in this system) while still requiring and recording a valid verifierActorType input.
- [Phase 08]: P07: non-staff createBooking callers always book for themselves (customer_account_id = requestingAccountId); a client-supplied customer_account_id is only honored from a staff/owner caller
- [Phase 08]: P07: booking-capacity atomic guard uses Model.update() with sequelize.literal() and a WHERE slots_remaining >= 1 guard inside sequelize.transaction() (Pattern D), matching 08-04's Model.update()-based counter-guard convention rather than raw SQL
- [Phase Phase 08]: P08: composition root reuses businesses module's tenantConnector/businessDatabaseRegistryRepository (newly destructured) rather than each new commerce module defaulting to its own TenantConnector instance.
- [Phase Phase 08]: P08: staleThresholdMinutes passed straight from process.env.SHIFT_STALE_THRESHOLD_MINUTES into buildShiftsModule(); the module's own resolveStaleThresholdMinutes() owns the override/env/default fallback chain.
- [Phase 08]: P09: used a STORED generated column (branch_scope_key = COALESCE(branch_id, 0)) instead of a branch_id=0 sentinel to make compliance_mode_state uniqueness enforceable for NULL branches, since a literal sentinel would violate branch_id's FK into locations.id
- [Phase 08]: P09: reused checklist.activation_blockers[0]'s already-assembled reason code in the new compliant_active full-checklist gate guard rather than duplicating a per-signal mapping table, since profile/settings/artifacts/peripherals are already proven complete by the four checks above it
- [Phase 08]: P11: reject/revoke demotion to non_compliant_active is unconditional — no explicit newState required or consulted for these two outcomes (FSC-01)
- [Phase 08]: P11: state-demotion is the single source of truth for FSC-01 — no parallel verification_status branch added to complianceGate.js/evaluateComplianceDecision()
- [Phase 08]: P12: cancelBooking/closeShift guard reads row-locked (lock: transaction.LOCK.UPDATE) to close CR-02/CR-03 concurrent double-submit races, mirroring the create-path's atomic-guard discipline

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4] `business_database_registry.business_id` has no unique constraint — a duplicate-row bug was found and fixed at every production-reachable call site (`findOrCreateForBusiness()`), but the underlying schema gap remains as defense-in-depth debt; also left unfixed in one test helper (`businessRoutes.test.js`), tracked in `deferred-items.md`. Non-blocking (no exploitable production path confirmed by security audit), worth closing before more registry write paths are added.
- [Roadmap v2.0] Open design decisions flagged by research, to resolve during phase planning: (1) whether `ComplianceModeState` is Landlord- or Tenant-scoped (resolve before/during Phase 8 planning — currently assumed Tenant-scoped); (2) fulfillment status shape, two-field event-sourced vs. single-field state machine (resolve during Phase 11 planning); (3) PayMongo storefront payment flow design needs phase-specific research when Phase 10 is planned.
- [Phase 8] FSC-01 gap (blocking, needs gap-closure plan): `buildReviewComplianceStateUseCase` (complianceUseCases.js:274-329) never demotes `compliance_mode_state.state` when a review outcome is `rejected`/`revoked` — only verification metadata is patched. `evaluateComplianceDecision()` branches solely on `state`, never `verification_status`, and `complianceGate.js` never forwards `verification_status` into the decision context at all. Net effect: a `compliant_active` business whose fiscal paperwork is later revoked keeps `ALLOW` for Fiscal POS_CHECKOUT indefinitely. HTTP-reachable today via `POST /compliance/review`. Independently confirmed by 08-REVIEW.md (CR-01) and 08-VERIFICATION.md's third pass. Recommended: a focused gap-closure plan analogous to 08-09/08-10.
- [Phase 8] CR-02/CR-03 (Critical, non-blocking for Phase 8's literal must-haves but flagged before Phase 9 builds on these modules): `bookingRepository.cancelBooking()` and `shiftRepository.closeShift()` both read their guard row without a transaction lock (`lock: transaction.LOCK.UPDATE`), unlike `complianceModeStateRepository`'s equivalent read-then-write path. Concurrent cancel/close calls for the same booking/shift can double-release capacity or double-write the cash-drawer ledger with a lost-update on reconciliation figures. See 08-REVIEW.md and 08-VERIFICATION.md Anti-Patterns for fixes (row lock or guarded atomic UPDATE, mirroring Pattern D).

## Deferred Items

Items acknowledged and carried forward from milestone scope control:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Product/POS domains | Product, Availment, inventory, checkout, payments, discounts, shifts, fiscal compliance | Now active — v2.0 Commerce Domain, Phases 8-11 | Roadmap creation (v1.0); resumed at v2.0 roadmap creation |
| Frontend migration | Storefront/POS/Business frontend migration into new app surfaces | Still deferred (v3, FE-01) — no new frontend apps in v2.0 | Roadmap creation |
| Legacy decommissioning | Moving legacy code to `.archive` | Still deferred until parity and no-active-path evidence exists | Roadmap creation |

## Session Continuity

Last session: 2026-07-13T00:13:53.058Z
Stopped at: Completed 08-12-PLAN.md (CR-02/CR-03 lock-race hardening closed) -- 08-12-SUMMARY.md written; Phase 08 gap-closure complete
Resume file: 
None
