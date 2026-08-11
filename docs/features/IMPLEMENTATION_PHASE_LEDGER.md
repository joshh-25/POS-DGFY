---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-10
review_by: 2027-02-09
applies_to: governed_multi_phase_initiatives
topic: implementation_phase_ledger
---

# Implementation Phase Ledger

This is the repository source of truth for continuous implementation phase numbering. Releases and initiatives group phases but never reset the sequence. Historical Phase 0 is retained because it predates the continuous-numbering rule; no future initiative may create another Phase 0.

## Phase Register

| Phase | Initiative / release | Objective and scope | Status | Dependencies | Completion / evidence |
| --- | --- | --- | --- | --- | --- |
| 0 | POS Services / Release 1 | Freeze service taxonomy, ownership, permissions, API, online-only, and rollout contracts. | `completed` | None | 2026-08-09; `POS_SERVICES_TEMPLATE_PHASE0_CONTRACT.md` sections 1-13 |
| 1 | POS Services / Release 1 | Correct backend Services preset, price, permission, rollback, and invalidation contracts. | `completed` | Phase 0 | 2026-08-09; contract section 14 and focused backend tests |
| 2 | POS Services / Release 1 | Extract shared catalog form, mapper, and Services API client. | `completed` | Phase 1 | 2026-08-09; contract section 15 and frontend contract tests |
| 3 | POS Services / Release 1 | Add governed POS service creation while preserving physical-item creation. | `completed` | Phase 2 | 2026-08-09; contract section 16 and POS tests/builds |
| 4 | POS Services / Release 1 | Route POS service edits through the shared Services contract. | `completed` | Phase 3 | 2026-08-09; contract section 17 and POS tests/builds |
| 5 | POS Services / Release 1 | Complete service fields, presentation, options, and assignment parity. | `completed` | Phase 4 | 2026-08-09; contract section 18 and POS/SKUpervisor validation |
| 6 | POS Services / Release 2 | Reuse the SKUpervisor Services operational template inside standalone POS, including Today, Calendar, Team and Resources, Waitlist, Reminders, and Clients. | `completed` | Phase 5 | 2026-08-09; focused tests, POS build, governance gates, and rendered POS smoke proof |
| 7 | POS Services / Release 2 | Add a permission-aware POS Services workspace shell. | `completed` | Phase 6 | 2026-08-09; dedicated POS navigation, read-only controls, focused tests/build, and rendered POS smoke proof |
| 8 | POS Services / Release 2 | Deliver Today and Calendar booking operations in POS. | `completed` | Phase 7 | 2026-08-09; lifecycle controls, chronological calendar filters, recovery UI, focused tests/build, and desktop/mobile POS proof |
| 9 | POS Services / Release 2 | Deliver Team, Resources, and assignments in POS. | `completed` | Phase 7 | 2026-08-09; resource/assignment forms, governed deactivation fix, permission states, focused tests/build, and desktop/mobile POS proof |
| 10 | POS Services / Release 2 | Deliver Waitlist and Clients in POS. | `completed` | Phase 8 | 2026-08-09; validated waitlist intake/status workflow, client discovery, focused tests/build, and repeated desktop/mobile POS proof |
| 11 | POS Services / Release 2 | Deliver reminder operations and outcomes in POS. | `completed` | Phase 8 | 2026-08-09; governed queue window, authoritative delivery outcomes, focused tests/build, and repeated desktop/mobile POS proof |
| 12 | POS Services / Release 2 | Integrate booking settlement with POS authorization, terminal, location, payment, receipt, and shift rules. | `completed` | Phase 8; settlement discovery gate | 2026-08-09; shift-owned atomic settlement, server-owned cash change, receipt identity, focused backend/frontend tests, and repeated POS proof |
| 13 | POS Services / Release 2 | Complete responsive, permission, lifecycle, settlement, regression, documentation, and parity hardening. | `completed` | Phases 9-12 | 2026-08-09; 85 backend tests, 106 frontend tests, dual builds, governance gates, and 5-run desktop/mobile/tablet POS proof |
| 14 | Adds F&B Specific / Release 1 | Freeze F&B modifier terminology, ownership, selection, pricing, availability, inventory, snapshot, permission, and rollout contracts. | `completed` | Phase 13 | 2026-08-09; `FNB_SPECIFIC_ADD_ONS.md` and ADR 0019 amendment |
| 15 | Adds F&B Specific / Release 1 | Add backward-compatible database and API support for channel/location availability, pricing, snapshots, and linked inventory. | `completed` | Phase 14 | 2026-08-09; additive migration, models, authoritative POS/Storefront validation, snapshots, and focused tests |
| 16 | Adds F&B Specific / Release 1 | Complete permission-aware F&B modifier group, option, pricing, availability, and assignment management. | `completed` | Phase 15 | 2026-08-09; guarded update API, structured manager, location/channel controls, assignments, focused tests, and production build |
| 17 | Adds F&B Specific / Release 1 | Add the authoritative modifier picker to standalone POS checkout. | `completed` | Phases 15-16 | 2026-08-09; cart-line picker, required validation, dynamic totals, focused tests, production build, and runtime diagnostics |
| 18 | Adds F&B Specific / Release 1 | Harden Storefront modifier selection, pricing, required-state, and stale-availability recovery. | `completed` | Phases 15-16 | 2026-08-09; Storefront modifier flow, server pricing, stale-state recovery, responsive coverage, and browser evidence |
| 19 | Adds F&B Specific / Release 1 | Integrate modifier snapshots with kitchen, receipts, inventory, refunds, and reporting. | `completed` | Phases 17-18 | 2026-08-09; immutable snapshots, kitchen/receipt propagation, linked inventory, void/refund behavior, and regression coverage |
| 20 | Adds F&B Specific / Release 2 | Add governed advanced quantities, combo choices, and one-level conditional modifier behavior. | `completed` | Phase 19 | 2026-08-09; implementation, tenant-schema repair, rollback contract, browser evidence, and F&B readiness gate passed |
| 21 | Adds F&B Specific / Release 2 | Complete RBAC, accessibility, responsive, concurrency, migration, rollback, regression, and browser hardening. | `completed` | Phase 20 | 2026-08-09; permission-aware management UI, keyboard/mobile browser evidence, focused regression suites, production builds, and 13-step readiness gate passed |
| 22 | Adds F&B Specific / Release 2 | Correct the application boundary by locating F&B modifier creation and item assignment in standalone POS while restoring SKUpervisor. | `completed` | Phase 21 | 2026-08-09; SKUpervisor restoration, POS Menu modifiers workspace, permission gating, 23 focused frontend tests, dual builds, and signed-in desktop/mobile POS evidence |
| 23 | Adds F&B Specific / Release 2 | Close advanced modifier integrity gaps across Storefront transport, server-owned F&B check snapshots, conditional topology, active-option limits, linked stock preflight, and migration error handling. | `completed` | Phase 22 | 2026-08-10; 78 focused backend tests, 5 frontend contract tests, 13-step F&B readiness gate, architecture/docs gates, and POS/Storefront production builds |
| 24 | Adds F&B Specific / Release 2 | Restore blocking CI quality gates and extend the canonical F&B readiness gate to cover Phase 23 migration, validator, frontend, open-handle, index, and repository-quality contracts. | `completed` | Phase 23 | 2026-08-10; blocking PR quality workflow added, readiness gate expanded, local focused validation and governance checks passed |
| 25 | Adds F&B Specific / Release 2 | Make deterministic Storefront browser/runtime coverage a blocking release gate for conditional modifier activation, quantity pricing, accessibility, responsive layout, and crash diagnostics. | `completed` | Phase 24 | 2026-08-10; isolated Playwright Storefront contract passed, blocking CI browser job wired, readiness/docs/governance validation passed |
| 26 | Adds F&B Specific / Release 2 | Remove the three POS prop-to-draft synchronization exceptions by introducing explicit modifier-picker, modifier-manager, and service-options edit-session boundaries. | `completed` | Phase 25 | 2026-08-10; effect exceptions removed, session-isolation regressions passed, POS/Storefront builds and readiness/governance validation passed |
| 27 | Adds F&B Specific / Release 2 | Add folder-scoped F&B modifier inheritance with item-level override and exclusion so POS and Storefront share one effective add-on assignment. | `completed` | Phase 26 | 2026-08-10; 75 focused backend tests, 18 focused frontend tests, 20-step F&B readiness gate, migration/schema coverage, lint, builds, architecture, docs, and whitespace validation |

## Phase 6 Acceptance Gates

- [x] Continuous phase ledger created without renumbering historical work.
- [x] Shared operational presentation components exist for bookings, resources/assignments, waitlist, reminders, and clients.
- [x] Booking creation and settlement methods use the existing Services API endpoints.
- [x] Standalone POS exposes the shared Services operations workspace from its Items area for Services-mode tenants.
- [x] Focused frontend tests pass (3 files, 8 tests).
- [x] SKUpervisor and POS builds pass.
- [x] Architecture and documentation checks pass.
- [x] Rendered standalone POS smoke proof passes without runtime errors and confirms Today, Calendar, Team and Resources, Waitlist, Reminders, and Clients.
- [x] Phase 6 completion record and next eligible phase are documented.

## Governing Sources

- `AGENTS.md` — Continuous Phase Numbering
- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- ADR 0016, ADR 0020, ADR 0029, and ADR 0031
- `docs/features/SERVICES_MODE.md`
- `docs/features/POS_SERVICES_TEMPLATE_PHASE0_CONTRACT.md`

Architecture classification for Phase 6 is `within-existing-boundary`. It introduces no database migration, backend behavior change, ADR change, compatibility seam, or architecture allowlist entry.

## Phase 6 Progress Record (2026-08-09)

- Shared booking, Team and Resources, waitlist, reminders, and clients presentation components were extracted into `ServiceOperationsPanels.jsx`.
- SKUpervisor now consumes the shared booking table; no POS operational route or navigation was enabled.
- The shared Services API client now exposes booking creation and settlement methods backed by the existing governed endpoints.
- Focused Vitest and ESLint checks pass.
- SKUpervisor and POS production builds pass.
- Architecture guardrails, controller boundaries, documentation lint, and ADR lint pass.
- Standalone POS now exposes a `Service operations` tab under Items for Services-mode tenants. The workspace reuses the governed Services APIs and shared panels for Today, Calendar, Team and Resources, Waitlist, Reminders, and Clients.
- POS permission fallbacks mirror the existing backend Services route contract, and the entire operational workspace is online-only.
- Playwright proof targeted port 5174 and passed the complete POS navigation and tab-visibility flow. No SKUpervisor login is required.

Phase 6 completion unlocked Phase 7, whose completion record follows.

## Phase 7 Acceptance Gates

- [x] Services-mode tenants receive a dedicated `Services` entry in the standalone POS sidebar.
- [x] Navigation routes directly to the POS Services workspace without SKUpervisor login or handoff.
- [x] The entry is online-only, permission-aware, and available without an active shift.
- [x] Operators without Services view permission cannot enter or restore the Services view.
- [x] Booking, resource, assignment, waitlist, and reminder mutations are visibly disabled for view-only operators.
- [x] Existing POS settlement, receipt, checkout, and shift-ownership rules remain unchanged.
- [x] Focused Vitest contracts, the POS production build, and rendered Playwright navigation proof pass.
- [x] Architecture and documentation gates pass.

## Phase 7 Progress Record (2026-08-09)

- Added a dedicated Services-mode sidebar entry and direct operations-workspace view in standalone POS.
- Applied the existing Services view permissions to navigation and tab visibility, with separate manage permissions controlling mutations.
- Marked Services as online-only and shift-exempt because browsing and scheduling operations do not own POS payment settlement.
- Hardened shared operational controls so read-only operators cannot change booking status, resources, assignments, waitlist state, or reminder processing.
- Playwright proof targeted port 5174 and confirmed the direct Services navigation plus all six operational tabs without runtime errors or SKUpervisor authentication.

Phase 7 completion unlocked Phase 8, whose completion record follows.

## Phase 8 Acceptance Gates

- [x] Today lists active appointments scheduled for the operator's current local day in chronological order.
- [x] Today shows requested, confirmed, checked-in, and in-service workload counts.
- [x] Governed lifecycle controls expose only deterministic next states returned by the shared presentation contract.
- [x] Booking mutations require manage permission, prevent duplicate interaction while saving, and refresh authoritative server state after success.
- [x] Calendar groups active appointments chronologically by day.
- [x] Calendar supports ticket, service, client, contact, and lifecycle-status filtering without changing backend ownership.
- [x] Loading, empty, filtered-empty, API failure, retry, and read-only states are explicit.
- [x] Settlement, receipt, checkout, and shift-ownership behavior remains unchanged.
- [x] Focused Vitest tests, POS production build, desktop/mobile Playwright proof, architecture checks, and documentation checks pass.

## Phase 8 Progress Record (2026-08-09)

- Completed the POS Today service-desk view with operational lifecycle counts, explanatory copy, and chronological appointments.
- Completed the POS Calendar schedule view with chronological grouping and accessible search/status filters.
- Added inline Services load failure and retry handling while retaining toast feedback.
- Preserved separate Services view/manage permissions and existing backend lifecycle validation.
- Playwright proof on port 5174 covers direct POS navigation, Today, Calendar interaction, desktop rendering, mobile rendering, nonblank content, and runtime error monitoring.

Phase 8 completion unlocked Phase 9, whose completion record follows.

## Phase 9 Acceptance Gates

- [x] Team & Resources is available in standalone POS under the existing Services resource-view permission.
- [x] Resource creation supports governed resource type, positive capacity, and optional location scope.
- [x] Service assignments require a service plus at least one resource, provider, or location anchor before submission.
- [x] Active resources show type, capacity, and location scope in a responsive operational layout.
- [x] Active assignments show every available resource, provider, and location anchor rather than hiding secondary anchors.
- [x] Assignment removal uses the governed `{ is_active: false }` API contract and does not delete history.
- [x] Duplicate resource/assignment mutations are disabled while another resource mutation is pending.
- [x] View-only operators receive explicit guidance and cannot create or remove resources or assignments.
- [x] Today/Calendar, settlement, receipt, checkout, and shift-ownership behavior remains unchanged.
- [x] Focused Vitest tests, POS production build, desktop/mobile Playwright proof, architecture checks, and documentation checks pass.

## Phase 9 Progress Record (2026-08-09)

- Completed POS resource creation with provider, room, equipment, vehicle, and station types, positive capacity, and optional numeric location scope.
- Completed service-assignment validation so the frontend mirrors the backend requirement for a resource, provider, or location anchor.
- Corrected POS assignment removal from the unsupported `status` payload to the governed non-destructive `is_active: false` contract.
- Expanded resource and assignment presentation with active counts and complete capacity-anchor context.
- Preserved Services resource view/manage permissions and added explicit view-only presentation.
- Playwright proof on port 5174 covers Team & Resources on desktop and mobile with runtime health monitoring.

Phase 9 completion unlocked Phase 10, whose completion record follows.

## Phase 10 Acceptance Gates

- [x] Waitlist intake requires a service, client name, and at least one client contact before submission.
- [x] Preferred schedule windows reject an end time that is not later than the start time.
- [x] Waitlist payloads normalize service identifiers, optional contact fields, preferred dates, and notes to the existing Services API contract.
- [x] Waitlist entries are ordered chronologically and can be searched by client, contact, service, or notes and filtered by lifecycle status.
- [x] Waitlist status updates use the governed status endpoint and all status controls lock while a mutation is pending.
- [x] Clients can be searched and segmented into repeat/new clients, with spend-descending operational ordering and visible retention signals.
- [x] View-only operators receive explicit guidance and cannot create or update waitlist entries.
- [x] Reminders, settlement, receipt, checkout, and shift-ownership behavior remains unchanged.
- [x] Focused Vitest tests, POS production build, desktop/mobile Playwright proof, architecture checks, and documentation checks pass.

## Phase 10 Progress Record (2026-08-09)

- Completed POS waitlist intake validation while retaining the backend Services API as the authoritative validator.
- Added chronological waitlist presentation, status counts, accessible search/status filters, explicit empty states, and mutation locking.
- Added client search, repeat/new segmentation, retention context, and spend-prioritized ordering.
- Added focused component/API-contract coverage: 2 files and 16 passing tests.
- POS production build, architecture guardrails, controller boundaries, documentation lint, and ADR lint pass.
- Playwright proof on standalone POS port 5174 covers Waitlist and Clients on desktop/mobile with runtime diagnostics and passes five consecutive stability runs.
- No SKUpervisor login, backend behavior, database schema, reminder processing, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 10 is complete. Phase 11 is the next eligible phase and requires separate approval.

## Phase 11 Acceptance Gates

- [x] Reminder queueing uses the existing Services endpoint and a governed 1–168 hour lookahead window.
- [x] Due reminder processing uses the existing Services email outbox and never reports unconfigured SMTP delivery as sent.
- [x] Queue outcomes show authoritative queued and skipped counts returned by the backend.
- [x] Processing outcomes show authoritative sent, failed, and skipped counts returned by the backend.
- [x] Reminder history exposes pending, sent, failed, and skipped counts plus provider message or failure reason.
- [x] Reminder history supports recipient, service, reference, channel, and outcome search plus lifecycle-status filtering.
- [x] Queue and send actions are both locked during any reminder mutation and disabled for view-only operators.
- [x] Settlement, receipt, checkout, and shift-ownership behavior remains unchanged.
- [x] Focused Vitest tests, POS production build, desktop/mobile Playwright proof, and architecture checks pass.

## Phase 11 Progress Record (2026-08-09)

- Added selectable 24-hour, 48-hour, 72-hour, and 7-day reminder queue windows using the backend's existing validated `lookahead_hours` contract.
- Added authoritative result summaries for queued/skipped and sent/failed/skipped reminder runs.
- Expanded reminder history with lifecycle counts, accessible search/status filtering, explicit filtered-empty states, and skipped-outcome styling.
- Preserved the established auditable behavior where missing SMTP configuration produces `skipped` with `email_not_configured` rather than a false sent result.
- Added focused component/API-contract coverage: 2 files and 20 passing tests.
- POS production build, architecture guardrails, and controller boundaries pass.
- Playwright proof on standalone POS port 5174 covers Reminder controls on desktop/mobile with runtime diagnostics and passes five consecutive stability runs.
- No SKUpervisor login, backend behavior, database schema, settlement, receipt, checkout, or shift-ownership behavior changed.

Phase 11 is complete. Phase 12 is the next eligible phase and requires separate approval.

## Phase 12 Settlement Discovery And Acceptance Gates

- [x] Discovery confirmed the existing Services settlement endpoint atomically creates a linked POS transaction and updates the booking.
- [x] Discovery identified and closed missing shift ownership, transaction shift linkage, terminal/location matching, cash sufficiency, and server-owned change requirements before exposing POS controls.
- [x] Settlement requires the authenticated cashier's exact open shift, terminal, and location.
- [x] The resulting POS transaction persists cashier, shift, terminal, and location audit identity.
- [x] Cash tender must cover the authoritative booking total and change is calculated only by the backend.
- [x] Client-submitted `change_amount` is rejected by validation.
- [x] Settlement uses immutable booking-line price snapshots and remains atomic with optional stock-bearing part deductions.
- [x] Existing settlement idempotency replays the linked transaction rather than creating a duplicate transaction.
- [x] POS collection controls appear only for eligible unpaid bookings and remain disabled without an active settlement context.
- [x] Non-payment Services scheduling and management remain available without an active shift.
- [x] Successful collection exposes the authoritative invoice, transaction, document, tender, and total identity and keeps the booking ticket separate from the payment receipt.
- [x] Focused backend/frontend tests, POS production build, desktop/mobile Playwright proof, architecture checks, and documentation checks pass.

## Phase 12 Progress Record (2026-08-09)

- Hardened `POST /services/bookings/:booking_id/settle` before connecting it to standalone POS.
- Required positive shift and location IDs plus a non-empty terminal ID at the transport boundary; `change_amount` is now forbidden client input.
- Verified the requested shift through the POS repository using the authenticated cashier, terminal, and location under the settlement transaction lock.
- Persisted `shift_id` on the generated POS transaction and returned receipt lookup fields in the settlement response.
- Added server-side cash sufficiency validation and deterministic change calculation.
- Added a POS collection dialog for cash, GCash, Maya, card, bank transfer, and QR Ph tender recording using the existing Services settlement command.
- Added explicit no-shift guidance while leaving scheduling actions operational.
- Focused proof passes: 8 settlement use-case tests, 2 RBAC route tests, and 22 frontend operational tests.
- POS production build, architecture guardrails, controller boundaries, and five consecutive desktop/mobile runtime-diagnostic Playwright runs pass.
- Rollback is code-only: remove the POS collection surface while retaining backend fail-closed settlement validation. No migration or destructive data operation was introduced.
- Residual boundary: non-cash tender labels are cashier-recorded tender evidence; this phase does not claim external provider authorization or payout confirmation.

Phase 12 is complete. Phase 13 is the next eligible phase and requires separate approval.

## Phase 13 Final Hardening Acceptance Gates

- [x] Release 2 functionality remains directly available inside standalone POS without SKUpervisor login or handoff.
- [x] Today, Calendar, Team & Resources, Waitlist, Reminders, and Clients remain permission-aware and online-only.
- [x] Booking, assignment, waitlist, reminder, and settlement lifecycle mutations preserve their governed backend contracts.
- [x] View-only, offline, no-shift, loading, empty, filtered-empty, busy, failure, and retry states have regression coverage.
- [x] Payment collection remains separate from scheduling actions and requires cashier-owned shift, terminal, and location context.
- [x] Booking tickets remain distinct from POS payment receipts and public booking lookup does not expose linked POS transactions.
- [x] Service catalog and operational components continue to build in both SKUpervisor and standalone POS.
- [x] Desktop, mobile, and tablet layouts expose the complete Services workspace with accessible labels and keyboard-operable tabs.
- [x] Browser proof monitors page exceptions, console errors, failed requests, HTTP 5xx responses, blank roots, and error boundaries.
- [x] No architecture allowlist, compatibility seam, migration, destructive data operation, or new payment provider claim was introduced.
- [x] Authoritative phase and feature documentation records final evidence, residual boundaries, and rollback behavior.

## Phase 13 Final Hardening Record (2026-08-09)

- Audited the complete Phase 6-12 implementation against ADR 0016, ADR 0020, ADR 0031, architecture boundaries, governance requirements, and the Services Mode contract.
- Updated two stale validator tests that still expected the pre-hardening empty settlement payload; the suite now proves missing shift context and client-calculated change fail closed.
- Backend regression passes 85 tests across Services lifecycle, catalog, options, booking validation, settlement, stock-exempt behavior, and mode-aware RBAC.
- Frontend regression passes 106 tests across shared Services components, POS operations, service catalog create/edit, navigation, shift ownership, and receipt separation.
- SKUpervisor and standalone POS production builds pass.
- Architecture guardrails, controller boundaries, compatibility-seam checks, documentation lint, and strict ADR lint pass with no new exceptions.
- Standalone POS Playwright proof passes five consecutive runs across desktop, 390px mobile, and 768px tablet viewports with keyboard tab activation and runtime diagnostics.
- Rollback remains code-only for the POS Services presentation; backend payment-integrity validation should remain fail closed even if collection UI is withdrawn.
- Residual boundary remains explicit: GCash, Maya, card, bank transfer, and QR Ph labels are cashier-recorded tender evidence unless a separately governed provider authorization flow supplies external confirmation.

Phase 13 and POS Services Release 2 are complete. No later phase is opened by this record. The next approved multi-phase initiative must continue numbering at Phase 14.

## Phase 14 Adds F&B Specific Contract Freeze

### Critical Assessment

- Existing F&B modifier primitives already validate assigned groups/options, server-owned price deltas, and transaction snapshots; replacing them would create unnecessary migration and compatibility risk.
- The current management and standalone POS experiences are incomplete, and the current schema does not fully represent channel, location, or sold-out availability.
- Services add-ons and F&B menu modifiers have different booking/order semantics and must remain separate even when presentation components are shared.
- Inventory-linked modifiers can double-deduct ingredients unless recipe and direct-item consumption share one normalized, idempotent contract.

### Recommendation And Architecture Classification

Proceed by extending the existing F&B modifier model additively. The initiative is cross-boundary because it affects Catalog/F&B configuration, Inventory, POS, Storefront, kitchen, receipt, refund, and reporting consumers. ADR 0019 receives a dated default-clause amendment; ADR 0029 ownership boundaries remain unchanged. No architecture allowlist or unresolved exception is introduced.

### Acceptance Gates

- [x] `docs/features/FNB_SPECIFIC_ADD_ONS.md` is authoritative for terminology, behavior, ownership, security, rollout, and rollback.
- [x] ADR 0019 records the F&B-specific modifier amendment and remains within existing binding ownership boundaries.
- [x] Existing generic `menuModifiers` capability is preserved while Services add-ons remain semantically separate.
- [x] Phase scopes 15-21 are recorded without authorizing implementation.
- [x] Documentation freshness is set to 2026-08-09 and all cited authoritative sources remain current.
- [x] Phase 14 changes documentation only and introduces no migration, runtime behavior, or destructive operation.

## Phase 14 Progress Record (2026-08-09)

- Froze menu modifier, variation, combo-choice, and special-instruction terminology.
- Defined server-authoritative selection, price, tax, availability, snapshot, refund, and historical-read rules.
- Defined POS/Storefront channel and operating-location availability requirements for the Phase 15 additive schema design.
- Defined non-stock and inventory-linked modifier behavior under location-scoped FIFO, completion, and idempotency contracts.
- Recorded Phases 15-21 as planned work requiring separate approval.

Phase 14 is complete. Phase 15 is the next eligible phase and requires separate approval.

## Phase 15 Backend, Database, And API Foundation

### Acceptance Gates

- [x] Legacy groups/options remain available by default through additive channel flags.
- [x] Per-location group and option availability uses normalized tenant-local tables with unique modifier/location pairs.
- [x] Global and location-specific sold-out state fails closed during checkout.
- [x] POS and Storefront enforce their own channel visibility using server-loaded configuration.
- [x] Storefront required groups reject an empty selection list.
- [x] Duplicate option selection, unassigned options, and caller-provided display/price hints cannot bypass authoritative validation.
- [x] Accepted modifier snapshots include linked item and operating location identity.
- [x] Migration and focused F&B/POS/Storefront tests pass.
- [x] Linked-option FIFO posting remains deferred to Phase 19 to prevent recipe/direct-item double deduction.
- [x] Phase 16 management UI remains unopened.

## Phase 15 Progress Record (2026-08-09)

- Added global POS/Storefront visibility and option sold-out fields with legacy-safe defaults.
- Added normalized location availability models and migration tables for groups and options.
- Extended F&B, POS, and Storefront repository associations to load availability data.
- Hardened POS and Storefront modifier resolution for channel, location, sold-out, duplicate, required, and active-state validation.
- Added linked `sku_item_id` and operating `location_id` to authoritative modifier snapshots.
- Added migration and checkout regression coverage while retaining server-owned pricing.

Phase 15 is complete. Phase 16 is the next eligible phase and requires separate approval.

## Phase 16 F&B Modifier Management

### Acceptance Gates

- [x] Operators can create and edit structured modifier groups and options.
- [x] Price, default, active, channel, sold-out, ordering, and linked-item fields use the Phase 15 server contract.
- [x] Active tenant locations can be enabled or disabled per modifier group.
- [x] Update mutations remain behind `menuModifiers` and the existing manage-menu permission fallback.
- [x] Linked item, location, limits, defaults, and option ownership are validated server-side.
- [x] Omitted historical options are deactivated, not deleted.
- [x] Existing item assignment and kitchen routing remain available.
- [x] Focused backend/frontend contracts and the frontend production build pass.
- [x] Standalone POS modifier selection remains deferred to Phase 17.

## Phase 16 Progress Record (2026-08-09)

- Added a transactional modifier-group update endpoint and frontend API binding.
- Added a dedicated responsive F&B modifier manager with explicit restaurant terminology.
- Added structured option pricing, inventory linking, defaults, availability, sold-out, and channel controls.
- Preserved item modifier assignments and kitchen routes in the Menu workspace.
- Extended RBAC route inventory and focused F&B management tests.

Phase 16 is complete. Phase 17 is the next eligible phase and requires separate approval.

## Phase 17 Standalone POS Modifier Picker

### Acceptance Gates

- [x] Assigned F&B groups are editable on each standalone POS cart line.
- [x] Single-select, multi-select, required, optional, default, and selection-limit rules are represented.
- [x] POS channel, location availability, active state, and sold-out state filter selectable choices.
- [x] Applying modifiers updates cart-line and checkout totals from server-provided deltas.
- [x] Checkout opens the affected picker when required selections are incomplete.
- [x] Existing payload, snapshot, kitchen, tax, discount, and offline contracts remain intact.
- [x] Focused tests, production build, and browser runtime diagnostics pass.
- [x] Storefront ordering changes remain deferred to Phase 18.

## Phase 17 Progress Record (2026-08-09)

- Added a responsive, accessible F&B modifier dialog to the current standalone POS terminal.
- Added cart-line selection summaries and reopen/edit behavior.
- Added local required/range validation before checkout while retaining backend authority.
- Preserved distinct customized lines and recalculated prices from immutable base-price input.
- Added focused selection-contract coverage and runtime diagnostics.

Phase 17 is complete. Phase 18 is the next eligible phase and requires separate approval.

## Phase 18 Storefront Ordering Hardening

### Acceptance Gates

- [x] Published required, optional, minimum, maximum, and default rules reach the customer picker deterministically.
- [x] Add to Cart and Buy Now reject incomplete required selections before mutating the cart.
- [x] Single-select and multi-select controls communicate and enforce the configured limits.
- [x] Storefront catalog output filters channel-hidden, sold-out, and selected-location unavailable choices.
- [x] Catalog refresh resets stale detail selections to currently published defaults.
- [x] Quote and checkout retain server-authoritative assignment, availability, and pricing validation.
- [x] Focused frontend and backend tests and the Storefront production build pass.
- [x] Downstream kitchen, receipt, inventory, refund, and reporting changes remain deferred to Phase 19.

## Phase 18 Progress Record (2026-08-09)

- Added deterministic default modifier selection to F&B item details.
- Added reusable required/range validation before Storefront cart mutation.
- Corrected picker copy and control semantics for mixed required and optional groups.
- Added location-aware modifier publication filtering to Storefront catalog serialization.
- Preserved identifier-only checkout payloads and backend-owned price/availability resolution.
- Added focused model, action-hook, and Storefront checkout regression coverage.

Phase 18 is complete. Phase 19 is the next eligible phase and requires separate approval.

## Phase 19 Kitchen, Receipt, Inventory, Refund, And Reporting Integration

### Acceptance Gates

- [x] Kitchen tickets and receipt/device output consume accepted modifier snapshots.
- [x] Historical transaction and reporting reads retain accepted line totals and modifier snapshots without catalog recalculation.
- [x] POS checkout creates location-scoped linked-modifier stock movements in addition to any base recipe movement.
- [x] Online orders create linked-modifier stock movements only on the first completion transition.
- [x] Deterministic online movement references identify the order line and selected option.
- [x] Non-stock modifiers create no inventory movement.
- [x] POS void/refund reversal uses persisted stock movements, so linked modifier issues are returned with the sale.
- [x] Focused POS checkout contracts pass; the broader online-order suite retains one pre-existing delivery-completion fixture failure unrelated to modifier inventory.
- [x] Advanced modifier quantities, combos, and nesting remain deferred to Phase 20.

## Phase 19 Progress Record (2026-08-09)

- Preserved linked inventory and location identity through normalized accepted POS snapshots.
- Added linked modifier consumption to immediate POS checkout and deferred online completion.
- Added deterministic online movement references per order line and modifier option.
- Confirmed existing kitchen, receipt, transaction, reporting, and void paths consume persisted transaction data and movements.
- Added regression coverage for recipe-plus-modifier POS sales and online linked-modifier completion.

Phase 19 is complete. Phase 20 is the next eligible phase and requires separate approval.

## Phase 20 Advanced Modifier Capabilities (Completed)

### Current Progress (2026-08-09)

- [x] Added bounded per-option quantity to normalized POS and Storefront requests.
- [x] Server-owned price calculation multiplies unit modifier deltas by accepted option quantity.
- [x] Accepted snapshots preserve option quantity and extended price delta.
- [x] Linked inventory consumption multiplies parent-line quantity by accepted modifier quantity.
- [x] Standalone POS picker exposes an accessible quantity input for selected options.
- [x] Storefront quantity controls and cart-line presentation.
- [x] Explicit combo-group semantics without conflating combos with ordinary modifiers.
- [x] Governed one-level conditional group activation and backend fail-closed validation.
- [x] Browser evidence and final Phase 20 rollback/release validation.

Phase 20 is complete. Phase 21 is the next eligible phase and requires separate approval.

### Phase 20B Progress Record (2026-08-09)

- Added quantity controls to selected Storefront modifier options with a bounded 1–99 input.
- Updated item-detail totals and extended modifier price presentation immediately as quantity changes.
- Included quantity in customized cart-line identity so differently configured lines do not merge.
- Preserved quantity through local-storage restoration, quote-refresh signatures, and checkout payload construction.
- Updated desktop and mobile cart summaries to show option quantity and extended add-on price.
- Focused Storefront tests and the production Storefront build pass. One broader source-contract assertion remains stale because retail mode was previously added to its expected cart-opening expression; this failure is unrelated to modifier quantity behavior.

### Phase 20C Progress Record (2026-08-09)

- Added additive `group_kind` persistence with `modifier` as the legacy-safe default and `combo_choice` as the explicit combo classification.
- Added management UI for selecting and identifying combo-choice groups.
- Enforced that combo choices are required and select at least one option.
- Preserved combo identity in accepted POS and Storefront snapshots.

### Phase 20D Progress Record (2026-08-09)

- Added an additive nullable parent-option reference for one-level conditional modifier groups, including foreign-key and index migration coverage.
- Added management controls for selecting an active option from another group as the condition.
- POS and Storefront reveal a conditional group only after its parent option is selected.
- Backend POS and Storefront checkout validation fails closed when a child option is submitted without its required parent.
- Accepted modifier snapshots preserve the parent-option reference for auditability.
- Validation passed: 45 focused backend tests, 8 focused frontend tests, and both POS and Storefront production builds.
- Recursive conditional trees remain intentionally unsupported.
- Presented combo-choice labels separately from optional/required modifier labels on Storefront.
- Migration, backend contracts, focused frontend tests, and SKUpervisor/Storefront production builds pass.

### Phase 20E Progress Record (2026-08-09)

- Added deterministic Playwright coverage proving one-level conditional modifier activation and deactivation on desktop and mobile Storefront viewports.
- Retained screenshots in the Playwright HTML report and enabled page-error, console-error, failed-request, HTTP 5xx, nonblank-root, and error-boundary diagnostics.
- Corrected the live Storefront smoke-test route and confirmed Masu Cafe renders safely on desktop and mobile.
- Found and fixed a tenant-schema coverage gap that omitted `group_kind`, `parent_modifier_option_id`, and the parent-option index from pre-existing tenants.
- Advanced the governed tenant schema capability to `2026-08-09.2`, repaired all 14 active local tenant schemas additively, and confirmed the Storefront catalog recovered from HTTP 500 to HTTP 200.
- Added migration rollback/reapply coverage and tenant-schema registry regression coverage.
- Final evidence passed: two Playwright scenarios, all 13 F&B readiness gates, architecture checks, governed-doc lint, production builds included by the readiness gate, and diff whitespace validation.
- Phase 20 rollback removes the additive parent-option reference only when reverting the migration before production use. After accepted orders exist, historical snapshots remain immutable and tenant repair must stay additive; posted inventory movements are corrected only through Inventory's governed adjustment workflow.

## Phase 21 Final Hardening (Completed)

### Current Progress (2026-08-09)

- [x] Aligned the F&B modifier manager with backend authorization by exposing an explicit read-only state when the operator lacks `fnb:menu:manage` and the governed `items:edit` compatibility permission.
- [x] Added focused component coverage for authorized and view-only modifier-management states.
- [x] Added keyboard-only conditional-group activation, selection, deactivation, and focus assertions.
- [x] Verified modifier inputs have accessible names and the active conditional layout does not overflow mobile viewports.
- [x] Revalidated authoritative server pricing and rejection of hidden, sold-out, location-unavailable, and otherwise stale selections.
- [x] Revalidated migration rollback/reapply and active tenant-schema coverage contracts.
- [x] Passed focused frontend tests, focused backend authorization and checkout suites, all SKUpervisor/POS/Storefront production builds, and two live Storefront Playwright scenarios.
- [x] Passed the complete 13-step `qa:fnb-readiness` gate, including architecture checks, governed-document lint, and diff whitespace validation.

Phase 21 is complete. Phase 22 records the separately approved correction of the modifier-management application boundary.

## Phase 22 Standalone POS Ownership Correction (Completed)

### Current Progress (2026-08-09)

- [x] Removed the structured F&B modifier manager from the SKUpervisor F&B page and restored that page's previous modifier presentation and form.
- [x] Added a dedicated **Menu modifiers** tab under standalone POS **Items** for F&B tenants only.
- [x] Added modifier-group creation and editing, option pricing, channel/location availability, sold-out state, inventory links, combo classification, and one-level conditions inside POS.
- [x] Added explicit assignment of selected modifier groups to a specific POS menu item.
- [x] Preserved backend-authoritative permissions, validation, pricing, Storefront publication, checkout snapshots, and inventory behavior.
- [x] Added regression contracts proving SKUpervisor does not mount the new manager and non-F&B POS modes do not expose the tab.
- [x] Passed 23 focused frontend tests and both standalone POS and SKUpervisor production builds.
- [x] Passed signed-in Playwright proof against the Masu Cafe F&B tenant on desktop and mobile with keyboard tab activation, no runtime diagnostics, and no horizontal overflow.

Phase 22 is complete. The Adds F&B Specific initiative now has a continuous completed record from Phase 14 through Phase 22; Phases 23 onward continue the same governed release sequence.

## Phase 23 Advanced Modifier Integrity (Completed)

### Acceptance Gates

- [x] Storefront modifier quantities survive Joi validation and `stripUnknown` processing with bounded integer limits.
- [x] Full-service F&B check-line snapshots resolve option names, prices, quantities, linked items, and selection rules from configured server data.
- [x] Conditional modifier groups reject nested parent chains and cycles, preserving the one-level contract.
- [x] Required groups reject creates and updates whose active options cannot satisfy the effective minimum selection.
- [x] Storefront checkout preflights linked modifier inventory at the selected location using parent-line and option quantities.
- [x] F&B modifier migrations propagate index errors instead of silently masking schema failures.
- [x] Focused backend/frontend regressions, migration tests, architecture checks, governed docs lint, POS/Storefront builds, and the full 13-step F&B readiness gate pass.

## Phase 23 Progress Record (2026-08-10)

- Added bounded `line_modifiers[].quantity` transport validation and regression coverage.
- Added server-owned full-service check-line modifier resolution and immutable snapshots.
- Added one-level conditional topology validation and active-option minimum checks on create/update.
- Added selected-location linked modifier stock preflight with quantity-aware shortfall details.
- Replaced swallowed F&B modifier migration index errors with idempotent index checks that preserve failures.
- Corrected stale backend/frontend contract-test paths and the POS identity-mock test harness.

Phase 23 is complete. Phase 24 is recorded below.

## Phase 24 CI And Readiness Gate Restoration (Completed)

### Acceptance Gates

- [x] Pull requests invoke a blocking reusable quality workflow in addition to deployable-image builds.
- [x] CI runs the current `apps/dgfy-api` backend test matrix against a fresh migrated MySQL schema with Redis, uploads matrix evidence, and runs F&B contracts with Jest open-handle diagnostics.
- [x] CI runs the required-index audit after migrations and independently smoke-tests the standalone migration runner against a fresh MySQL schema.
- [x] CI runs frontend lint, the F&B contract suite, and all SKUpervisor/POS/Storefront production builds.
- [x] CI runs architecture guardrails, controller boundaries, governed documentation lint, compatibility-seam validation, and changed-file whitespace checks as blocking steps.
- [x] `npm run qa:fnb-readiness` covers modifier migration rollback/error propagation, Storefront modifier quantity validation, and the F&B frontend route/API/receipt contracts.
- [x] Local focused readiness and repository governance validation pass; full backend matrix remains CI-owned because the local Windows run can exhaust the Node heap.

## Phase 24 Progress Record (2026-08-10)

- Added `.github/workflows/pr-quality-checks.yml` and wired it into `pr-checks.yml` as a blocking reusable workflow.
- Restored CI coverage for API architecture/lint/matrix/open-handle diagnostics, migration smoke, required-index auditing, frontend lint/F&B contract tests/builds, governed docs, compatibility seams, and diff hygiene.
- Extended `scripts/run-fnb-readiness-gate.js` with Phase 23 migration, validator, and frontend F&B contract regressions.
- Corrected the undefined service-settlement context exposed by the restored frontend lint gate and documented three existing prop-to-draft synchronization exceptions with a Phase 26 removal plan.
- Updated the authoritative F&B readiness and release-candidate policy docs to describe the enforced gates and the remaining opt-in compliance/inventory follow-up work.

Phase 24 is complete. Phase 25 is recorded below.

## Phase 25 Deterministic Storefront Browser Gate (Completed)

### Acceptance Gates

- [x] A dedicated Playwright configuration starts only the Storefront Vite server and runs Chromium headlessly with retained screenshot, video, trace, and HTML-report evidence on failure.
- [x] The deterministic Storefront contract covers the actual rendered F&B item-detail route, keyboard activation of a parent conditional modifier, child-option activation, bounded modifier quantity, customer-visible total recalculation, and parent deactivation clearing the child state.
- [x] The browser contract runs at the default desktop viewport and a 390px mobile viewport, with accessible names, keyboard focus, nonblank root, and no error-boundary assertions.
- [x] Runtime diagnostics fail at named checkpoints for page errors, unexpected console errors, failed requests, and HTTP 4xx/5xx responses, with only exact expected abort/optional-domain exceptions allowed.
- [x] The blocking reusable PR quality workflow installs Chromium, executes `npm run test:e2e:fnb-contract`, and uploads Playwright evidence.
- [x] The canonical `npm run qa:fnb-readiness` gate includes the deterministic browser contract; live tenant Services/POS lifecycle coverage remains opt-in and is not represented as CI-complete.

## Phase 25 Progress Record (2026-08-10)

- Added `apps/dgfy-web/playwright.fnb-contract.config.js` with an isolated Storefront-only web server and failure artifact retention.
- Strengthened `storefront-fnb-conditional-modifiers.spec.js` with structured diagnostics, exact expected-request allowlists, quantity-aware total assertions, and child-state cleanup proof.
- Added `test:e2e:fnb-contract`, wired the browser test into the blocking reusable quality workflow, and uploaded its report/test-results artifacts.
- Extended the F&B readiness and release-candidate documentation to distinguish deterministic browser proof from live tenant/POS/payment evidence.

Phase 25 is complete. Phase 26 is recorded below.

## Phase 26 POS Edit-Session State Hardening (Completed)

### Acceptance Gates

- [x] The F&B POS modifier picker initializes selections from the active line session and no longer synchronizes local state from props inside an effect.
- [x] The POS F&B modifier manager hydrates an edit draft from the group-selection action and starts a blank draft from the explicit new-group action.
- [x] The POS Services options modal initializes an empty selection for each keyed service-item session and no longer synchronizes local state from props inside an effect.
- [x] POS parent rendering keys the picker and service-options modal by their active edit/session identity so reopening or switching items cannot reuse stale selections.
- [x] Regression coverage proves switching modifier lines, modifier-manager edit/new actions, and service items creates fresh session state.
- [x] No database migration or API contract change is introduced; focused frontend tests, lint, POS/Storefront builds, the F&B readiness gate, and governance checks pass.

## Phase 26 Progress Record (2026-08-10)

- Removed the three `react-hooks/set-state-in-effect` exceptions documented during Phase 24.
- Added explicit keyed session boundaries in `POSCheckoutTerminal` for F&B modifier editing and Services option selection.
- Hydrated modifier-manager drafts directly from edit/new actions instead of prop-change effects.
- Added component regressions for stale-selection isolation and edit/new draft initialization.

Phase 26 is complete. Phase 27 is in progress under separate approval.

## Phase 27 Folder-Scoped Modifier Inheritance

### Acceptance Gates

- [x] Existing item-level modifier assignments remain compatible and can explicitly override or exclude a folder-inherited group.
- [x] Folder assignments persist through an additive tenant-local migration with idempotent rollback and schema-registry coverage.
- [x] POS and Storefront catalog reads resolve folder inheritance, item precedence, deduplication, and deterministic ordering through the same backend utility.
- [x] Folder and item assignment endpoints remain authenticated, capability-gated, permission-aware, and server-validated.
- [x] POS exposes folder assignment, affected-item context, item override, and inherited-group exclusion controls.
- [x] Existing accepted transaction snapshots remain immutable and do not recalculate from current folder configuration.
- [x] Focused backend/frontend regressions, lint, builds, readiness, architecture, documentation, and migration/schema checks pass.

## Phase 27 Progress Record (2026-08-10)

- Added `fnb_folder_modifier_groups` and item-level `is_excluded` as additive persistence.
- Added the shared effective-group resolver and wired it into POS and Storefront catalog repositories.
- Added guarded folder assignment APIs and POS folder/item override controls.
- Added focused resolver, migration, and POS workspace regression coverage.
- Passed the 20-step `qa:fnb-readiness` gate and explicit tenant-schema registry coverage for the new migration.

Phase 27 is complete. Phase 28 is in progress under separate approval.

## Phase 28 Cashier-Owned Day Close PIN Setup (Completed)

### Objective and Scope

- Let each authorized cashier create and change their own company-scoped POS Day Close PIN from Account Profile.
- Show the cashier's account email and configured/not-configured status to the Master Admin in POS Day Close PIN management.
- Preserve the Master Admin recovery action as a reset only; PIN values remain write-only.

### Dependencies

- ADR 0031's 2026-08-10 Cashier-Owned Day-Close PIN Setup amendment.
- Existing `users.pos_day_close_pin_hash` persistence and `pos:close_day` permission.

### Acceptance and Validation Evidence

- [x] Authenticated self-service endpoint verifies the current account password, authorization, and PIN format before persisting a hash and audit event.
- [x] Account Profile exposes the current company's My Day Close PIN action only to users with `pos:close_day`.
- [x] Admin PIN management shows the account email and supports recovery reset without displaying or assigning a PIN.
- [x] DGFY Business to POS cashier handoff retains the selected company session while clearing only stale terminal-local lock and terminal identity; an expired or tenant-mismatched handoff remains locked.
- [x] Backend and frontend contract tests, architecture checks, governed docs validation, and POS build pass.

### Implementation Links

- `apps/dgfy-api/src/routes/users.js`
- `apps/dgfy-api/src/services/userService.js`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/Pages/DgfyCompanySelect.jsx`
- `apps/dgfy-web/src/services/browserSession.js`

### Completion Record (2026-08-10)

- Implemented the password-verified, audited, cashier-owned Day Close PIN endpoint and Account Profile workflow. Master Admin can see safe cashier identity/status fields and reset only.
- Added a credential-free, one-minute DGFY Business to POS handoff marker. POS clears stale terminal-local state, then validates the selected tenant and relocks on any tenant mismatch.
- Validation passed: focused backend self-service PIN contract, focused frontend PIN and DGFY company-selection/handoff contracts (26 frontend assertions), `npm run lint:docs`, `npm run check:architecture`, and `npm run build:pos`.

Phase 28 is complete. The next eligible governed phase is Phase 29.

## Phase 29 Storefront To POS Handoff Fail-Closed Guard (Completed)

### Objective and Scope

- Prevent a Business > Go to POS launch from opening a terminal-login dead end when the one-time DGFY handoff token cannot be minted or is missing from a successful response.

### Dependencies

- ADR 0031's DGFY Business To POS Cashier Handoff amendment.
- Existing DGFY single-use handoff endpoint and POS HashRouter handoff route.

### Acceptance and Validation Evidence

- [x] Storefront creates a non-empty one-time handoff token before constructing the POS URL.
- [x] Token creation failure or an empty token keeps Storefront in place and shows an actionable launch error.
- [x] A provisional new POS tab closes on handoff failure and is never navigated without the token.
- [x] Focused Storefront hook regression, governed docs validation, architecture checks, and POS build pass.

### Completion Record (2026-08-10)

- Removed the tokenless POS redirect fallback; the handoff is now required for a cross-origin POS launch.
- Added direct, empty-token, and provisional-new-tab failure regressions.

### Implementation Links

- `apps/dgfy-web/apps/store/src/customer-dashboard/hooks/useCustomerDashboardBusinessAccess.js`
- `apps/dgfy-web/apps/store/src/customer-dashboard/hooks/__tests__/useCustomerDashboardBusinessAccess.test.js`

Phase 29 is complete. The next eligible governed phase is Phase 30.

## Phase 30 Fresh Handoff Terminal-State Isolation (Completed)

### Objective and Scope

- Prevent a successful DGFY Business → POS cashier handoff from being re-locked by an old tenant's terminal ID retained in React state before the new tenant registry loads.

### Dependencies

- ADR 0031's DGFY Business To POS Cashier Handoff amendment.
- Phase 29 required-handoff guard.

### Acceptance and Validation Evidence

- [x] A fresh verified handoff clears persisted and in-memory terminal/location selection before registry validation.
- [x] POS does not derive a stored terminal ID from prior state during a fresh handoff.
- [x] Focused regression, docs/architecture checks, POS build, and live Playwright Acme cashier handoff pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalSessionSource.contract.test.js`

### Completion Record (2026-08-10)

- Cleared stale terminal, location, and terminal-form state when a verified DGFY Business handoff begins.
- Prevented fresh handoff hydration from deriving terminal validation input from the prior tenant's in-memory selection.
- Live Playwright proof with the approved local cashier account: Storefront > Acme Corporation > Go to POS > new tab returned 200 for handoff creation, exchange, tenant session, and `/users/me`; cashier identity was visible, terminal lock was clear, and the login drawer was off-canvas.

Phase 30 is complete. The next eligible governed phase is Phase 31.

## Phase 31 Business-Scoped Day Close PIN Dialog (Completed)

### Objective and Scope

- Let an eligible cashier configure their personal Day Close PIN directly from the selected company card in DGFY Business.
- Preserve company scoping by creating a non-persistent selected-company session only for the save request; do not open POS or change the active browser tenant session.
- Retire the DGFY Business-to-POS Day Close PIN launch shortcut so PIN setup has one clear entry flow.

### Dependencies

- ADR 0031, 2026-08-10 Cashier-Owned Day-Close PIN Setup amendment.
- Phase 28 self-service password-verified, audited PIN endpoint.

### Acceptance and Validation Evidence

- [x] The selected Business card opens a PIN form rather than a POS-launch dialog.
- [x] The form validates current password, 4–12 digit PIN, and confirmation before save.
- [x] The save request uses a selected-company session without persisting or changing the Storefront tenant session.
- [x] The existing endpoint remains the server-side authority for current-password and `pos:close_day` validation.
- [x] Focused Storefront/POS regressions, production builds, and architecture checks pass.

### Completion Record (2026-08-10)

- Replaced the Business-card PIN shortcut's POS redirect with an in-place password/PIN/confirmation dialog for the selected company.
- Used an unactivated, short-lived tenant session only to authorize the existing self-service endpoint; Storefront does not retain or switch to that tenant session.
- Validation passed: 34 focused frontend assertions, Storefront and POS production builds, architecture guardrails, and governed docs/ADR lint.

### Implementation Links

- `apps/dgfy-web/apps/store/src/customer-dashboard/components/BusinessPosLaunchModal.jsx`
- `apps/dgfy-web/apps/store/src/customer-dashboard/hooks/useCustomerDashboardBusinessAccess.js`
- `apps/dgfy-web/apps/store/src/customer-dashboard/pages/DgfyCustomerAccountPage.jsx`

Phase 31 is complete. The next eligible governed phase is Phase 32.

## Phase 32 Cashier-Owned Day Close PIN Contract Hardening (Completed)

### Objective and Scope

- Enforce cashier ownership of each company-scoped Day Close PIN across the API, service, POS administration UI, and Z-reading guidance.
- Limit Master Admin recovery to clearing an existing PIN; Master Admin cannot assign or view a cashier PIN.

### Dependencies

- ADR 0031, 2026-08-10 Cashier-Owned Day-Close PIN Setup amendment.
- Phase 31 Business-Scoped Day Close PIN Dialog.

### Acceptance and Validation Evidence

- [x] The admin Day Close PIN validator accepts only `{ clear: true }` and rejects PIN assignment payloads.
- [x] The admin use case and service independently enforce reset-only behavior.
- [x] Cashier self-service remains bound to the authenticated user, current account password, `pos:close_day`, and the selected tenant.
- [x] Missing-PIN guidance directs the cashier to DGFY Business instead of asking the Master Admin to set the PIN.
- [x] Focused backend and frontend tests, targeted backend and frontend lint, and POS and Storefront production builds pass.

### Completion Record (2026-08-11)

- Hardened the administrative endpoint, use case, service, and frontend client to expose reset-only recovery.
- Aligned POS administration and Z-reading messages with independent cashier PIN ownership.
- Validation passed: 7 focused backend assertions, 13 focused frontend assertions, targeted lint with no errors, and POS and Storefront production builds.

### Implementation Links

- `apps/dgfy-api/src/validators/userValidator.js`
- `apps/dgfy-api/src/modules/users/controllers/userHandlers.js`
- `apps/dgfy-api/src/modules/users/usecases/userUseCases.js`
- `apps/dgfy-api/src/services/userService.js`
- `apps/dgfy-api/src/modules/pos/domain/posDayClosePinPolicy.js`
- `apps/dgfy-web/src/services/userService.js`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`

Phase 32 is complete. The next eligible governed phase is Phase 33.

## Phase 33 Standalone POS Day Close Access Management (Completed)

### Objective and Scope

- Let the Master Admin grant or revoke `pos:close_day` for active cashiers directly from standalone POS Settings.
- Keep permission management, cashier-owned PIN setup, PIN status, and admin reset responsibilities visibly separate.

### Dependencies

- ADR 0031, 2026-08-10 Cashier-Owned Day-Close PIN Setup amendment.
- Phase 32 Cashier-Owned Day Close PIN Contract Hardening.
- Existing Master Admin-only user permission endpoint.

### Acceptance and Validation Evidence

- [x] Day Close Access lists active cashier accounts even when they do not yet have `pos:close_day`.
- [x] Master Admin can enable or disable only `pos:close_day` while preserving every other permission.
- [x] Master Admin access is labelled as built in and cannot be toggled from the cashier control.
- [x] Enabling access never creates a PIN; the cashier remains responsible for private setup in DGFY Business.
- [x] PIN reset remains available only for an authorized operator with a configured PIN.
- [x] Focused frontend tests, targeted lint, POS production build, architecture checks, and governed documentation checks pass.

### Completion Record (2026-08-11)

- Replaced the status-only POS Day Close PIN list with an actionable Day Close Access section.
- Added an accessible per-cashier Z-reading permission switch, mutation loading state, safe permission merging, and clear setup guidance.
- Validation passed: 14 focused frontend assertions, targeted lint with no errors, POS production build, architecture guardrails, and governed docs/ADR lint.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/src/services/userService.js`
- `apps/dgfy-web/src/services/__tests__/userService.dayCloseAccess.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/dayClosePin.contract.test.js`

Phase 33 is complete. The next eligible governed phase is Phase 34.

## Phase 34 DGFY Day Close PIN Credential Authority Correction (Completed)

### Objective and Scope

- Verify the cashier's landlord-scoped DGFY password when Day Close PIN setup starts from DGFY Business.
- Preserve tenant-local password verification for direct POS self-service users.
- Keep the PIN company-scoped, cashier-owned, write-only, permission-gated, and audited.

### Dependencies

- ADR 0028 explicit accepted-membership and separate credential-authority contract.
- ADR 0031's cashier-owned Day Close PIN amendments.
- Phase 33 Standalone POS Day Close Access Management.

### Acceptance and Validation Evidence

- [x] DGFY Business submits PIN setup through a DGFY-authenticated, selected-company endpoint instead of a derived tenant session.
- [x] The endpoint verifies the global DGFY account password before entering tenant context.
- [x] The selected company must have an accepted membership linked to the same active tenant user.
- [x] The tenant user must still hold `pos:close_day`; the PIN hash and audit event remain tenant-local.
- [x] Direct POS self-service retains tenant-local password verification.
- [x] Focused backend/frontend tests, lint, builds, rendered browser proof, architecture checks, and governed documentation checks pass.

### Completion Record (2026-08-11)

- Added a DGFY-authenticated company endpoint that verifies the cashier's global DGFY account password before entering tenant context.
- Bound PIN setup to the accepted membership's exact active tenant user while preserving tenant-local PIN hashing, permission enforcement, and audit evidence.
- Kept direct POS self-service on tenant-local password verification and removed the unnecessary tenant-session bootstrap from DGFY Business PIN setup.
- Validation passed: 75 focused backend assertions, 22 focused frontend assertions, targeted lint, Storefront production build, architecture guardrails, governed docs/ADR lint, live protected-route registration, and rendered Storefront runtime proof with no application errors.

### Implementation Links

- `apps/dgfy-api/src/routes/dgfy.js`
- `apps/dgfy-api/src/modules/dgfy/controllers/dgfyAuthHandlers.js`
- `apps/dgfy-api/src/modules/dgfy/usecases/dgfyAuthUseCases.js`
- `apps/dgfy-api/src/services/dgfyTenantSessionService.js`
- `apps/dgfy-api/src/services/userService.js`
- `apps/dgfy-api/tests/dgfyAuthUseCases.test.js`
- `apps/dgfy-api/tests/dgfyTenantSessionService.contract.test.js`
- `apps/dgfy-api/tests/dgfyTenantSession.transport.test.js`
- `apps/dgfy-api/tests/posDayClosePinSelfService.contract.test.js`
- `apps/dgfy-web/apps/store/src/customer-dashboard/hooks/useCustomerDashboardBusinessAccess.js`
- `apps/dgfy-web/apps/store/src/customer-dashboard/hooks/__tests__/useCustomerDashboardBusinessAccess.test.js`

Phase 34 is complete. The next eligible governed phase is Phase 35.

## Phase 35 Tenant Z-Reading Snapshot Schema Repair (Completed)

### Objective and Scope

- Restore location-scoped Z-reading generation by aligning every active tenant's `pos_z_reading_snapshots` table with the runtime model.
- Add the missing snapshot columns and indexes to the declared tenant schema capability so report and repair modes cannot return a false healthy result.
- Preserve existing legacy snapshots without inventing historical location attribution.

### Dependencies

- ADR 0031's per-operator Day-Close confirmation and immutable Z-reading attribution contract.
- Phase 34 DGFY Day Close PIN Credential Authority Correction.
- Additive tenant schema repair guardrails in `apps/dgfy-api/scripts/sync-tenant-schemas.js`.

### Acceptance and Validation Evidence

- [x] Tenant schema report detects all missing Z-reading snapshot columns and indexes.
- [x] Repair dry-run proposes only the declared additive Z-reading snapshot DDL.
- [x] A pre-repair backup exists for every affected tenant snapshot table.
- [x] All active tenant schemas contain the four required columns and two required indexes after repair.
- [x] Existing snapshot rows remain present and legacy rows retain `location_id = NULL` when attribution cannot be proven.
- [x] Focused tests, schema report, Z-reading query proof, architecture checks, and governed documentation checks pass.

### Completion Record (2026-08-11)

- Added the four runtime-required Z-reading snapshot columns and two indexes to tenant schema capability version `2026-08-11.1`.
- Confirmed repair dry-run proposed exactly six additive operations for each of 14 affected tenant schemas.
- Created 14 pre-repair `mysqldump` backups, then applied the guarded additive repair successfully to all 14 active tenants.
- Verified all tenants pass schema report mode and direct location-scoped snapshot queries no longer raise MySQL error 1054.
- Preserved all seven legacy Masu Cafe snapshots with `location_id = NULL`; no unsupported historical branch attribution was invented.
- Validation passed: 34 schema-registry assertions, 24 focused POS/schema assertions, targeted lint, architecture guardrails, and governed docs/ADR lint.

### Implementation Links

- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js`
- `apps/dgfy-migration-runner/migrations/20260807000003-add-location-to-pos-z-reading-snapshots.cjs`
- `apps/dgfy-migration-runner/migrations/20260808000001-add-pos-day-close-pin-and-z-reading-attribution.cjs`

Phase 35 is complete. The next eligible governed phase is Phase 36.

## Phase 36 Post-Shift Day-Close Handoff and Locked-Screen Z-Reading Access (Completed)

### Objective and Scope

- Keep checkout and cash-drawer operations closed after a cashier ends their shift while preserving a narrow authenticated path to branch Day Close.
- Show the cashier's saved shift summary and the branch's remaining open shifts before offering Z-reading generation.
- Let an authorized operator enter Day Close from terminal login without opening a new cashier shift.

### Dependencies

- ADR 0031's shift-safe navigation, branch-wide Z-reading, and personal Day Close PIN contract.
- Phase 35 Tenant Z-Reading Snapshot Schema Repair.
- Existing server-side `pos:close_day`, registered-terminal, personal-PIN, and open-shift checks.

### Acceptance and Validation Evidence

- [x] A successful online cashier shift close opens a blocking post-shift handoff instead of immediately destroying the authenticated session.
- [x] The handoff preserves the individual cashier shift-summary print action while checkout remains blocked by the absence of an active shift.
- [x] The backend returns location-scoped Day Close readiness with remaining terminal and cashier details.
- [x] `Generate Z-reading` remains disabled until readiness confirms every branch shift is closed, while the close-day command still rechecks transactionally.
- [x] An authorized operator can select `Day Close / Z-reading` from terminal login without opening a shift or unlocking selling.
- [x] Unauthorized users receive guidance to use an authorized cashier or manager; Day Close still requires the operator's personal PIN.
- [x] Focused backend/frontend tests, targeted lint, syntax checks, and the POS production build pass.

### Completion Record (2026-08-11)

- Added a Day Close readiness query and included the immediate remaining-shift snapshot in successful shift-close responses.
- Replaced automatic post-close logout with a secure Shift Closed summary that supports summary reprint, readiness refresh, explicit login return, and Z-reading generation when eligible.
- Added a terminal-login Day Close entry path that installs the selected company and terminal context without creating a cashier shift.
- Preserved the backend as the final authority for permission, terminal location, personal PIN, duplicate snapshot, and open-shift enforcement.
- Validation passed: 42 focused backend assertions, 10 focused frontend assertions, targeted ESLint with no errors, backend syntax checks, and the POS production build.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/tests/posReadings.usecase.test.js`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalLockDrawer.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalPairing.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/TerminalLockDrawer.dgfy.test.jsx`

Phase 36 is complete. The next eligible governed phase is Phase 37.

## Phase 37 Preflight-Gated Shift-Screen Day Close (Completed)

### Objective and Scope

- Prevent the Shift screen from offering Day Close while the current cashier shift or another branch shift remains open.
- Reuse the authoritative location-scoped Day Close readiness endpoint before opening the personal-PIN confirmation.
- Recheck readiness immediately before Z-reading generation while preserving the backend transactional guard as final authority.

### Dependencies

- ADR 0031's requirement that Z-reading generation reject closure while any location shift remains open.
- Phase 36 Post-Shift Day-Close Handoff and Locked-Screen Z-Reading Access.
- Existing `GET /pos/z-reading/close-readiness` and `POST /pos/z-reading/close-day` contracts.

### Acceptance and Validation Evidence

- [x] The Shift-screen Day Close action is disabled while the current cashier shift remains open.
- [x] The action remains disabled when readiness reports another branch cashier shift, and the blocking terminal/cashier details are shown.
- [x] Readiness loading and failure states keep Day Close disabled and provide a manual status refresh.
- [x] The personal-PIN dialog opens only after a fresh ready response and disables confirmation until readiness and PIN format are valid.
- [x] PIN submission performs another readiness preflight, while the close-day endpoint retains its transactional open-shift rejection.
- [x] Focused frontend contracts, targeted ESLint, POS production build, and architecture checks pass.

### Completion Record (2026-08-11)

- Added shared Shift-screen Day Close readiness state backed by the existing location-scoped API.
- Disabled the primary action during the current shift, another branch shift, status loading, connection failure, terminal mismatch, or unknown readiness.
- Added blocking shift accountability details, deterministic test hooks, and a manual readiness refresh action.
- Added fresh preflight checks before both opening the PIN dialog and submitting the Z-reading request.
- Validation passed: 3 Day Close contract assertions, the focused shift-gating contract, targeted ESLint with no errors, POS production build, and architecture guardrails.

### Implementation Links

- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/dayClosePin.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`

Phase 37 is complete. The next eligible governed phase is Phase 38.

## Phase 38 DGFY-to-POS Durable Shift Resume Handoff (Completed)

### Objective and Scope

- Return a cashier entering POS from DGFY Business to the same open shift instead of incorrectly offering a new shift.
- Fail closed when current-shift or terminal-registry checks are unavailable or the active shift no longer matches an active terminal and location.
- Preserve the resume decision across terminal lock restoration so later effects cannot overwrite it with open-shift mode.

### Dependencies

- ADR 0031's durable same-cashier shift-resume and shift-safe navigation contract.
- Phase 37 Preflight-Gated Shift-Screen Day Close.
- Existing authenticated DGFY company handoff, current-shift, and terminal-registry APIs.

### Acceptance and Validation Evidence

- [x] A valid active shift from DGFY Business opens the `Resume Shift` prompt for the same terminal and location.
- [x] The handoff shows `Open Shift` only after a successful current-shift lookup confirms no active shift.
- [x] Shift lookup failures no longer degrade to a false no-shift result.
- [x] Missing, inactive, or location-mismatched terminal assignments block the handoff with supervisor guidance.
- [x] Lock restoration preserves `resume_shift` when the authenticated cashier session contains an active shift.
- [x] Focused frontend tests, targeted lint, cashier Chrome Playwright evidence, POS production build, and architecture checks pass.

### Completion Record (2026-08-11)

- Centralized active-shift terminal/location validation and reused it across fresh DGFY handoff, stored handoff restoration, company selection, and direct terminal unlock.
- Removed silent current-shift/settings fallbacks that previously converted backend failures into an incorrect Open Shift prompt.
- Corrected the lock-restoration race that overwrote `resume_shift` with `shift_start` after the handoff had already found the cashier's open shift.
- Added a Storefront Business-to-POS Chrome regression using the cashier account and deterministic current-shift fixtures.
- Validation passed: 22 focused frontend assertions, targeted ESLint with no errors, one cashier Chrome Playwright flow, POS production build, and architecture guardrails.

### Implementation Links

- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/utils/terminalShiftEntryDecision.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalShiftEntryDecision.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalSessionSource.contract.test.js`
- `apps/dgfy-web/tests/e2e/pos/dgfy-business-shift-resume.spec.js`

Phase 38 is complete. The next eligible governed phase is Phase 39.

## Phase 39 Close-Report Payment Method Breakdown (Completed)

### Objective and Scope

- Show a stable payment-method breakdown in the cashier Close Shift summary and branch Z-reading.
- Keep Cash, GCash, Maya, Card (Credit/Debit), and Employee Credit financially distinct while grouping QR Ph, bank transfer, and unknown future methods under Other.
- Apply the same labels, transaction counts, and amounts to browser print, iMin direct print, and LAN/device-bridge print output.

### Dependencies

- ADR 0031's shift-close and Z-reading accountability contract.
- Phase 38 DGFY-to-POS Durable Shift Resume Handoff.
- Existing financially recognized `PosTransaction.payment_type` aggregation and close-report APIs.

### Acceptance and Validation Evidence

- [x] The backend returns all six canonical payment rows in a stable order, including zero-value rows.
- [x] Card tenders remain separate from employee account credit.
- [x] QR Ph, bank transfer, missing, and unknown future methods aggregate under Other without changing the recognized sales total.
- [x] Existing persisted Z-reading snapshots are normalized when read or reprinted.
- [x] Close Shift and Z-reading browser views, iMin output, and LAN/device-bridge output use the same authoritative labels.
- [x] Focused backend and frontend tests, targeted ESLint, POS production build, and architecture checks pass.

### Completion Record (2026-08-11)

- Added a single POS payment-breakdown normalizer used by repository aggregation, shift-close responses, Z-reading responses, and device-print payloads.
- Added canonical labels for Cash, GCash, Maya, Card (Credit/Debit), Employee Credit, and Other while preserving transaction counts and amounts.
- Updated all report renderers and physical-printer formatters to prefer the backend-provided payment label.
- No database migration was required because existing `payment_type` values remain the persistence authority.
- Validation passed: 20 focused backend assertions, 2 focused frontend/print assertions, targeted ESLint with no errors, POS production build, and architecture guardrails.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/utils/paymentBreakdown.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posDeviceUseCases.js`
- `apps/dgfy-api/device-bridge/receipts/receiptFormatter.js`
- `apps/dgfy-api/tests/posPaymentBreakdown.test.js`
- `apps/dgfy-api/tests/posReadings.usecase.test.js`
- `apps/dgfy-web/src/features/pos/components/ShiftCloseSummaryPrintView.jsx`
- `apps/dgfy-web/src/features/pos/components/ZReadingPrintView.jsx`
- `apps/dgfy-web/src/features/pos/utils/iminHardwareBridge.js`
- `apps/dgfy-web/src/features/pos/__tests__/closeReportPaymentBreakdown.test.jsx`

Phase 39 is complete. The next eligible governed phase is Phase 40.

## Phase 40 Release Scope Containment (Completed)

### Objective and Scope

- Prevent the mixed local worktree from being treated as one production-ready POS change.
- Separate the release inventory into identity/PIN handoff, POS shift/Z-reading, F&B schema, Storefront/order lifecycle, and CI/release-policy slices.
- Exclude generated files, local credentials, uploads, reports, and machine-specific Android state without deleting user data or hiding source.

### Dependencies

- The authoritative Release Candidate Policy and `docs/ai/PR.md` commit/PR requirements.
- ADR 0031's terminal, shift, Day Close PIN, and Z-reading contracts.
- Phase 39 Close-Report Payment Method Breakdown.

### Acceptance and Validation Evidence

- [x] Generated and sensitive local artifacts have narrow ignore coverage while application source, migrations, tests, workflows, and Android source remain visible.
- [x] The pre-document visible untracked inventory is reduced from 5,178 to 28 without deleting or moving local files; this Phase 40 scope document brings the current total to 29.
- [x] The remaining source scope is mapped into five independently reviewable release slices with explicit dependencies and exclusions.
- [x] The pending F&B migration is isolated from the POS-only release slice and requires its own schema evidence.
- [x] Existing compliance, bundle-budget, authenticated-E2E, financial, and printer blockers remain explicit; the worktree is not marked release-ready.
- [x] Historical Phase 28 and Phase 30 headings are reconciled with their existing completion records without renumbering phases.

### Completion Record (2026-08-11)

- Added narrow ignore rules for legacy frontend artifacts/secrets, compatibility-backend uploads/runtime data, root temporary data, and Android/Gradle machine artifacts.
- Recorded the release-slice inventory, protected boundaries, current branch divergence, validation gaps, and the no-direct-production rule.
- Preserved all local user data and kept every application, migration, test, workflow, documentation, and Android source change visible for deliberate review.
- Phase 40 provides containment only; it does not approve a commit, pull request, migration, or deployment.

### Implementation Links

- `.gitignore`
- `docs/features/POS_RELEASE_HARDENING_PHASE_40_SCOPE.md`
- `docs/ops/RELEASE_CANDIDATE_POLICY.md`
- `docs/ai/PR.md`

Phase 40 is complete. The next eligible governed phase is Phase 41.

## Phase 41 POS Financial, Branding, And Hardware Audit Contracts (Completed)

### Objective and Scope

- Replace hardcoded close-report branding with the selected tenant's configured business name and profile image across browser and iMin print paths.
- Report POS voids explicitly in shift summaries and Z-readings without double-subtracting them from financially recognized sales, while keeping payment-provider refunds in the commerce/provider ledger.
- Make client-executed iMin receipt, report, and drawer actions await idempotent backend audit confirmation without repeating a physical action after an audit failure.
- Restore isolated-schema reconciliation tests after the migration-runner extraction so clean-install financial validation is executable.

### Dependencies

- ADR 0031's shift, Day Close, immutable Z-reading, and payment-accountability contracts.
- ADR 0042 and ADR 0052's provider-payment settlement and refund-ledger ownership.
- ADR 0053's binding requirement that every receipt print and drawer pulse creates backend audit evidence.
- Phase 40 Release Scope Containment.

### Acceptance and Validation Evidence

- [x] Browser shift summaries and Z-readings render the selected tenant's configured name and profile image; iMin output sends the configured image bitmap before tenant-branded report text.
- [x] Z-reading aggregation exposes POS void transaction count, amount, and item count using `voided_at`, including a date containing voids but no recognized sale.
- [x] Recognized sales remain completed-only and provider refunds are explicitly identified as separately reconciled rather than mislabeled as POS voids.
- [x] Receipt-plus-drawer iMin actions produce two awaited backend audit reports with stable idempotency keys; transient audit failures retry without repeating the physical action.
- [x] A drawer pulse without an active shift audit context is rejected before the native bridge is called.
- [x] A fresh isolated tenant schema passes POS checkout, online-order, inventory, Z-reading, and unified-sales reconciliation, including the new void contract.
- [x] Focused backend/frontend tests, targeted lint, POS production build, architecture guardrails, governed docs lint, and ADR lint pass.

### Completion Record (2026-08-11)

- Extended the mobile POS settings bootstrap and device print payload with tenant receipt identity fields, then removed hardcoded report branding from terminal print calls.
- Added explicit POS-void disclosure fields to live and daily Z-reading summaries and all browser, iMin, and LAN text renderers; no database migration was required because existing transaction status, amount, lines, and `voided_at` remain authoritative.
- Changed iMin client-result reporting from fire-and-forget to awaited, idempotently retried audit confirmation while preserving physical success as a separate outcome.
- Made the historical shift-location remediation migration self-contained and corrected the isolated test harness to execute the standalone migration runner after the monorepo extraction.
- Validation passed: 21 focused backend unit assertions, 12 focused frontend assertions, 16 isolated-schema integration/migration assertions, targeted lint with no errors, POS production build, architecture guardrails, governed docs lint, and ADR lint.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/mobilePosUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posDeviceUseCases.js`
- `apps/dgfy-api/device-bridge/receipts/receiptFormatter.js`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/components/ShiftCloseSummaryPrintView.jsx`
- `apps/dgfy-web/src/features/pos/components/ZReadingPrintView.jsx`
- `apps/dgfy-web/src/features/pos/hardware/drivers/iminNativeDriver.js`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-migration-runner/migrations/20260421000002-remediate-pos-shift-location-backfill.cjs`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0053-pluggable-pos-hardware-device-drivers.md`

Phase 41 is complete. The next eligible governed phase is Phase 42.

## Phase 42 Release Integration, Traceability, And Develop PR (In Progress)

### Objective and Scope

- Preserve the Phase 23 through Phase 41 implementation as intentional,
  dependency-ordered domain commits instead of one mixed release commit.
- Reconcile the feature branch with the latest `dgfy-platform/develop` while
  preserving valid local and upstream behavior and resolving conflicts safely.
- Validate tenant migrations, architecture boundaries, documentation, backend
  and frontend behavior, production builds, and maintained browser flows before
  publishing the branch.
- Give every confirmed bug fix GitHub traceability by updating an existing
  matching issue or creating a non-duplicate issue with root cause, fix, and
  validation evidence.
- Push only the feature branch and open a draft pull request targeting
  `develop`; this phase does not authorize staging, `main`, or production
  promotion.

### Status

- `in_progress`

### Dependencies

- Phase 40 Release Scope Containment and its five release slices.
- Phase 41 POS Financial, Branding, And Hardware Audit Contracts.
- `docs/ai/PR.md` commit and pull-request conventions.
- The authoritative Release Candidate Policy and architecture guardrails.

### Acceptance and Validation Evidence

- [ ] All legitimate local source is committed in reviewable domain batches;
  credentials, generated artifacts, and prohibited markers are excluded.
- [ ] The latest `dgfy-platform/develop` is merged and all conflicts are
  resolved without dropping validated local or upstream behavior.
- [ ] Pending migrations pass registry, forward-application, compatibility,
  and isolated tenant-schema validation.
- [ ] Architecture, documentation, backend, frontend, build, and maintained
  Playwright gates pass, or any environmental limitation is recorded honestly.
- [ ] Matching GitHub issues contain root cause, implementation, validation,
  and pull-request traceability without duplicate issue creation.
- [ ] The feature branch is pushed and a template-compliant draft pull request
  targets `develop` with explicit residual risks and exclusions.

### Implementation Links

- `docs/features/POS_RELEASE_HARDENING_PHASE_40_SCOPE.md`
- `docs/ops/RELEASE_CANDIDATE_POLICY.md`
- `.github/pull_request_template.md`
