---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Legacy Data Migration
current_phase: 13.5
status: completed
stopped_at: Phase 14 context gathered
last_updated: "2026-07-14T23:25:12.857Z"
last_activity: 2026-07-14
last_activity_desc: Phase 13.5 marked complete
progress:
  total_phases: 15
  completed_phases: 12
  total_plans: 82
  completed_plans: 78
  percent: 80
current_phase_name: Staff Authentication Model Correction
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.
**Current focus:** Phase 13.5 — Staff Authentication Model Correction

## Current Position

Phase: 13.5 — COMPLETE
Plan: 4 of 4
Status: Phase 13.5 complete
Last activity: 2026-07-14 — Phase 13.5 marked complete

Progress: [█████████░] 95%

## Performance Metrics

**Velocity:**

- Total plans completed: 48
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
| 10 | 8 | - | - |
| 11 | 4 | - | - |
| 12 | 4 | - | - |

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
| Phase 08 P13 | 20min | 2 tasks | 5 files |
| Phase 13 P01 | 8min | 3 tasks | 6 files |
| Phase 13 P03 | 4min | 2 tasks | 3 files |
| Phase 13.5 P01 | 5min | 2 tasks | 4 files |
| Phase 13.5 P02 | 4min | 3 tasks | 8 files |
| Phase 13.5 P03 | 22min | 2 tasks | 5 files |
| Phase 13.5 P04 | 45min | 2 tasks | 8 files |

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
- [Roadmap v2.1]: Phase numbering continues from v2.0's last phase — v2.1 starts at Phase 12 (not renumbered); Phase 7 (paused cutover rehearsal) and Phases 1-11 stay as historical record, untouched.
- [Roadmap v2.1]: Phases derived dependency-driven per research: Phase 12 (ADR 0029 amendment + additive schema extension) is a hard blocker for every mapper and lands first; Phase 13 (Product/Inventory) must land and be re-rehearsed before Phase 14 (Sales History) because `pos_transaction_lines` → `availment_items` has a real FK dependency on migrated products in `legacy_id_map`, not just an organizational preference.
- [Roadmap v2.1]: LDM-05 (`availments.source_system` additive column) mapped to Phase 14, not Phase 12, per the requirement's own text ("sequenced with the Sales History phase") despite being listed under the "Legacy Migration Scope & Schema Extension" category in REQUIREMENTS.md.
- [Roadmap v2.1]: VER-01/VER-02 mapped fully to Phase 14 rather than split across Phase 13 as research's draft phrased it ("scoped to this phase's entity types") — both requirements' own text names `availment`/`availment_item`, which only exist once Phase 14 lands, so assigning either to Phase 13 would claim completion before it's literally true. Phase 13 still carries its own product/inventory-side dry-run/apply/verify rehearsal success criteria without formally owning the VER-* REQ-IDs, preserving the "map to exactly one phase" rule.
- [Phase 13 Plan 01]: Legacy transfer stock movements emit LOSSY_CATEGORY_COLLAPSE findings and insert no inventory_movements row per D-08.
- [Phase 13 Plan 01]: Legacy item categories map unconditionally to products.category='retail' per D-09.
- [Phase 13 Plan 03]: Product apply uses legacy_id_map as the idempotency guard for products because products.id is auto-increment and sku_code is non-unique.
- [Phase 13 Plan 03]: BOM composition is resolved in apply pass 2 with JSON bound through Sequelize replacements.
- [Roadmap v2.1 INSERTED]: Phase 13.5 is required before Phase 14. ADR 0028's DGFY-only staff access model conflicts with the intended product model. Tenant-local staff credentials must remain supported; DGFY account linking is optional for staff, not mandatory.
- [Phase 13.5]: [Phase 13.5 Plan 01]: Staff authentication is tenant-local-first; DGFY account linking is optional and requires accepted-membership evidence.
- [Phase 13.5]: [Phase 13.5 Plan 01]: Staff credentials live in same-tenant staff_credentials, separate from staff_accounts profile serialization.
- [Phase 13.5]: [Phase 13.5 Plan 02]: staff_credentials is a separate same-tenant table, not columns on staff_accounts.
- [Phase 13.5]: [Phase 13.5 Plan 02]: dgfy-api adds a persistence-only StaffCredential model but no credential write/read endpoint in this plan.
- [Phase 13.5]: [Phase 13.5 Plan 03]: Real bcrypt staff password/PIN values migrate byte-for-byte into staff_credentials; placeholder or non-bcrypt password values become reset_required with value-free reinvite findings.
- [Phase 13.5]: [Phase 13.5 Plan 03]: staff_credentials apply idempotency uses natural-key lookup on staff_account_id after parent staff_account id resolution.
- [Phase 13.5]: [Phase 13.5 Plan 04]: Dry-run reports redact credential-bearing payload fields into boolean evidence flags.
- [Phase 13.5]: [Phase 13.5 Plan 04]: staff_auth verification keeps staff-linkage findings visible but non-blocking for product/inventory data_migration_ok; corrupt existing assignment rows still block.

### Pending Todos

- Wrap compliance verification and state writes in one transaction (`.planning/todos/pending/2026-07-13-wrap-compliance-verification-and-state-writes-in-one-transac.md`) — required before milestone ships, not closed by any planned future phase.

### Blockers/Concerns

- [Phase 4] `business_database_registry.business_id` has no unique constraint — a duplicate-row bug was found and fixed at every production-reachable call site (`findOrCreateForBusiness()`), but the underlying schema gap remains as defense-in-depth debt; also left unfixed in one test helper (`businessRoutes.test.js`), tracked in `deferred-items.md`. Non-blocking (no exploitable production path confirmed by security audit), worth closing before more registry write paths are added.
- [Roadmap v2.0] Open design decisions flagged by research, to resolve during phase planning: (1) whether `ComplianceModeState` is Landlord- or Tenant-scoped (resolve before/during Phase 8 planning — currently assumed Tenant-scoped); (2) fulfillment status shape, two-field event-sourced vs. single-field state machine (resolve during Phase 11 planning); (3) PayMongo storefront payment flow design needs phase-specific research when Phase 10 is planned.
- [Phase 8] FSC-01 gap (blocking, needs gap-closure plan): `buildReviewComplianceStateUseCase` (complianceUseCases.js:274-329) never demotes `compliance_mode_state.state` when a review outcome is `rejected`/`revoked` — only verification metadata is patched. `evaluateComplianceDecision()` branches solely on `state`, never `verification_status`, and `complianceGate.js` never forwards `verification_status` into the decision context at all. Net effect: a `compliant_active` business whose fiscal paperwork is later revoked keeps `ALLOW` for Fiscal POS_CHECKOUT indefinitely. HTTP-reachable today via `POST /compliance/review`. Independently confirmed by 08-REVIEW.md (CR-01) and 08-VERIFICATION.md's third pass. Recommended: a focused gap-closure plan analogous to 08-09/08-10.
- ~~[Phase 8] CR-02/CR-03 row-lock race~~ — RESOLVED by P12 (row-locked reads via `lock: transaction.LOCK.UPDATE`) and live-confirmed 2026-07-13 via 08-UAT.md Test 3: concurrent `cancelBooking()`/`closeShift()` calls against lima-dgfy-dev showed exactly one success + one clean rejection each, no double capacity release, no duplicate close event.
- [Roadmap v2.1] Open design decisions flagged by research, to resolve during Phase 13 planning (per SUMMARY.md's explicit recommendation for a discuss-phase/spec pass before mapper code): (1) multi-location stock/transfer target design — no non-lossy target exists in the new schema (`products.stock_count` is a single scalar, no location dimension, no `transfer` movement type); (2) `product_composition`/BOM in/out-of-scope decision — currently undecided; (3) `item_location_stocks` mapping target — informs whether it becomes an opening-balance `inventory_movements` row (current LDM/PIM wording) or something else; (4) `product_embeddings` cardinality (one row per product vs. per product-per-model-version) affects the recommended unique constraint shape.
- [Roadmap v2.1] Open design decisions flagged by research, to resolve during Phase 14 planning: (1) whether `pos_transaction_lines` → `availment_items` is definitively in scope (REQUIREMENTS.md's SHM-02 says yes, confirming this — but the per-field FK classification for `pos_transactions`' ~15 FK-shaped fields, e.g. `shift_id`/`terminal_id`/`fnb_check_id`/`fnb_table_id`, still needs an explicit resolvable/nulled-with-finding/opaque-snapshot decision per field); (2) watermark/checkpoint extension design for a live, continuously-growing source table — no existing precedent in this codebase (Phase 3's checkpoint pattern was only proven against small, static tables).
- [Phase 12 Plan 04] Tenant DB blocked: migration-runner .env DB user 'sieitzsqladmin' rejected by lima-dgfy-dev MySQL (only sku_inventory_user provisioned) and DGFY_BUSINESS_DB_NAMES not configured -- schema migrate/verify cannot prove success criteria #2-#4 until operator fixes credentials/target config. See 12-04-SUMMARY.md.
- ~~[Phase 13 Plan 06 / Phase 13.5] Blocking architecture correction: current `dgfy_business_*.staff_accounts` has no credential target and ADR 0028 says invited staff must use DGFY accounts.~~ RESOLVED by Phase 13.5 Plans 01-04: ADR/docs/schema/API assumptions/mapper/apply/reporting/verify now support tenant-local staff credentials with optional DGFY account linking. Phase 14 owns the live re-verify/re-rehearsal.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Product/POS domains | Product, Availment, inventory, checkout, payments, discounts, shifts, fiscal compliance | Now active — v2.0 Commerce Domain, Phases 8-11 | Roadmap creation (v1.0); resumed at v2.0 roadmap creation |
| Frontend migration | Storefront/POS/Business frontend migration into new app surfaces | Still deferred (v3, FE-01) — no new frontend apps in v2.0 or v2.1 | Roadmap creation |
| Legacy decommissioning | Moving legacy code to `.archive` | Still deferred until parity and no-active-path evidence exists | Roadmap creation |
| Migration reporting/embeddings polish | Human-readable per-tenant migration summary report (RPT-01); embedding-model metadata tagging (EMB-01) | Still deferred (v2.x) — not required for v2.1 fidelity goal, add if support/audit workflows justify | v2.1 requirements definition |

## Session Continuity

Last session: 2026-07-14T23:25:12.806Z
Stopped at: Phase 14 context gathered
Resume file: .planning/phases/14-sales-history-migration-full-verification/14-CONTEXT.md
