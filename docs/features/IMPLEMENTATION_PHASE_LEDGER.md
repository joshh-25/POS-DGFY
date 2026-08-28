---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-26
review_by: 2027-02-15
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
| 80 | POS Financial and Release Hardening / Release 1 | Make split-payment totals server-authoritative, protect shift close from funded unresolved sessions, restore server-side session discovery and strict scope, close runtime-schema blind spots, and remove production dependency advisories. | `completed` | Phases 58-69, 74, 79; final change audit | 2026-08-13; 101 backend regressions, 516 POS frontend tests, production builds, runtime/schema checks, governance gates, and zero production audit findings |

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

## Phase 42 Release Integration, Traceability, And Develop PR (Completed)

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

- `completed`
- Completion date: 2026-08-11

### Dependencies

- Phase 40 Release Scope Containment and its five release slices.
- Phase 41 POS Financial, Branding, And Hardware Audit Contracts.
- `docs/ai/PR.md` commit and pull-request conventions.
- The authoritative Release Candidate Policy and architecture guardrails.

### Acceptance and Validation Evidence

- [x] All legitimate local source is committed in reviewable domain batches;
  credentials, generated artifacts, and prohibited markers are excluded.
- [x] The latest `dgfy-platform/develop` is merged and all conflicts are
  resolved without dropping validated local or upstream behavior.
- [x] Pending migrations pass registry, forward-application, compatibility,
  and isolated tenant-schema validation.
- [x] Architecture, documentation, backend, frontend, build, and maintained
  Playwright gates pass, or any environmental limitation is recorded honestly.
- [x] Matching GitHub issues contain root cause, implementation, validation,
  and pull-request traceability without duplicate issue creation.
- [x] The feature branch is pushed and a template-compliant draft pull request
  targets `develop` with explicit residual risks and exclusions.

### Implementation Links

- `docs/features/POS_RELEASE_HARDENING_PHASE_40_SCOPE.md`
- `docs/ops/RELEASE_CANDIDATE_POLICY.md`
- `.github/pull_request_template.md`
- Merge commit `32c237e52` reconciles `dgfy-platform/develop` at `4f664a5f6`.
- Focused backend validation: 12 suites and 132 tests passed, including isolated
  tenant sales reconciliation and migration coverage.
- Focused POS/frontend validation: 17 files and 118 tests passed after merge;
  the full frontend run passed 272 of 290 files and 1,580 of 1,656 tests, with
  inherited failures recorded for draft-PR follow-up rather than hidden.
- Production builds and the frontend route budget gate passed; POS checkout is
  149.8 KB / 154 KB and TerminalPage is 115.7 KB / 116 KB.
- Authenticated cashier Resume Shift Playwright and deterministic desktop/mobile
  F&B modifier Playwright passed on 2026-08-11.
- GitHub issues: `#335`, `#336`, and `#337`; existing related issues remain the
  canonical trace for Storefront cart, PayMongo, delivery, and printer branding.
- Draft pull request: `https://github.com/Sieitzz/dgfy-platform/pull/338`.

Phase 42 is complete. The next eligible governed phase is Phase 43.

## Phase 43 PR 338 CI Contract Repair (In Progress)

### Objective and Scope

- Repair the two blocking PR quality jobs without weakening lint, security,
  migration, build, or browser gates.
- Keep Storefront bundle analysis opt-in, reset the DGFY Business POS modal by
  component lifecycle, and align security contracts with centralized payment
  processing and migration ownership.

### Status

- `in_progress`

### Dependencies

- Phase 42 Release Integration, Traceability, And Develop PR.
- Draft pull request `https://github.com/Sieitzz/dgfy-platform/pull/338`.

### Acceptance and Validation Evidence

- [x] Frontend lint has zero errors and the normal Storefront build passes.
- [x] DGFY Business modal tests pass without synchronous effect state resets.
- [x] PayMongo revenue security verifies signature ordering through the
  verified paid-session use case.
- [x] Tenant credential security resolves the authoritative migration-runner
  migration path.
- [ ] Updated commits are pushed and both blocking GitHub Actions jobs pass.

### Implementation Links

- `apps/dgfy-web/apps/store/vite.config.js`
- `apps/dgfy-web/apps/store/src/customer-dashboard/components/BusinessPosLaunchModal.jsx`
- `apps/dgfy-api/tests/tenantRevenue.security.contract.test.js`
- `apps/dgfy-api/tests/tenantCredentialSurface.security.test.js`
- `docs/compliance/impact-declarations/2026-08-11-pr338-ci-contract-repair.md`

## Phase 44 POS Sales History Contract (In Progress)

### Objective and Scope

- Make the POS History default a sales view containing only financially
  recognized transactions: `status=completed` and `payment_status=paid`.
- Keep voided transactions searchable through a separate History view and keep
  local pending-sync transactions discoverable without an unnecessary API
  request.
- Add an additive `payment_status` filter to the POS transaction endpoint so
  the POS can classify sales without deleting or rewriting unpaid, rejected,
  or pending order data.
- Do not modify SKUpervisor behavior or source files.

### Status

- `in_progress`

### Dependencies

- Phase 43 PR 338 CI Contract Repair remains an independent release gate and
  is still `in_progress`; Phase 44 does not depend on its source changes.
- `docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`
- `docs/architecture/adr/0053-pluggable-pos-hardware-device-drivers.md`

### Acceptance and Validation Evidence

- [x] POS default and completed history queries request only completed, paid
  transactions.
- [x] Voided history remains queryable without a paid-sales filter.
- [x] Pending-sync history remains local-only and does not call the server.
- [x] The backend validates and applies the additive `payment_status` filter.
- [x] POS production build, targeted lint, documentation lint, and architecture
  guardrails pass.
- [x] Direct Playwright rendering confirms the POS locked shell, login panel,
  and POS Catalog render without page errors.
- [ ] The existing `npm run smoke:pos-terminal-ui` harness still waits for a
  `Current Sale` heading before login, but the current locked shell does not
  render that heading; this pre-existing harness mismatch remains open.

### Implementation Links

- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/tests/posValidator.transactionsQuery.test.js`
- `apps/dgfy-web/src/features/pos/utils/posHistoryQuery.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posHistoryQuery.test.js`

Phase 44 is in progress. The next eligible governed phase is Phase 45.

## Phase 45 POS History UI Simplification (Completed)

### Objective and Scope

- Keep the primary POS History list focused on sales identity, payment status,
  amount, and the available receipt action.
- Remove receipt-print state badges from the main sales list so a paid sale is
  not presented as `Receipt Pending` merely because no printer event exists.
- Preserve receipt preview and printing as explicit actions opened from the
  selected row.
- Do not change receipt audit persistence, receipt printing behavior, backend
  payment classification, or SKUpervisor source files.

### Status

- `completed`
- Completion date: 2026-08-12

### Dependencies

- Phase 44 POS Sales History Contract.
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`
- `docs/architecture/adr/0053-pluggable-pos-hardware-device-drivers.md`

### Acceptance and Validation Evidence

- [x] The primary POS History table no longer renders receipt-print status
  badges.
- [x] Payment status remains visible independently from payment method.
- [x] The View Receipt row action remains available for receipt preview and
  separate printing.
- [x] Focused tests, POS production build, targeted lint, documentation and
  architecture checks, and direct rendered POS verification pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `docs/reference/DGFY_STANDALONE_POS_BUTTON_FLOW_CATALOG.md`

### Completion Record (2026-08-12)

- Removed receipt-print status badges from the primary POS History table while
  retaining payment status and the existing View Receipt action.
- Preserved receipt preview and printing as explicit receipt-view actions; no
  receipt audit or printer behavior was changed.
- Validation passed: 57 focused frontend assertions, targeted ESLint with no
  errors, POS production build, documentation/ADR lint, architecture
  guardrails, and direct Playwright rendering of the POS terminal shell.

Phase 45 is complete. The next eligible governed phase is Phase 46.

## Phase 46 POS Order History for Unpaid and Rejected Online Orders (Completed)

### Objective and Scope

- Add a POS-only `Order History` tab inside Orders beside the existing Active
  Queue.
- Surface cancelled and rejected online orders, plus completed online orders
  that are not paid, without duplicating financially recognized paid sales in
  POS Sales History.
- Provide location-scoped read-only search and fulfillment/payment filters,
  with a View Order action for operational review.
- Keep active fulfillment statuses in the existing Incoming Queue and do not
  modify SKUpervisor or its item/order screens.

### Status

- `completed`
- Completion date: 2026-08-12

### Dependencies

- Phase 45 POS History UI Simplification.
- `docs/architecture/adr/0031-online-order-fulfillment-lifecycle.md`
- `docs/architecture/adr/0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md`
- `docs/architecture/adr/0045-shared-pos-receipt-renderer.md`

### Acceptance and Validation Evidence

- [x] `GET /pos/order-history` validates filters, enforces POS view permission,
  resolves the authorized location scope, and returns paginated exception orders.
- [x] Rejected/cancelled orders are visible regardless of payment state, while
  completed paid sales remain only in Sales History.
- [x] Orders shows Active Queue and Order History tabs without changing active
  queue status transitions or payment collection actions.
- [x] Focused backend/frontend tests, POS build, lint, documentation and
  architecture checks pass.
- [x] Direct Playwright rendering records the POS shell health signals; any
  authentication-only limitation is reported with the exact expected 401.

### Implementation Links

- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/tests/posOrderHistory.usecase.test.js`
- `apps/dgfy-api/tests/posValidator.orderHistoryQuery.test.js`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx`
- `apps/dgfy-web/src/features/pos/components/OnlineOrderDetailsModal.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `docs/api/specification.md`
- `docs/reference/DGFY_STANDALONE_POS_BUTTON_FLOW_CATALOG.md`

### Completion Record (2026-08-12)

- Added the POS-only Orders → Order History tab for rejected, cancelled, and
  completed-but-unpaid online orders, with invoice search, fulfillment/payment
  filters, pagination metadata, empty/error/loading states, and read-only View
  Order details.
- Added the location-scoped `/pos/order-history` backend contract and kept
  completed paid sales in `/pos/transactions` so Sales History remains clean.
- Validation passed: 6 focused backend tests, 57 focused frontend assertions,
  targeted ESLint with no errors, POS production build, documentation/ADR lint,
  architecture guardrails, API route authentication probe, and direct
  Playwright rendering with no page errors or HTTP 5xx responses.
- No SKUpervisor files were changed by Phase 46.

Phase 46 is complete. The next eligible governed phase is Phase 47.

## Phase 47 POS Order History Pagination and Filter Continuity (Completed)

### Objective and Scope

- Expose the existing `/pos/order-history` pagination contract in the POS
  Orders → Order History tab.
- Add Previous/Next page controls and preserve invoice, fulfillment, and
  payment filters while navigating pages.
- Reset to page 1 when a new filter set is applied.
- Keep the scope POS-only; do not change SKUpervisor, the active queue
  lifecycle, or payment/fulfillment state transitions.

### Status

- `completed`
- Completion date: 2026-08-12

### Dependencies

- Phase 46 POS Order History for Unpaid and Rejected Online Orders.
- `docs/architecture/adr/0031-online-order-fulfillment-lifecycle.md`

### Acceptance and Validation Evidence

- [x] The POS sends the selected history page and keeps active filters when
  navigating Previous/Next.
- [x] Applying filters resets the history list to page 1.
- [x] Pagination controls are disabled at the first/last page and during a
  refresh.
- [x] Focused tests, POS build, lint, documentation and architecture checks,
  and direct Playwright health verification pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `docs/reference/DGFY_STANDALONE_POS_BUTTON_FLOW_CATALOG.md`

### Completion Record (2026-08-12)

- Added POS Previous/Next controls backed by the existing order-history page
  and total-pages metadata. Filter values remain active when paging and new
  filters reset the list to page 1.
- Validation passed: 58 focused frontend assertions, targeted ESLint with no
  errors, POS production build, documentation/ADR lint, architecture
  guardrails, and direct Playwright rendering with no page errors or HTTP 5xx
  responses.
- No SKUpervisor files were changed by Phase 47.

Phase 47 is complete. The next eligible governed phase is Phase 48.

## Phase 48 POS Order History Query Integrity (Completed)

### Objective and Scope

- Add repository-level regression coverage for the POS Order History inclusion
  and exclusion rules.
- Prove that rejected/cancelled online orders remain visible, completed paid
  sales remain excluded, and completed non-paid orders remain included.
- Verify location, invoice search, fulfillment/payment filters, and pagination
  are applied together.
- Keep the scope POS-only; do not change SKUpervisor, order state transitions,
  payment state transitions, or database data.

### Status

- `completed`
- Completion date: 2026-08-12

### Dependencies

- Phase 47 POS Order History Pagination and Filter Continuity.
- `docs/architecture/adr/0031-online-order-fulfillment-lifecycle.md`

### Acceptance and Validation Evidence

- [x] Repository tests assert the exception-order predicate and prevent paid
  completed sales from entering Order History.
- [x] Repository tests assert location/search/status/payment filters and page
  offsets.
- [x] Focused backend/frontend tests, lint, architecture checks, and direct
  Playwright health verification pass.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/tests/posOrderHistory.repository.test.js`

### Completion Record (2026-08-12)

- Added repository regression coverage proving Order History includes rejected,
  cancelled, and completed non-paid online orders while excluding completed
  paid sales. Location, invoice search, status/payment filters, and page
  offsets are asserted together.
- Validation passed: 8 focused backend assertions, 58 focused frontend
  assertions, targeted ESLint with no errors, POS production build,
  documentation/ADR lint, architecture guardrails, and direct Playwright
  rendering with no page errors or HTTP 5xx responses.
- No SKUpervisor files were changed by Phase 48.

Phase 48 is complete. The next eligible governed phase is Phase 49.

## Phase 49 POS Order History Transport and Permission Contract (Completed)

### Objective and Scope

- Lock down the POS controller response contract for successful paginated Order
  History reads and standardized failures.
- Verify the route requires `pos:view` permission and runs query validation
  before the controller.
- Keep the scope transport/test-only; do not change order data, fulfillment or
  payment transitions, SKUpervisor, or the existing repository/use-case rules.

### Status

- `completed`
- Completion date: 2026-08-12

### Dependencies

- Phase 48 POS Order History Query Integrity.
- `docs/architecture/adr/0031-online-order-fulfillment-lifecycle.md`

### Acceptance and Validation Evidence

- [x] Controller tests assert the paginated success payload and forwarded query
  plus user context.
- [x] Controller tests assert the standardized authorization failure payload.
- [x] Route contract tests assert POS view permission and query validation.
- [x] Focused tests, lint, architecture checks, and direct Playwright health
  verification pass.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/tests/posHandlers.transport.test.js`
- `apps/dgfy-api/tests/posOrderHistory.route.contract.test.js`

### Completion Record (2026-08-12)

- Added POS controller transport coverage for paginated Order History success
  responses, forwarded user/query context, and standardized authorization
  failures. Added a route contract for `pos:view` permission and query
  validation.
- Validation passed: 34 focused backend assertions, 58 focused frontend
  assertions, targeted ESLint with no errors, documentation/ADR lint,
  architecture guardrails, and direct Playwright rendering with no page
  errors or HTTP 5xx responses.
- No SKUpervisor files were changed by Phase 49.

Phase 49 is complete. The next eligible governed phase is Phase 50.

## Phase 50 Remove Receipt Pending Badge from SKUpervisor-Linked POS History (Completed)

### Objective and Scope

- Remove the misleading receipt-print status badge from the exact POS History
  surface shown in the user report.
- Keep payment status, receipt preview, print actions, receipt audit data, and
  transaction records unchanged.
- This phase is explicitly approved to modify the SKUpervisor-linked history
  component because that is where the visible label is rendered.

### Status

- `completed`

### Dependencies

- Phase 49 POS Order History Transport and Permission Contract.
- User approval received on 2026-08-12 for the SKUpervisor-linked component.

### Acceptance and Validation Evidence

- [x] The SKUpervisor-linked POS History list no longer renders `Receipt
  Pending`, `Receipt Printed`, or `Receipt Failed` badges.
- [x] Payment and receipt actions remain available.
- [x] Focused frontend contract test, SKUpervisor build, POS build, lint, and
  Playwright health verification pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/SkupervisorPOSTransactionHistoryPanel.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/skupervisorHistoryReceiptStatus.contract.test.js`

### Completion Record (2026-08-12)

- Removed the receipt-print status badge from the approved SKUpervisor-linked
  POS History UI only.
- Preserved payment status, View Receipt, print controls, receipt audit data,
  and transaction records.
- Validation passed: 56 focused frontend assertions, targeted ESLint, POS and
  SKUpervisor production builds, documentation/ADR lint, architecture
  guardrails, and direct Playwright rendering checks.

Phase 50 is complete. The next eligible governed phase is Phase 51.

## Phase 51 Remove Receipt Status from Online-Order Panels (Completed)

### Objective and Scope

- Remove receipt-print status text from the active online-order detail panels
  that still showed `Receipt Pending`, `Not printed`, or `Print failed`.
- Keep payment status, receipt preview, Print/Reprint actions, receipt audit
  data, and transaction records unchanged.
- Limit the change to the POS online-order presentation layer.

### Status

- `completed`

### Dependencies

- Phase 50 Remove Receipt Pending Badge from SKUpervisor-Linked POS History.
- User approval received on 2026-08-12 for the online-order panels.

### Acceptance and Validation Evidence

- [x] Active online-order panels no longer render receipt-print status text.
- [x] Payment status and Print/Reprint actions remain available.
- [x] Focused frontend contract test, targeted lint, POS/SKUpervisor builds,
  and Playwright health verification pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalSidebarPanel.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`

### Completion Record (2026-08-12)

- Removed receipt-print status text from both approved online-order detail
  panels while preserving payment status and Print/Reprint actions.
- Preserved receipt audit data and transaction records; this was a UI-only
  change.
- Validation passed: 56 focused frontend assertions, targeted ESLint,
  POS/SKUpervisor production builds, documentation/ADR lint, architecture
  guardrails, direct Playwright rendering checks, and production-bundle text
  verification.

Phase 51 is complete. The next eligible governed phase is Phase 52.

## Phase 52 POS Parked Sale Contract and Shift-Safe Resume (Completed)

### Objective and Scope

- Define the POS `Park & New Sale` lifecycle so a cashier can persist the
  current cart, immediately start a fresh sale, and manually resume a parked
  cart later when needed.
- Preserve the user's add-only interaction intent: parking never auto-loads a
  prior cart and never replaces the newly started sale.
- Establish ownership, lifecycle states, idempotency, snapshot contents,
  revalidation, offline behavior, inventory/financial boundaries, and shift
  close handling before implementation work begins.
- Do not add the Park button, API routes, database migration, or frontend
  persistence in this contract phase.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 51 POS receipt-status presentation cleanup.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0005-unified-sales-read-model.md`
- `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- Phase 43 and Phase 44 retain their explicit independent release gates and
  are not silently marked complete by this POS product initiative. Their open
  gates do not change the Phase 52 contract scope.

### Acceptance and Validation Evidence

- [x] The parked-sale lifecycle and manual-resume contract are recorded in
  ADR 0061.
- [x] Parked carts are explicitly excluded from financial, inventory, receipt,
  Z-reading, and unified Sales effects until checkout.
- [x] Tenant, location, cashier, terminal, and shift ownership boundaries are
  defined, including audited recovery behavior.
- [x] Idempotency, offline replay, resume revalidation, and shift-close rules
  are defined before implementation.
- [x] Phase 52 documentation and ADR checks pass.

### Implementation Links

- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`

### Completion Record (2026-08-12)

- Added ADR 0061 defining the manual `Park & New Sale` contract, explicit
  lifecycle states, cashier/terminal/location/shift scope, idempotency,
  revalidation, offline replay, shift-close handling, and no-financial-effect
  boundaries before checkout.
- Preserved the open Phase 43 and Phase 44 release gates as independent
  in-progress records; neither was falsely marked complete.
- Validation passed: `npm run check:adr -- --write-index`, `npm run lint:docs`,
  and `git diff --check` (only pre-existing CRLF normalization warnings in
  unrelated modified files were reported).

Phase 52 is complete. The next eligible governed phase is Phase 53: Durable
Parked Sale Backend and Data Foundation.

## Phase 53 Durable Parked Sale Backend and Data Foundation (Completed)

### Objective and Scope

- Implement the tenant-local parked-sale persistence foundation defined by ADR
  0060 without creating financial, payment, receipt, Z-reading, or inventory
  effects before checkout.
- Add the additive migration, tenant model/association graph, repository
  contract, and POS use cases for create/list/claim/cancel lifecycle actions.
- Expose POS-scoped API contracts with existing `pos:view` and `pos:transact`
  permissions, open-shift ownership checks, location/terminal validation,
  secret-scrubbed immutable snapshots, bounded payloads, and idempotent retry
  behavior.
- Keep the cashier Park button, resume UI, offline replay UI, checkout
  completion transition, and shift-close UX in later phases.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 52 POS parked-sale lifecycle and shift-safe resume contract.
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- `docs/database/schema.md`
- Phase 43 and Phase 44 retain their explicit independent release gates and
  are not silently marked complete by this POS product initiative.

### Acceptance and Validation Evidence

- [x] Additive `pos_parked_sales` migration is loadable, tenant-schema
  coverage-registered, and includes lifecycle status, idempotency, snapshot,
  ownership, location, claim, completion, and cancellation fields.
- [x] Tenant model factory registers `PosParkedSale` and the location
  reference-source manifest includes permanent-delete protection.
- [x] Repository contract covers idempotency lookup, create, list, read,
  update, and active-shift count operations.
- [x] POS use cases enforce authenticated cashier/open-shift ownership,
  terminal/location matching, snapshot validation and secret scrubbing,
  idempotency conflict handling, claim locking, and auditable cancellation.
- [x] POS routes expose create/list/claim/cancel contracts using existing
  permission gates and validators; no checkout or inventory command is called.
- [x] Focused Jest validation passed: 7 suites, 52 tests, including parked
  sale use cases, repository, route/validator, schema/migration, tenant model,
  and affected POS transport contracts.
- [x] Targeted ESLint, POS route import, migration load, architecture
  guardrails, controller boundaries, tenant-schema coverage, docs lint, ADR
  lint, and `git diff --check` passed.

### Implementation Links

- `apps/dgfy-api/src/models/PosParkedSale.js`
- `apps/dgfy-api/src/models/index.js`
- `apps/dgfy-migration-runner/migrations/20260812000001-create-pos-parked-sales.cjs`
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/tests/posParkedSale.usecases.test.js`
- `apps/dgfy-api/tests/posParkedSale.repository.test.js`
- `apps/dgfy-api/tests/posParkedSale.route.contract.test.js`
- `apps/dgfy-api/tests/posParkedSale.schema.contract.test.js`

### Completion Record (2026-08-12)

- Added durable parked-sale storage and tenant-safe lifecycle APIs. Parked
  carts remain outside transaction, payment, receipt, fiscal, and inventory
  ledgers until a later checkout-completion phase.
- Added a missing compatibility-facade export for the existing POS order
  history handler so the POS router imports cleanly alongside the new routes.
- Phase 53 is complete. The next eligible governed phase is Phase 54: POS
  Park button and add-only cashier flow.

## Phase 54 POS Park Button and Add-Only Cashier Flow (Completed)

### Objective and Scope

- Add a cashier-facing `Park & New Sale` action to the active POS checkout
  terminal.
- Persist the current cart through the Phase 53 parked-sale API with the
  current shift, terminal, location, totals, and a secret-scrubbed cart/form
  snapshot.
- Clear the scoped local cart draft and reset sale-only fields only after the
  server confirms the parked sale, then leave the cashier on an empty sale.
- Preserve the active cart when validation, connectivity, or API submission
  fails.
- Keep parked-sale retrieval, manual resume/claim UI, offline replay, checkout
  completion, and shift-close handling out of this phase.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 53 Durable Parked Sale Backend and Data Foundation.
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- Phase 43 and Phase 44 retain their explicit independent release gates and
  are not silently marked complete by this POS product initiative.

### Acceptance and Validation Evidence

- [x] The checkout terminal exposes an explicit `Park & New Sale` button with
  loading and disabled states for missing cart, shift, terminal, permission,
  or locked-terminal conditions.
- [x] The frontend service posts to `/pos/parked-sales` with the registered
  terminal header and returns the created parked-sale record.
- [x] The request includes an idempotency key, shift/terminal/location scope,
  cart snapshot, and current subtotal/total values without payment secrets or
  manager PIN data.
- [x] A confirmed server response clears the scoped cart draft and resets
  sale-only fields; failures and offline attempts leave the cart untouched.
- [x] The Phase 54 component contains no parked-sale retrieval, claim, or
  automatic cart-replacement behavior.
- [x] Focused Vitest validation passed: 2 suites, 5 tests covering the API
  contract, terminal header, success reset ordering, failure preservation,
  offline protection, and add-only scope.
- [x] Targeted ESLint, `git diff --check`, and the POS production build passed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-web/src/features/pos/services/__tests__/posParkedSale.service.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posParkedSale.contract.test.js`

### Completion Record (2026-08-12)

- Added the additive cashier Park action and a fresh-sale reset path. The cart
  remains open until the durable parked-sale request succeeds, and no parked
  sale is retrieved or automatically loaded into the new sale.
- Validation passed: focused Vitest (5 tests), targeted ESLint, POS production
  build (`vite build --config apps/pos/vite.config.js`), and `git diff --check`.

Phase 54 is complete. The next eligible governed phase is Phase 55: Manual
parked-sale list, resume, and claim workflow.

## Phase 55 Manual Parked-Sale List, Resume, and Claim Workflow (Completed)

### Objective and Scope

- Give cashiers an explicit `Parked Sales` queue for the active POS shift.
- Load only tenant/location/shift-scoped active parked records when the queue
  is opened; do not retrieve or replace the active cart automatically.
- Require an empty active cart and an explicit cashier action before calling
  the Phase 53 claim endpoint.
- Preflight the parked snapshot against the current POS catalog, stock,
  selling price, order-method workflow, discount profile, and F&B modifier
  availability before claim.
- Hydrate the claimed cart and sale context back into checkout only after the
  server confirms the exclusive claim. Governed employee/manual discounts must
  be approved again because PINs are never stored in parked snapshots.
- Keep parked-sale cancellation, offline replay, checkout completion, and
  shift-close resolution out of this phase.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 54 POS Park button and add-only cashier flow.
- Phase 53 Durable Parked Sale Backend and Data Foundation.
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- Phase 43 and Phase 44 retain their explicit independent release gates and
  are not silently marked complete by this POS product initiative.

### Acceptance and Validation Evidence

- [x] Checkout exposes an explicit `Parked Sales` action and the dialog lists
  active parked/claimed records for the current open shift and location.
- [x] The frontend uses `GET /pos/parked-sales` and
  `POST /pos/parked-sales/:id/claim` with the registered terminal header.
- [x] Resume is blocked while the active cart contains lines, when the
  terminal/permission context is unavailable, or when catalog/stock/price/
  order-method/discount/modifier preflight reports a conflict.
- [x] A successful claim restores the cart and sale context and returns the
  cashier to checkout; a failed claim leaves the active cart unchanged.
- [x] Claimed records from another terminal are visibly marked in use, and
  the UI never merges a parked snapshot into an existing cart.
- [x] Focused Vitest validation passed: 3 suites, 10 tests covering list and
  claim service contracts, resume conflict detection, cart hydration, empty
  cart gating, explicit loading, and no automatic replacement.
- [x] Targeted ESLint, POS production build, and `git diff --check` passed.
- [x] Rendered POS smoke verification passed across desktop, tablet, and
  mobile locked-terminal states with no page errors or HTTP 5xx responses.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSParkedSalesDialog.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-web/src/features/pos/utils/posParkedSaleResume.js`
- `apps/dgfy-web/src/features/pos/services/__tests__/posParkedSale.service.test.js`
- `apps/dgfy-web/src/features/pos/utils/__tests__/posParkedSaleResume.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posParkedSalesDialog.contract.test.js`

### Completion Record (2026-08-12)

- Added the manual parked-sale queue and exclusive claim flow. The active
  checkout remains authoritative until the cashier explicitly resumes a
  validated parked sale.
- Preserved secret-scrubbing boundaries: employee/manual discount approvals
  are intentionally reset for fresh verification after resume.
- Validation passed: focused Vitest (10 tests), targeted ESLint, POS
  production build (`vite build --config apps/pos/vite.config.js`), and
  `git diff --check`. The live POS route also rendered cleanly across desktop,
  tablet, and mobile; the local session was terminal-locked, so the
  authenticated queue interaction remains covered by focused contracts rather
  than a live claim.

Phase 55 is complete. The next eligible governed phase is Phase 56: Offline
parked-sale replay and shift-close resolution.

## Phase 56 Offline Parked-Sale Replay and Shift-Close Resolution (Completed)

### Objective and Scope

- Extend the Phase 54 additive Park action to work while the terminal is
  offline by writing a tenant/terminal/location/user-scoped `parked_sale`
  intent to the existing durable terminal operation queue.
- Replay queued parked sales only through the existing operator-controlled
  Sync action; reconnect, page load, and service-worker events must not submit
  them automatically.
- Show pending parked-sale sync work on the checkout surface and preserve the
  active cart if queue persistence fails.
- Provide an explicit cashier cancellation action for active parked sales.
- Prevent normal and stale-recovery shift close from silently leaving active
  server parked sales or unresolved local parked-sale intents behind.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 54 additive Park and new-sale flow.
- Phase 55 explicit parked-sale list, resume, and exclusive claim workflow.
- Existing terminal operation queue and manual Sync policy.
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`

### Acceptance and Validation Evidence

- [x] Offline Park persists a `parked_sale` intent with the same idempotency
  key, shift, terminal, location, snapshot, and totals used by the online
  parked-sale API; the cart resets only after queue persistence succeeds.
- [x] Manual Sync replays `parked_sale` intents through
  `createPosParkedSale`; no reconnect/page-load/service-worker auto-submit was
  added, and replay remains idempotent through the server contract.
- [x] Checkout visibly reports pending POS records and exposes an operator
  Sync action.
- [x] Parked Sales includes a reasoned cancel action backed by
  `POST /pos/parked-sales/:id/cancel`.
- [x] Client close preflight checks unresolved local parked-sale queue entries
  and active server parked/claimed sales; the close dialog explains how to
  resume, cancel, or sync the blocking work.
- [x] Backend normal close and stale-shift recovery atomically reject active
  parked sales with reason code `POS_PARKED_SALES_UNRESOLVED`.
- [x] Focused Vitest validation passed: 4 suites, 15 tests for parked-sale
  service, add-only park, resume, and dialog contracts, including
  cancellation and offline queue/pending visibility.
- [x] Focused Jest validation passed: 2 suites, 13 tests covering shift-close
  replay parity, the unresolved parked-sale conflict, and stale-recovery
  blocking.
- [x] Targeted ESLint completed with no errors (existing warnings only), POS
  production build passed, backend syntax validation passed, and `git diff
  --check` passed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSParkedSalesDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalPageDialogLayer.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/tests/posOperationReplayParity.usecase.test.js`
- `apps/dgfy-api/tests/posStaleShiftRecovery.usecase.test.js`

### Completion Record (2026-08-12)

- Added operator-controlled offline parked-sale replay, visible pending
  state, explicit cancellation, and close guards at both client and server
  boundaries. Shift close now remains open and actionable until parked work is
  completed, cancelled, or synced.
- Phase 56 is complete. The next eligible governed phase is Phase 57.

## Phase 57 POS Split-Tender Architecture and Payment Contract (Completed)

### Objective and Scope

- Define the V1 cashier flow for one POS sale paid by multiple payment methods.
- Establish the server-owned payment-session and allocation lifecycle before
  adding persistence or UI implementation.
- Preserve existing single-tender checkout, parked-sale, offline, Employee
  Credit, receipt, fiscal, and Unified Sales boundaries.
- Explicitly defer equal split, split by person/item/table, offline split
  payment, provider expansion, and combined Employee Credit tender.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 56 Offline Parked-Sale Replay and Shift-Close Resolution.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- `docs/database/schema.md`
- ADR 0042, ADR 0045, ADR 0051, and ADR 0061.

### Acceptance and Validation Evidence

- [x] ADR 0062 establishes the split-tender architecture, money-integrity
  invariants, scope/permission rules, idempotency, and deferred capabilities.
- [x] The POS split-payment feature contract documents the cashier flow,
  operation semantics, lifecycle states, compatibility boundaries, and close
  recovery behavior.
- [x] API and database documentation describe the additive session/allocation
  contract without prematurely creating implementation routes or tables.
- [x] Existing one-shot checkout, parked-sale, offline, Employee Credit,
  receipt, fiscal, and Unified Sales contracts remain explicitly preserved.
- [x] ADR index, documentation lint, architecture checks, and whitespace
  validation pass.

### Implementation Links

- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/api/specification.md`
- `docs/database/schema.md`

### Completion Record (2026-08-12)

- Phase 57 is complete. No payment tables, routes, or cashier UI were added in
  this contract phase. The next eligible governed phase is Phase 58: Durable
  Split-Payment Persistence Foundation.

## Phase 58 Durable Split-Payment Persistence Foundation (Completed)

### Objective and Scope

- Add additive tenant-local storage for one scoped split-payment collection
  session and its individual tender allocations.
- Register both models, associations, migration DDL, tenant-schema repair DDL,
  and location reference protection.
- Preserve idempotency evidence, payment-method/status enums, cash
  tender/change fields, bounded provider/failure metadata, and parked-sale or
  completed-transaction lineage.
- Keep split-payment routes, payment-engine behavior, checkout completion,
  receipts, reports, refunds, and cashier UI out of this phase.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 57 POS Split-Tender Architecture and Payment Contract.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/database/schema.md`

### Acceptance and Validation Evidence

- [x] `PosPaymentSession` and `PosPaymentAllocation` are tenant models with
  the governed lifecycle, method, money, scope, idempotency, and audit fields.
- [x] Migration `20260812000006-create-pos-split-payment-sessions.cjs` creates
  both tables additively, in dependency order, with restrictive financial
  foreign keys and safe rollback ordering.
- [x] Tenant schema repair registry includes both tables with matching DDL;
  model-factory and location permanent-delete reference coverage are updated.
- [x] No route, controller, use case, checkout, inventory, receipt, fiscal,
  report, refund, or offline replay behavior was enabled.
- [x] Focused schema/model contract tests, tenant-schema coverage, targeted
  lint, architecture guardrails, documentation/ADR checks, and whitespace
  validation pass.

### Implementation Links

- `apps/dgfy-api/src/models/PosPaymentSession.js`
- `apps/dgfy-api/src/models/PosPaymentAllocation.js`
- `apps/dgfy-api/src/models/index.js`
- `apps/dgfy-migration-runner/migrations/20260812000006-create-pos-split-payment-sessions.cjs`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js`
- `apps/dgfy-api/tests/posSplitPayment.schema.contract.test.js`

### Completion Record (2026-08-12)

- Added the durable session/allocation schema foundation without creating any
  financial side effect. The next eligible governed phase is Phase 59:
  Server Split-Payment Payment Engine and Transport Contract.

## Phase 59 Server Split-Payment Payment Engine and Transport Contract (Completed)

### Objective and Scope

- Add the server-owned POS split-payment session and allocation transport on
  top of the Phase 58 tenant tables.
- Enforce cashier/open-shift/terminal/location scope, permission boundaries,
  idempotency request hashes, locked balance recalculation, cash tender/change,
  pending digital outcomes, and auditable cancellation state.
- Provide session creation/read, allocation recording, allocation cancellation,
  and unpaid-session cancellation without posting a POS transaction,
  inventory movement, receipt, fiscal event, report total, or refund.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 58 Durable Split-Payment Persistence Foundation.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`

### Acceptance and Validation Evidence

- [x] Session create/resume is idempotent and scoped to the authenticated
  cashier's open shift, terminal, and location.
- [x] Allocation recording is lock-protected, recalculates paid/remaining from
  successful allocation rows, rejects non-cash client-side success claims,
  and calculates cash change without treating it as revenue.
- [x] Allocation/session cancellation preserves persisted evidence and requires
  a reason; sessions with successful money cannot be silently cancelled.
- [x] New routes use existing POS permissions, validators, controllers,
  repository contract, and application-result transport conventions.
- [x] Focused split-payment use-case, route, and repository tests pass; targeted
  lint, `node --check`, architecture, documentation, and whitespace gates pass.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/controllers/posController.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`
- `apps/dgfy-api/tests/posSplitPayment.route.contract.test.js`
- `apps/dgfy-api/tests/posSplitPayment.repository.test.js`

### Completion Record (2026-08-12)

- Phase 59 transport and server payment engine are complete without enabling
  final checkout posting. The next eligible governed phase is Phase 60:
  Cashier Split-Payment Collection UI.

## Phase 60 Cashier Split-Payment Collection UI (Completed)

### Objective and Scope

- Add a cashier-facing Split Payment entry point inside the existing POS
  checkout confirmation flow.
- Resume the server-owned session after refresh using tenant/cashier/terminal/
  shift/location-scoped local session identity, then re-read the server balance.
- Display total, paid, remaining, allocation status, cash change, digital
  provider reference, pending confirmation, allocation cancellation, and
  unpaid-session cancellation states.
- Keep the existing single-tender checkout unchanged and do not post a POS
  transaction, inventory movement, receipt, fiscal event, refund, or offline
  split operation.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 59 Server Split-Payment Payment Engine and Transport Contract.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`

### Acceptance and Validation Evidence

- [x] Existing checkout opens Split Payment without changing the one-shot
  checkout action.
- [x] The dialog creates/resumes the scoped server session and never derives
  paid or remaining from local UI arithmetic.
- [x] Cash, GCash, Maya, Card, and Bank Transfer inputs are represented;
  digital references are required and pending confirmation is visible.
- [x] Allocation cancellation and unpaid-session cancellation preserve the
  server audit contract and provide reason input.
- [x] Refresh recovery is covered by scoped local session identity plus a
  server GET; the server remains authoritative when local state is stale.
- [x] Focused service/UI contract tests pass, POS production build passes, and
  frontend lint reports no errors (existing warnings remain).

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-web/src/features/pos/services/__tests__/posSplitPayment.service.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`

### Completion Record (2026-08-12)

- Phase 60 cashier collection UI is complete. The next eligible governed phase
  is Phase 61: Atomic Split-Payment Checkout Completion and Inventory Posting.

## Phase 61 Atomic Split-Payment Checkout Completion and Inventory Posting (Completed)

### Objective and Scope

- Add the final `Complete Sale` operation to the server-owned split-payment
  session flow.
- Require a fully paid, unresolved-allocation-free session and revalidate its
  stored checkout inputs through the existing POS checkout engine.
- Commit one POS transaction, one set of inventory movements, receipt/fiscal
  evidence, and the session/parked-sale completion linkage in one database
  transaction.
- Preserve normal single-tender checkout behavior and keep pending digital
  allocations blocked until provider confirmation.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 60 Cashier Split-Payment Collection UI.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`

### Acceptance and Validation Evidence

- [x] Completion is scoped to the authenticated cashier's open shift,
  terminal, and location and locks the payment session before mutation.
- [x] Completion rejects zero/negative balance, pending/failed allocations,
  cancelled sessions, and stale totals before committing financial effects.
- [x] The existing POS checkout engine accepts a caller-owned transaction;
  session and parked-sale linkage is written before the shared commit.
- [x] Completion is retry-safe through the session's stable checkout
  idempotency identity and returns the canonical transaction on replay.
- [x] The UI calls the completion endpoint, clears refresh recovery only after
  success, opens the canonical receipt preview, and refreshes catalog/history.
- [x] Focused backend split-payment tests pass (10 tests), focused frontend
  service/UI tests pass (4 tests), POS production build passes, all changed
  backend modules pass `node --check`, and `git diff --check` passes.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/controllers/posController.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`

### Completion Record (2026-08-12)

- Phase 61 is complete. The next eligible governed phase is Phase 62:
  provider-confirmed digital allocation completion and mixed-tender receipt
  reporting hardening.

## Phase 62 Provider-Confirmed Digital Allocation Completion and Mixed-Tender Reporting (Completed)

### Objective and Scope

- Add a separate provider-confirmation operation for pending non-cash payment
  allocations.
- Require server-side HMAC evidence with a bounded confirmation timestamp and
  unique provider event identity; cashier input cannot claim digital success.
- Persist a server-derived successful tender breakdown on the one completed
  POS transaction for mixed-tender receipts, thermal output, reports, and
  Z-reading summaries.
- Keep allocation rows as the financial source of truth and preserve the
  single-transaction, inventory, fiscal, and idempotent completion boundary.

### Status

- `completed`
- Completion date: 2026-08-12
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 61 Atomic Split-Payment Checkout Completion and Inventory Posting.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`

### Acceptance and Validation Evidence

- [x] Pending digital allocations can transition to successful only through
  the authenticated confirmation route and configured server-side verifier;
  invalid, stale, or missing evidence fails closed; same-allocation retries
  are idempotent, and cross-allocation event replays are rejected.
- [x] Provider event identities are persisted uniquely and the allocation
  balance is recomputed under the locked payment-session transaction.
- [x] Atomic split completion stores a normalized `payment_breakdown` JSON
  snapshot derived from successful allocations; client totals and tender
  summaries are not trusted.
- [x] Receipts, thermal receipt text, reports, and Z-readings distinguish
  non-zero mixed tender legs, including Bank Transfer.
- [x] Additive migration and tenant-schema repair coverage include the new
  transaction snapshot and provider-event identity fields.
- [x] Focused backend tests pass (25 tests), receipt/report UI contract tests
  pass (22 tests), backend lint passes with existing warnings only, frontend lint
  reports 0 errors with existing warnings, and changed modules pass syntax and
  whitespace checks.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/services/posPaymentProviderConfirmation.js`
- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/utils/paymentBreakdown.js`
- `apps/dgfy-api/src/models/PosPaymentAllocation.js`
- `apps/dgfy-api/src/models/PosTransaction.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-migration-runner/migrations/20260812000007-add-pos-payment-confirmation-and-breakdown.cjs`
- `packages/pos-receipt/src/index.js`
- `apps/dgfy-web/src/features/pos/components/ReceiptPrintView.jsx`
- `docs/database/schema.md`
- `docs/api/specification.md`
- `apps/dgfy-api/tests/posPaymentProviderConfirmation.test.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`

### Completion Record (2026-08-12)

- Phase 62 is complete. The next eligible governed phase is Phase 63:
  production provider adapter/webhook reconciliation and provider-specific
  replay/refund handling.

## Phase 63 PayMongo Allocation Reconciliation and Refund-Safe Replay (Completed)

### Objective and Scope

- Add a production PayMongo server-to-server reconciliation adapter for
  tenant-local pending digital allocations.
- Require exact provider payment identity, paid status, PHP currency, amount,
  payment method, and POS session/allocation metadata before confirming money.
- Observe full successful provider refunds as append-only allocation reversals
  while the session is incomplete; reject partial-refund automation and never
  submit a provider refund from POS.
- Prevent ordinary cancellation from erasing provider-confirmed digital money,
  preserve successful cash as an auditable reversal, and protect provider
  payment/refund identities from replay.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-12.

### Dependencies and Governance Note

- Phase 62 Provider-Confirmed Digital Allocation Completion and Mixed-Tender Reporting.
- `docs/architecture/adr/0062-pos-split-tender-collection-and-payment-allocation.md`
  (2026-08-12 amendment authorizes bounded read-only PayMongo reconciliation).
- `docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`

### Acceptance and Validation Evidence

- [x] PayMongo reconciliation fails closed on provider status, currency,
  amount, method, payment identity, or POS metadata mismatch.
- [x] Provider payment and refund event identities are replay-safe, including
  rejection when an identity belongs to another allocation.
- [x] Full refunds reverse incomplete-session allocations without deleting
  confirmation evidence; partial refunds remain unchanged for manual review.
- [x] Successful digital allocations cannot be ordinarily cancelled, while
  successful cash cancellation records a reversal and recalculates balance.
- [x] Additive migration, tenant schema repair, runtime audit, route,
  validator, repository, and model contracts cover the new evidence fields.
- [x] Focused backend suites pass (55 tests); backend lint reports 0 errors
  with 7 pre-existing warnings; syntax, whitespace, ADR/docs lint,
  architecture/controller boundaries, tenant schema registry checks, and the
  POS production build pass.
- [x] Main database migrations `20260812000006` through `20260812000008` are
  applied. Additive tenant repair completed for all 14 active tenant databases,
  and the post-repair report returned 14 succeeded and 0 failed.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/services/posPayMongoReconciliation.js`
- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/models/PosPaymentAllocation.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/services/runtimeSchemaAuditService.js`
- `apps/dgfy-migration-runner/migrations/20260812000008-add-pos-provider-refund-reconciliation.cjs`
- `apps/dgfy-api/tests/posPayMongoReconciliation.test.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`

### Completion Record (2026-08-13)

- Phase 63 is complete. The next eligible governed phase is Phase 64:
  provider-native POS payment initiation and signed webhook dispatch into the
  existing reconciliation contract.
- Automatic refund submission, partial-refund allocation, and reversal of a
  completed POS sale remain deferred until their posting, permission, and
  fiscal contracts are explicitly approved.

## Phase 64 Manual Walk-in Digital Tender Recording (Completed)

### Objective and Scope

- Replace the previously proposed provider-native POS checkout direction with
  cashier-recorded store-owned walk-in tender.
- Record GCash/Maya through the store's own QR, cards through the store's own
  terminal, and bank transfers through the store's own account without
  creating a PayMongo payment.
- Require explicit authenticated cashier confirmation, persist the allocation
  as `merchant_owned`, accept an optional reference, and preserve the existing
  split receipt/report breakdown.
- Keep PayMongo reconciliation available only for explicitly PayMongo-owned
  historical or provider-integrated allocations.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-13.

### Dependencies and Governance Note

- Phase 63 PayMongo Allocation Reconciliation and Refund-Safe Replay.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
  supersedes ADR 0062 because cashier attestation changes the previous binding
  provider-confirmation rule for walk-in non-cash tender.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`

### Acceptance and Validation Evidence

- [x] Manual GCash/Maya/card/bank allocations require explicit received-money
  confirmation and are stored successful as `merchant_owned`.
- [x] The manual path never invokes PayMongo and never stores a provider event
  identity; the reference field is optional.
- [x] Successful store-owned tender can be corrected before completion only by
  an append-only reversal with cashier and reason evidence.
- [x] PayMongo allocations retain provider reconciliation/refund protections.
- [x] Focused backend tests pass (40 tests), focused frontend tests pass at
  desktop and mobile widths (6 tests), docs/ADR lint, architecture/controller
  checks, tenant-schema coverage, backend/frontend lint with no errors, and the
  POS production build pass. The live POS shell loads without a framework
  error; terminal authentication correctly gated the signed-in dialog route.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 64 is complete. The next eligible governed phase is Phase 65:
  merchant-owned tender reconciliation and manager variance review.
- Phase 65 was approved on 2026-08-13.

## Phase 65 Merchant-owned Tender Reconciliation and Manager Variance Review (Completed)

### Objective and Scope

- Compute shift-scoped expected GCash, Maya, card-terminal, and bank-transfer
  totals from financially recognized walk-in sales and successful
  `merchant_owned` split allocations.
- Let a manager enter external statement totals, require a note for any
  method-level variance, and append immutable review evidence.
- Exclude Storefront/PayMongo payments and reversed, cancelled, pending, or
  failed allocations; never adjust sales, allocations, inventory, fiscal
  records, settlements, or provider state.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-13.

### Dependencies and Governance Note

- Phase 64 Manual Walk-in Digital Tender Recording.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
  (2026-08-13 amendment).
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/api/specification.md`
- `docs/database/schema.md`

### Acceptance and Validation Evidence

- [x] Both read and review endpoints require `pos:close_day`; cashiers cannot
  access the manager control through their default role.
- [x] Expected totals are server-derived and exclude online/PayMongo and
  non-successful or reversed allocation evidence without double-counting
  completed split sales.
- [x] Method-level variance requires a manager note; client expected totals,
  status, variance, reviewer, timestamps, and supersession are not trusted.
- [x] Reviews are append-only, idempotent, and link to the prior record instead
  of updating it. A stale flag surfaces later tender activity.
- [x] Main migration `20260813000001` is applied. Tenant repair and post-repair
  report pass for all 14 active tenant databases (14 succeeded, 0 failed).
- [x] Focused backend suites pass (38 tests), focused frontend and terminal
  layout suites pass (30 tests), targeted lint has 0 errors, tenant schema report, architecture and
  controller checks pass, and the POS production build passes.
- [x] Local POS runtime check recorded no console errors, browser exceptions,
  failed requests, HTTP 5xx responses, or visible error boundary before the
  expected terminal-login gate. Signed-in manager interaction remains covered
  by focused UI/service contracts because no authenticated browser session was
  available to the test runner.

### Implementation Links

- `apps/dgfy-api/src/models/PosMerchantTenderReconciliation.js`
- `apps/dgfy-api/src/modules/pos/usecases/merchantTenderReconciliationUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-api/src/services/runtimeSchemaAuditService.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-migration-runner/migrations/20260813000001-create-pos-merchant-tender-reconciliations.cjs`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-api/tests/posMerchantTenderReconciliation.usecases.test.js`
- `apps/dgfy-api/tests/posMerchantTenderReconciliation.route.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/merchantTenderReconciliation.contract.test.js`

### Completion Record (2026-08-13)

- Phase 65 is complete. On 2026-08-13, the user approved the quick two-way
  cashier usability correction as Phase 66. The previously proposed
  branch-wide merchant-tender reconciliation history and export moves to the
  next eligible phase after Phase 66.
- Provider-native walk-in checkout, automatic refunds, partial-refund
  allocation, and completed-sale reversal remain deferred.

## Phase 66 Quick Two-Way Split Cashier Entry (Completed)

### Objective and Scope

- Replace the confusing default-full-balance allocation entry with a clear
  Cash Amount plus Other Payment Amount quick split for the common two-tender
  sale.
- Calculate the other amount from the current server-returned remaining
  balance, require explicit store-received confirmation, and keep walk-in
  digital tender outside PayMongo.
- Preserve Add Another Payment for uncommon combinations and make partial
  success explicit when cash persists but the other request fails.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-13.

### Dependencies and Governance Note

- Phase 64 Manual Walk-in Digital Tender Recording.
- Phase 65 Merchant-owned Tender Reconciliation and Manager Variance Review.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; no ADR amendment or database
  migration is required.

### Acceptance and Validation Evidence

- [x] Cash and other-payment fields are simultaneously visible for a new
  split session, and the other amount follows the remaining balance.
- [x] Store-owned digital confirmation remains explicit and PayMongo is not
  called.
- [x] An interrupted second allocation preserves visible saved cash and guides
  the cashier to submit only the remaining payment.
- [x] Additional allocation entry remains available for uncommon combinations.
- [x] Focused frontend UI/service suites pass (8 tests), focused backend
  allocation/route/validator suites pass (25 tests), targeted frontend lint
  has 0 errors, the POS production build passes, docs/ADR lint and architecture
  boundaries pass, and the restored local POS shell has no error boundary.
  The signed-in dialog behavior is covered at desktop and mobile widths because
  the diagnostic browser is gated by terminal login.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 66 is complete. On 2026-08-13, the user approved Phase 67 to harden
  split-payment refresh recovery before the previously proposed branch-wide
  merchant-tender reconciliation history and export.

## Phase 67 Split-Payment Refresh Recovery and Sale Lock (Completed)

### Objective and Scope

- Recover an unresolved split-payment session even when the browser-local cart
  draft is empty after refresh.
- Show the server-saved item snapshot as a read-only sale summary in the
  payment dialog and show Payment in Progress in the Current Sale panel.
- Block catalog, cart, parked-sale, and checkout actions until the payment
  session is completed, properly cancelled, or confirmed missing.
- Preserve the server payment session as the authority; do not rebuild an
  editable cart from financial snapshot data.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-13.

### Dependencies and Governance Note

- Phase 61 Atomic Split-Payment Completion.
- Phase 64 Manual Walk-in Digital Tender Recording.
- Phase 66 Quick Two-Way Split Cashier Entry.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; no ADR amendment, exception,
  allowlist, backend change, or database migration is required.

### Acceptance and Validation Evidence

- [x] A recovered session shows its saved item, quantity, unit price, total,
  payment allocation, and payment-session reference even when Current Sale has
  no browser cart lines.
- [x] Current Sale shows Payment in Progress and a Resume Payment action instead
  of reporting the unresolved sale as empty.
- [x] Catalog/cart/new-sale actions remain blocked while the session is active,
  and the lock clears only after completion, cancellation, or confirmed 404.
- [x] Completing the recovered session still uses the existing atomic backend
  checkout path and clears the local recovery marker once.
- [x] Focused frontend tests pass (9 tests), including recovered-sale rendering
  at desktop and mobile widths; targeted lint has 0 errors with 8
  pre-existing warnings in the large terminal component; the POS production
  build, documentation/ADR lint, and architecture boundaries pass. The local
  POS shell renders without browser errors and reaches the expected terminal
  login gate; signed-in recovery behavior is covered by the component behavior
  tests because no authenticated browser session was available.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 67 is complete. On 2026-08-13, the user approved Phase 68 to correct
  MariaDB payment-snapshot serialization before the previously proposed
  branch-wide merchant-tender reconciliation history and export.

## Phase 68 MariaDB Payment Snapshot Serialization Recovery (Completed)

### Objective and Scope

- Normalize `pos_payment_sessions.snapshot` from MariaDB JSON text into an
  object at the POS repository boundary.
- Return the saved checkout lines to the recovery dialog and reuse those lines
  in the existing atomic split-payment completion operation.
- Reject invalid or line-less stored snapshots with an explicit recovery error
  before normal checkout is called.
- Preserve all successful allocations and require no database migration or
  data rewrite.

### Status

- `completed`
- Completion date: 2026-08-13.
- User approval received on 2026-08-13.

### Dependencies and Governance Note

- Phase 61 Atomic Split-Payment Completion.
- Phase 67 Split-Payment Refresh Recovery and Sale Lock.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; no ADR amendment, exception,
  allowlist, or database migration is required.

### Acceptance and Validation Evidence

- [x] Repository reads normalize a MariaDB-style JSON string into a snapshot
  object without changing rows that omit the snapshot field.
- [x] A fully paid session with a serialized snapshot completes through normal
  checkout using its saved lines.
- [x] Invalid or line-less snapshots fail closed before checkout with a
  payment-session recovery reason code.
- [x] Focused backend route, schema, repository, and use-case suites pass (29
  tests). Focused frontend recovery and service suites pass (11 tests).
  Targeted backend lint has 0 errors; architecture boundaries, backend build
  contract, and documentation/ADR lint pass.
- [x] A read-only live tenant probe proves the current session's snapshot is
  returned with its original saved line after repository normalization.
- [x] The controlled POS-DGFY workspace restart completed with SKUpervisor,
  POS, Storefront, backend, device bridge, and MySQL healthy. The backend
  restarted on a new process with the corrected code loaded.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/tests/posSplitPayment.repository.test.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 68 is complete. On 2026-08-13, the user approved Phase 69 to simplify
  the cashier split-payment flow before the previously proposed branch-wide
  merchant-tender reconciliation history and export.

## Phase 69 Automatic Split Finalization and Unblocked Sell Flow (Completed)

### Objective and Scope

- Automatically complete the sale when the server-owned split balance reaches
  exactly zero, without a separate cashier-facing Complete Sale action.
- Remove the payment-session global Sell lock so the catalog and ordinary POS
  controls are not disabled by the recovery marker.
- Keep one idempotent retry action only when automatic completion fails; do not
  retry in a loop or create duplicate transactions/inventory movements.
- Remove Keep Session Open and hide unpaid-session cancellation after any
  successful money is recorded.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 61 Atomic Split-Payment Completion.
- Phase 67 Split-Payment Refresh Recovery and Sale Lock.
- Phase 68 MariaDB Payment Snapshot Serialization Recovery.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; no backend, ADR, migration,
  exception, or allowlist change is required.

### Acceptance and Validation Evidence

- [x] A new two-way split automatically invokes one stable-idempotency
  completion after the second allocation returns zero remaining.
- [x] A recovered fully paid session automatically completes without a
  cashier-facing Complete Sale button.
- [x] A failed automatic completion remains recoverable with one manual retry
  action and does not loop.
- [x] The payment-session recovery marker does not contribute to
  `posActionsBlocked`; normal Sell controls remain governed only by the
  existing shift/compliance blocker.
- [x] Focused frontend/backend tests, targeted lint, POS production build,
  architecture, documentation/ADR, and rendered shell checks pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 69 is complete. The focused frontend suite passed 12 tests, and the
  focused backend suite passed 24 tests.
- Targeted frontend lint passed with zero errors (eight pre-existing warnings
  remain in `POSCheckoutTerminal.jsx`), the POS production build passed, and
  architecture and documentation checks passed.
- A clean local browser session loaded the POS terminal-login shell with no
  console errors. The signed-in automatic completion, recovery, failure, and
  retry paths are covered by focused component tests so the existing real
  payment session was not mutated during validation.
- The next eligible phase is Phase 70 for the deferred branch-wide
  merchant-tender reconciliation history and export initiative.

## Phase 70 Current Sale Action Simplification (Completed)

### Objective and Scope

- Remove the cashier-facing Close Day / Z-reading and Print Last Receipt
  controls from the Current Sale action grid.
- Preserve Close Day / Z-reading in the Shift workspace and preserve receipt
  reprinting through the existing transaction-history and receipt-preview
  flows.
- Reflow the remaining Current Sale actions without changing checkout,
  parked-sale, printer, drawer, discount, backend, or database behavior.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 69 Automatic Split Finalization and Unblocked Sell Flow.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; this is a Current Sale UI
  simplification with no backend, database, migration, ADR, exception, or
  allowlist change.

### Acceptance and Validation Evidence

- [x] Current Sale no longer renders Close Day / Z-reading.
- [x] Current Sale no longer renders Print Last Receipt.
- [x] The remaining six actions reflow through the existing responsive
  two-column/mobile and three-column/desktop grid.
- [x] Close Day remains available in the Shift workspace, and receipt
  reprinting remains available outside Current Sale.
- [x] The focused Current Sale contract test passed, the printer contract
  suite passed three tests, targeted lint passed with zero errors, and the POS
  production build passed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posPrinterAvailabilityAndReceiptView.contract.test.js`

### Completion Record (2026-08-13)

- Phase 70 is complete. Validation did not exercise or modify any transaction,
  payment, receipt, shift, or day-close data.
- Two unrelated pre-existing assertions in the complete responsive contract
  file still fail against earlier catalog/history changes; the Phase 70
  Current Sale regression and printer contracts pass independently.
- The next eligible phase is Phase 71 for the deferred branch-wide
  merchant-tender reconciliation history and export initiative.

## Phase 71 MariaDB Parked-Sale Snapshot Recovery (Completed)

### Objective and Scope

- Normalize `pos_parked_sales.snapshot` from MariaDB JSON text into an object
  before parked sales reach the POS list or claim responses.
- Derive the public line count from the parsed snapshot so preview and resume
  validation use the same server-owned lines.
- Preserve existing parked-sale rows and lifecycle behavior without a schema
  migration, data rewrite, claim, cancellation, or transaction mutation.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 53 Explicit Parked-Sale Retrieval and Resume Safety.
- Phase 68 MariaDB Payment Snapshot Serialization Recovery.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; this corrects an existing POS
  API serialization boundary and requires no schema, migration, ADR,
  exception, or allowlist change.

### Acceptance and Validation Evidence

- [x] Parked-sale list responses parse MariaDB JSON text into an object with
  accessible snapshot lines.
- [x] Parked-sale claim responses parse single- or double-serialized snapshot
  text before the resumed cart is rebuilt.
- [x] Public `line_count` is derived from the parsed snapshot rather than
  inconsistent response metadata.
- [x] Four focused backend suites passed 14 tests, four focused frontend
  suites passed 15 tests, and targeted backend lint passed with zero errors.
- [x] A read-only tenant probe confirmed both reported parked sales contain
  one valid saved line while the MariaDB driver returns each snapshot as text.
- [x] The local backend automatically reloaded the corrected source and all
  required POS-DGFY services remained healthy.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
- `apps/dgfy-api/tests/posParkedSale.usecases.test.js`

### Completion Record (2026-08-13)

- Phase 71 is complete. No parked sale, transaction, payment, inventory,
  receipt, shift, or day-close record was changed during implementation or
  validation.
- Refreshing the Parked Sales dialog now returns the saved Burger Meal and
  Chicken Frankie Roll lines for preview and resume validation.
- The next eligible phase is Phase 72 for the deferred branch-wide
  merchant-tender reconciliation history and export initiative.

## Phase 72 Cashier-Friendly Parked-Sale Naming (Completed)

### Objective and Scope

- Replace long cashier-facing parked-sale references such as
  `PARK-6749BD0422CB` with the short, unique label `Parked Sale #[ID]`.
- Use the same short label in the Parked Sales dialog and the park/resume
  confirmation messages.
- Preserve the complete `park_reference` in the database, API, audit trail,
  idempotency behavior, and support diagnostics.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 71 MariaDB Parked-Sale Snapshot Recovery.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; this is a display-only POS UX
  change with no API, database, migration, ADR, exception, or allowlist
  change.

### Acceptance and Validation Evidence

- [x] The Parked Sales dialog displays `Parked Sale #[ID]` instead of the full
  stored reference.
- [x] Park and resume success messages use the same short label.
- [x] The formatter falls back to `Parked Sale` when no valid server ID exists.
- [x] The full `park_reference` remains unchanged in service responses and
  stored records.
- [x] Four focused frontend suites passed 17 tests, targeted lint passed with
  zero errors, and the POS production build passed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/utils/posParkedSaleResume.js`
- `apps/dgfy-web/src/features/pos/components/POSParkedSalesDialog.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/utils/__tests__/posParkedSaleResume.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posParkedSalesDialog.contract.test.js`

### Completion Record (2026-08-13)

- Phase 72 is complete. Existing parked-sale records now appear as Parked Sale
  #3 and Parked Sale #4 in the cashier UI; their complete references remain
  unchanged internally.
- No parked sale, transaction, payment, inventory, receipt, shift, or day-close
  record was changed during validation.
- The next eligible phase is Phase 73 for the deferred branch-wide
  merchant-tender reconciliation history and export initiative.

## Phase 73 Resumed Parked-Sale Stable Identity (Completed)

### Objective and Scope

- Preserve the claimed parked-sale identity when its cart is resumed and
  edited, including shift-scoped browser refresh recovery.
- Make `Update Park & New` replace the snapshot on the same parked record
  instead of creating a duplicate parked record.
- Complete that same parked record atomically when normal or split checkout
  creates the authoritative POS transaction.
- Add optimistic revision protection so a stale browser cannot silently
  overwrite a newer parked snapshot.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 53 Explicit Parked-Sale Retrieval and Resume Safety.
- Phase 71 MariaDB Parked-Sale Snapshot Recovery.
- Phase 72 Cashier-Friendly Parked-Sale Naming.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- Classification: `default-clause-amendment`; ADR 0061 Decision clauses 1 and
  3 are amended in the same change to permit an explicit, revision-protected
  snapshot replacement on the same claimed parked-sale identity.
- No architecture exception or allowlist entry is introduced.

### Acceptance and Validation Evidence

- [x] A resumed cart retains `pos_parked_sale_id`, `park_reference`, and
  `revision` through the existing shift-scoped cart-draft recovery.
- [x] Re-parking updates the same claimed row, increments `revision`, releases
  its claim, and never calls the create endpoint.
- [x] Stale revision, wrong cashier, wrong shift, wrong terminal, and wrong
  location attempts leave both the saved row and current cart unchanged.
- [x] Normal and split checkout link the parked-sale ID and move the record to
  `completed` in the same database transaction as checkout completion.
- [x] Existing parked-sale rows remain untouched; there is no automatic merge,
  cancellation, deletion, or cleanup of prior duplicates.
- [x] Focused backend/frontend tests, tenant schema coverage, architecture,
  documentation, and POS production build validation pass.

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260813000002-add-pos-parked-sale-revision.cjs`
- `apps/dgfy-api/src/models/PosParkedSale.js`
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/services/posCartDraftStore.js`

### Completion Record (2026-08-13)

- Phase 73 is complete. Eight focused backend suites passed 131 tests and
  eight focused frontend suites passed 33 tests. Targeted backend lint passed
  with zero errors; targeted frontend lint passed with zero errors and eight
  pre-existing warnings in `POSCheckoutTerminal.jsx`.
- The additive tenant repair added only `pos_parked_sales.revision`; all 14
  active local tenant schemas passed the post-repair report. Existing Masu
  Cafe parked rows retained their IDs, statuses, line counts, totals, and
  revision default of 1.
- ADR, governed-document, architecture-guardrail, controller-boundary, POS
  production-build, backend health, frontend response, and authenticated-route
  boundary checks passed.
- No existing parked sale was merged, cancelled, deleted, claimed, completed,
  or otherwise cleaned up automatically during implementation or validation.
- The current phase is Phase 73 complete. The next eligible phase is Phase 74.

## Phase 74 Silent Split-Payment Recovery and Explicit Resume (Completed)

### Objective and Scope

- Stop the Split Payment dialog from opening automatically when the cashier
  returns to Sell or refreshes with a browser recovery pointer.
- Validate the saved payment session quietly against the server and show an
  inline Resume Payment notice without blocking ordinary Sell controls.
- Allow an explicitly unpaid session to be discarded through the existing
  audited cancellation endpoint while protecting sessions that contain money.
- Clear completed, cancelled, missing, malformed, and stale browser pointers
  without creating a replacement payment session.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 61 Atomic Split-Payment Completion.
- Phase 67 Split-Payment Refresh Recovery and Sale Lock.
- Phase 69 Automatic Split Finalization and Unblocked Sell Flow.
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- Classification: `within-existing-boundary`; this corrects frontend recovery
  behavior without changing binding payment invariants. No ADR amendment,
  backend change, database migration, exception, or allowlist is required.

### Acceptance and Validation Evidence

- [x] A saved browser pointer triggers one background server read and never
  opens the Split Payment dialog automatically.
- [x] Current Sale exposes explicit Resume Payment without hiding an existing
  browser cart or globally disabling Sell.
- [x] Discard Unpaid is available only when the server reports zero paid and
  no live successful/pending allocation; it uses the audited server
  cancellation operation and leaves the cart unchanged.
- [x] Sessions containing recorded money remain recoverable and cannot use the
  unpaid-discard shortcut.
- [x] Completed, cancelled, missing, malformed, and invalid pointers clear
  locally and do not create a replacement session.
- [x] Focused frontend recovery and contract suites passed 15 tests. Targeted
  lint passed with zero errors and eight pre-existing warnings in the large
  terminal component. POS production build, architecture, documentation, and
  rendered-route validation completed successfully.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/services/posSplitPaymentSessionStore.js`
- `apps/dgfy-web/src/features/pos/services/__tests__/posSplitPaymentSessionStore.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`

### Completion Record (2026-08-13)

- Phase 74 is complete. The existing live unpaid payment session was not
  cancelled, completed, allocated, or otherwise mutated during validation.
- The previously proposed parked-sale shift-transfer initiative remains
  deferred. The next eligible repository phase is Phase 75.

## Phase 75 POS Mode Presentation Ownership Contract (Completed)

### Objective and Scope

- Freeze the ownership boundary between the shared POS transaction engine and
  the F&B, Services, and Counter presentation bundles.
- Prevent future F&B controls, labels, and operational assumptions from
  appearing in Services through the shared checkout component.
- Classify the existing Parked Sales presentation explicitly without changing
  its persistence lifecycle or any existing record.
- Keep Hospitality behavior unchanged and defer runtime extraction to the next
  approved phase.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 74 Silent Split-Payment Recovery and Explicit Resume.
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- Classification: `within-existing-boundary`; the existing Store Profile and
  POS workflow registries already authorize workflow-specific presentation.
  No ADR amendment, database migration, API change, exception, or allowlist is
  required for the contract phase.

### Acceptance and Validation Evidence

- [x] The ownership matrix separates shared financial/infrastructure behavior
  from F&B, Services, and Counter presentation behavior.
- [x] The audit records that checkout-detail panels are already isolated while
  the Current Sale actions remain shared in `POSCheckoutTerminal.jsx`.
- [x] Services no longer implicitly owns the order-oriented `Parked Sales` and
  `Park & New Sale` presentation; appointment continuity remains governed by
  the Services booking lifecycle.
- [x] The contract preserves backend authorization, capability gates, payment,
  receipt, inventory, and fiscal authority.
- [x] Existing Hospitality presentation is protected from silent
  reclassification.
- [x] No runtime code, tenant data, parked-sale record, payment session,
  database schema, API contract, or permission was changed.
- [x] Documentation lint and architecture guardrails pass.

### Implementation Links

- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- `packages/shared-constants/src/posWorkflows.js`
- `packages/shared-constants/src/storeProfile.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/FnbWorkflowPanel.jsx`
- `apps/dgfy-web/src/features/pos/components/ServicesWorkflowPanel.jsx`

### Completion Record (2026-08-13)

- Phase 75 completed the presentation ownership contract only. The cashier UI
  behaves exactly as before this phase.
- The next eligible repository phase is Phase 76: Presentation Bundle
  Foundation.

## Phase 76 POS Presentation Bundle Foundation (Completed)

### Objective and Scope

- Add one centralized frontend presentation-bundle resolver driven by the
  existing governed POS workflow.
- Define shared and workflow-owned presentation slots without changing cashier
  behavior or transaction persistence.
- Route the existing checkout-detail panels through one composition boundary.
- Fail closed to Counter for invalid or incomplete presentation input while
  preserving existing Hospitality behavior.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 75 POS Mode Presentation Ownership Contract.
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
- Classification: `within-existing-boundary`; the resolver consumes the
  existing POS workflow and does not introduce a Store Template runtime read,
  persisted profile field, API, migration, exception, or allowlist entry.

### Acceptance and Validation Evidence

- [x] F&B, Services, and Counter checkout-detail ownership resolves through
  one immutable presentation-bundle registry.
- [x] Invalid or incomplete input fails closed to Counter.
- [x] Counter-service F&B resolves to Counter after effective dining
  capabilities are removed.
- [x] Hospitality retains its existing F&B-shaped POS presentation.
- [x] Shared financial and infrastructure slots remain shared; Current Sale
  actions are explicitly classified `legacy_shared` for Phase 77 extraction.
- [x] Fifteen focused resolver, rendered component, and workflow tests pass;
  the modified responsive composition assertion also passes.
- [x] Targeted frontend lint passes with zero errors and the eight pre-existing
  warnings in the large checkout component.
- [x] POS production build, documentation/ADR lint, and architecture
  guardrails pass.
- [x] Direct browser validation confirms the locked POS desktop and narrow
  shells render with no console errors. Authenticated workflow interaction is
  deferred to the Phase 78 hardening evidence.
- [x] No checkout, payment, booking, parked-sale, database, API, permission, or
  tenant-data behavior changed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/utils/posPresentationBundle.js`
- `apps/dgfy-web/src/features/pos/components/PosCheckoutDetailsSlot.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posPresentationBundle.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posCheckoutDetailsSlot.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 76 established the presentation resolver and checkout-detail slot with
  no cashier-visible change. Existing Current Sale actions remain shared until
  the separately approved Phase 77 extraction.
- The next eligible repository phase is Phase 77: F&B and Services
  Presentation Isolation.

## Phase 77 F&B and Services Presentation Isolation (Completed)

### Objective and Scope

- Move Current Sale actions behind the centralized presentation-bundle
  boundary created in Phase 76.
- Preserve F&B and Counter parked-sale presentation and behavior.
- Hide the unchanged order-oriented parked-sale controls and dialog
  presentation in Services.
- Keep Checkout, Print Order, Open Cash Drawer, and Apply Discount shared and
  behavior-identical across eligible workflows.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 76 POS Presentation Bundle Foundation.
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
- `docs/architecture/adr/0061-pos-parked-sale-lifecycle-and-shift-safe-resume.md`
- Classification: `within-existing-boundary`; this changes workflow-specific
  frontend affordances only. It does not change a binding parked-sale
  invariant, Store Profile persistence, API, database schema, permission,
  exception, or allowlist entry.

### Acceptance and Validation Evidence

- [x] F&B and Counter render Parked Sales and Park & New Sale through their
  presentation bundles.
- [x] Services renders neither parked-sale control and does not mount the
  parked-sales dialog presentation.
- [x] Services retains Checkout, Print Order, Open Cash Drawer, and Apply
  Discount using the existing shared callbacks and disabled conditions.
- [x] Missing presentation input does not expose parked-sale controls.
- [x] Existing parked-sale create, re-park, resume, cancellation, checkout
  completion, offline, and shift behavior is unchanged.
- [x] Thirty focused tests pass, including rendered F&B/Counter/Services action
  visibility and callback assertions; two responsive composition checks pass.
- [x] Targeted frontend lint passes with zero errors and the eight pre-existing
  warnings in `POSCheckoutTerminal.jsx`.
- [x] POS production build, documentation/ADR lint, and architecture
  guardrails pass.
- [x] Direct browser validation confirms locked desktop and narrow POS shells
  render with no console errors. Authenticated cross-mode browser proof remains
  Phase 78 scope.
- [x] No tenant data, parked sale, booking, payment session, transaction,
  inventory movement, receipt, or shift record was changed.

### Implementation Links

- `apps/dgfy-web/src/features/pos/utils/posPresentationBundle.js`
- `apps/dgfy-web/src/features/pos/components/PosCurrentSaleActions.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posCurrentSaleActions.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posPresentationBundle.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posParkedSale.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posParkedSalesDialog.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 77 completed the requested runtime separation: Services no longer
  presents the F&B/Counter parked-sale controls, while the underlying shared
  parked-sale engine and existing records remain unchanged.
- The next eligible repository phase is Phase 78: Cross-Mode Protection and
  Closure.

## Phase 78 Cross-Mode Protection and Closure (Completed)

### Objective and Scope

- Protect the completed presentation boundary with rendered regression
  coverage for full-service F&B, counter-service F&B, Services, and generic
  Counter profiles.
- Prove positive and negative workflow-control visibility alongside the shared
  Checkout, Print Order, Open Cash Drawer, and Apply Discount actions.
- Preserve reachable action sizing and layout at desktop, narrow, and short
  viewports without changing transaction behavior.
- Close the POS Mode Presentation Bundles Release 1 initiative.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 77 F&B and Services Presentation Isolation.
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- `docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0019-food-and-beverage-mode-full-service-restaurant.md`
- `docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- Classification: `within-existing-boundary`; ADR change not required. This
  phase changes presentation tests and a scoped responsive selector only. It
  introduces no API, database, permission, lifecycle, exception, or allowlist
  change.

### Acceptance and Validation Evidence

- [x] A rendered four-profile matrix proves that full-service F&B displays
  dining, table, kitchen, and parked-sale controls without Services controls.
- [x] Counter-service F&B resolves to Counter and displays neither table nor
  kitchen controls.
- [x] Services displays visit, client, provider, resource, and service-note
  controls without F&B or unchanged parked-sale controls.
- [x] Generic Counter displays Counter methods and parked-sale controls without
  F&B or Services details.
- [x] Every profile invokes the same shared Checkout, Print Order, Open Cash
  Drawer, and Apply Discount callbacks.
- [x] A sequential F&B-to-Services render proves that a prior F&B render cannot
  leak workflow presentation into Services.
- [x] Services keeps a two-column action grid with four touch targets at least
  46 pixels high. The short-height three-column optimization now applies only
  at desktop widths and only when parked-sale controls are present.
- [x] Thirty-six focused mode, workflow, presentation, and parked-sale tests
  pass; two affected responsive composition assertions pass.
- [x] Targeted frontend lint and the POS production build pass.
- [x] The locked local POS shell renders nonblank with its expected identity at
  desktop and narrow capture sizes and reports no error-level console entries.
- [x] Authenticated browser mode switching was unavailable because the local
  terminal was locked and no safe credentials were supplied. The deterministic
  rendered component matrix is the closure proof; no tenant/session state was
  fabricated or mutated.
- [x] No tenant data, payment, booking, parked sale, transaction, inventory,
  receipt, or shift record was created, changed, migrated, or deleted.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/PosCurrentSaleActions.jsx`
- `apps/dgfy-web/src/index.css`
- `apps/dgfy-web/src/features/pos/__tests__/posModePresentationMatrix.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js`
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 78 completes POS Mode Presentation Bundles Release 1. The presentation
  boundary is protected across the four governed profiles, shared transaction
  actions remain one implementation, and Services cannot inherit F&B controls
  through the Current Sale or checkout-detail composition surfaces.
- Phase 79 was subsequently approved as a narrow Services navigation and
  online-queue isolation phase.

## Phase 79 Services Navigation and Online Queue Isolation (Completed)

### Objective and Scope

- Keep Services bookings in the existing Services Today/Calendar lifecycle.
- Remove the retail/F&B storefront `Orders` queue from Services navigation,
  stale-view restoration, notification state, requests, and polling.
- Preserve the capability-gated Orders queue for eligible retail, F&B, and
  counter workflows.
- Correct the Services Store Profile default and protect already-materialized
  profiles from the legacy queue-enabled value.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- Phase 78 Cross-Mode Protection and Closure.
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`
- `docs/architecture/adr/0016-services-mode-independent-booking-and-ticketing.md`
- `docs/architecture/adr/0056-store-configuration-templates-and-profiles.md`
- Classification: `within-existing-boundary`; no ADR amendment is required.
  The existing Services booking boundary already excludes retail/F&B order
  fulfillment. This phase changes a shared default and frontend operational
  eligibility only; it adds no API, database, permission, lifecycle,
  exception, or allowlist entry.

### Acceptance and Validation Evidence

- [x] Services desktop and mobile navigation render `Services` without
  `Orders`.
- [x] Services cannot restore or directly select `incoming_queue` and returns
  to the normal checkout workspace when stale state names that view.
- [x] Services clears incoming-order state, performs no incoming-order request
  or polling, and produces no incoming-order notification count.
- [x] Services defaults `show_online_queue` to `false`; the runtime workflow
  guard rejects stale Services profiles that still contain `true`.
- [x] Eligible F&B, retail, and counter workflows retain their prior
  capability-gated Orders queue behavior.
- [x] Fifty-eight focused frontend tests and sixteen Store Profile contract
  tests pass, including eleven golden snapshots.
- [x] Targeted frontend lint passes with zero errors; POS and SKUpervisor
  production builds, documentation/ADR lint, and architecture guardrails pass.
- [x] The local locked POS shell restores successfully with no error-level
  browser console entries. The deterministic rendered test supplies the
  authenticated Services navigation proof without fabricating credentials or
  mutating tenant data.
- [x] No tenant data, booking, order, transaction, payment, inventory, receipt,
  parked sale, or shift state was created, migrated, modified, or deleted.

### Implementation Links

- `packages/shared-constants/src/posDefaultsAndTerminology.js`
- `apps/dgfy-web/src/features/pos/utils/posOperationalVisibility.js`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalWorkspaceSidebar.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posServicesOrderQueueIsolation.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `apps/dgfy-api/tests/storeProfile.equivalence.contract.test.js`
- `docs/features/POS_MODE_PRESENTATION_OWNERSHIP_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 79 completes the requested separation: Services keeps its booking
  workspace and no longer displays or loads the unrelated storefront Orders
  queue. Other eligible workflows are unchanged.
- Phase 80 was subsequently approved as POS Financial and Release Hardening.

## Phase 80 POS Financial and Release Hardening (Completed)

### Objective and Scope

- Calculate and persist split-payment session totals through the normal
  server checkout-pricing boundary before accepting any allocation.
- Resume the existing active scoped session rather than create an orphaned
  duplicate, including recovery when browser-local pointers are unavailable.
- Enforce active tenant/location/terminal/cashier/shift scope on session reads.
- Block normal and stale-force shift close while successful tender remains in
  an unresolved payment session, returning actionable recovery evidence.
- Require the parked-sale revision migration and column in runtime health.
- Clear confirmed production dependency advisories and restore frontend
  release-contract tests after the approved component and scroll changes.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0062 POS Split Tender Collection and Payment Allocation.
- ADR 0063 POS Split Tender and Manual Walk-in Payment Recording.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md` and
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- Classification: `binding-contract-conformance`. Phase 80 corrects code that
  violated existing binding clauses; it introduces no new architecture
  decision or allowlist exception.

### Acceptance and Validation Evidence

- [x] Caller totals are display hints only; session totals come from the normal
  server checkout calculation before allocation persistence.
- [x] One active scoped payment session is discovered and resumed from the
  server when the browser pointer is missing.
- [x] Direct session reads validate the open shift, cashier, terminal, and
  location scope.
- [x] Shift close and stale-force close block funded unresolved sessions and
  identify the affected session references and balances.
- [x] Runtime health requires the parked-sale revision migration and audits
  `pos_parked_sales.revision`.
- [x] Focused backend financial/runtime tests pass (45 tests).
- [x] Previously failing frontend source-contract tests and focused split
  payment transport tests pass (20 tests).
- [x] Broader backend regressions pass (91 unit/contract tests plus 10
  checkout database-integration tests).
- [x] The full POS frontend suite passes (103 files, 516 tests), including
  desktop/mobile manual cash and store-owned GCash split-tender behavior.
- [x] POS and SKUpervisor production builds, architecture/controller checks,
  documentation/ADR lint, targeted lint, and diff validation pass.
- [x] The parked-sale revision migration is applied locally; runtime doctor
  reports zero missing migrations, zero missing columns, and zero warnings;
  all 14 active tenant schemas pass the schema check.
- [x] Root and API production dependency audits report zero vulnerabilities.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/services/runtimeSchemaAuditService.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/services/posService.js`
- `apps/dgfy-api/tests/posSplitPayment.usecases.test.js`
- `apps/dgfy-api/tests/posOperationReplayParity.usecase.test.js`
- `apps/dgfy-api/tests/runtimeSchemaAuditService.test.js`

### Completion Record (2026-08-13)

- Phase 80 closes the audited financial, recovery, shift-close, runtime-schema,
  and production-dependency gaps without routing store-owned walk-in GCash
  through PayMongo.
- No unresolved architecture exception or allowlist dependency was introduced.
- Phase 80 is complete. Phase 81 is the next eligible repository phase and
  requires separate approval.

## Phase 81 - Split-Cash Change Preview and Named Parked Sales

### Initiative and Release

- Initiative: POS cashier payment clarity and parked-sale ownership.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Show the cash amount applied and change due before a cashier records an
  over-tendered cash allocation in Split Payment.
- Require a Customer / Order Name before parking a sale.
- Preserve that name through resume and repark, and show it with the short
  parked-sale ID in the Parked Sales queue.
- Preserve the short-ID fallback for parked records created before Phase 81.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0061 POS Parked-Sale Lifecycle and Shift-Safe Resume.
- ADR 0062 POS Split Tender Collection and Payment Allocation.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Classification: `binding-contract-conformance`; the customer/order label is
  stored in the existing parked snapshot and introduces no schema migration or
  architecture exception.

### Acceptance and Validation Evidence

- [x] Cash tender above the remaining balance previews cash applied and change
  due before submission; the backend remains authoritative at persistence.
- [x] The POS requires a customer/order name before parking a sale.
- [x] Resume and repark preserve the name.
- [x] Existing unnamed parked records still display their short parked-sale ID.
- [x] Focused frontend tests pass (3 files, 12 tests).
- [x] Targeted frontend lint reports zero errors (pre-existing warnings only).
- [x] POS production build passes.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/utils/posParkedSaleResume.js`
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`

### Completion Record (2026-08-13)

- Phase 81 is complete. Phase 82 is the next eligible repository phase and
  requires separate approval.

## Phase 82 - Simplified Sequential Split-Payment Navigation

### Initiative and Release

- Initiative: POS cashier payment clarity and speed.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Replace the separate Quick Two-Way Split and Add Another Payment interfaces
  with one sequential payment flow.
- Present Cash, GCash, Maya, Card, and Bank as direct payment-method buttons.
- Default every new entry to the server-returned remaining balance.
- Preserve partial digital payments, explicit store-received confirmation,
  cash over-tender, change calculation, allocation recovery, and automatic
  completion.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0062 POS Split Tender Collection and Payment Allocation.
- ADR 0063 POS Split Tender and Manual Walk-in Payment Recording.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Classification: `snapshot-implementation-simplification`; no persistence,
  transport, payment ownership, or cross-boundary decision changed.

### Acceptance and Validation Evidence

- [x] Only one payment-entry flow is rendered.
- [x] Each payment method is directly selectable and starts at Remaining.
- [x] PHP 250 GCash followed by PHP 100 cash on a PHP 300 sale previews PHP 50
  cash applied and PHP 50 change, then completes automatically.
- [x] Successful earlier allocations remain visible if a later payment fails.
- [x] Focused frontend tests pass (4 files, 17 tests).
- [x] Targeted lint and POS production build pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 82 is complete. Phase 83 is the next eligible repository phase and
  requires separate approval.

## Phase 83 - Two-Field Cash and GCash Split Payment

### Initiative and Release

- Initiative: POS cashier payment clarity and speed.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Show GCash Amount and Cash Received together as the primary split-payment
  entry.
- Let the cashier enter either or both amounts manually and complete them with
  one action.
- Apply GCash first, cash second, and preview cash applied and change.
- Keep Maya, Card, and Bank Transfer under a collapsed More Payment Methods
  section.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0063 POS Split Tender and Manual Walk-in Payment Recording.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Classification: `snapshot-implementation-simplification`; server-owned
  allocations, idempotency, digital attestation, cash change, and completion
  boundaries are unchanged.

### Acceptance and Validation Evidence

- [x] Cash and GCash are visible as two manually editable primary fields.
- [x] PHP 250 GCash plus PHP 100 cash on a PHP 300 sale previews PHP 50 cash
  applied and PHP 50 change.
- [x] GCash is persisted before cash, each with its own idempotency key.
- [x] A persisted GCash allocation remains visible and retry submits only cash
  when the cash request fails.
- [x] Maya, Card, and Bank remain available only after opening More Payment
  Methods.
- [x] Focused frontend tests pass (4 files, 18 tests).

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 83 is complete. Phase 84 is the next eligible repository phase and
  requires separate approval.

## Phase 84 - Configurable Split-Payment Method Rows

### Initiative and Release

- Initiative: POS cashier payment clarity and flexible split tender.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Replace fixed GCash and Cash fields plus the separate More Payment Methods
  section with configurable Method of Payment and Amount rows.
- Show two rows by default, preselected as GCash and Cash.
- Allow Cash, GCash, Maya, Card, and Bank Transfer while preventing duplicate
  active methods.
- Allow additional rows, preserve explicit digital receipt confirmation, and
  calculate cash applied and change before one completion action.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0063 POS Split Tender and Manual Walk-in Payment Recording.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Classification: `snapshot-implementation-simplification`; payment methods,
  server-owned allocation persistence, idempotency, digital attestation, cash
  change, recovery, and automatic completion boundaries are unchanged.

### Acceptance and Validation Evidence

- [x] Two Method of Payment plus Amount rows are visible by default as GCash
  and Cash.
- [x] Additional unused payment methods can be added and removed.
- [x] Merchant-owned digital rows require explicit receipt confirmation.
- [x] PHP 250 GCash plus PHP 100 cash on a PHP 300 sale previews PHP 50 cash
  applied and PHP 50 change on desktop and mobile widths.
- [x] Non-cash rows are submitted before cash and every row has its own stable
  idempotency key.
- [x] A successful earlier row remains visible and retry keeps only unsaved
  amounts when a later row fails.
- [x] Focused frontend regression tests pass (4 files, 19 tests).
- [x] Targeted frontend lint and POS production build pass.
- [x] Documentation and ADR validation pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`

### Completion Record (2026-08-13)

- Phase 84 is complete. Phase 85 is the next eligible repository phase and
  requires separate approval.

## Phase 85 - Explicit Browser Printing After Shift Close

### Initiative and Release

- Initiative: POS shift-close and printerless-terminal usability.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Prevent successful automatic Shift Out from opening the browser print dialog
  when no physical printer is configured.
- Apply the same rule when an offline or interrupted shift-close intent is
  replayed successfully.
- Preserve configured physical-printer dispatch and the explicit post-shift
  Print Shift Summary action.
- Preserve the saved shift report, post-shift Day Close handoff, permissions,
  shift lifecycle, and printing audit boundaries.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0053 Pluggable POS Hardware Device Drivers.
- Phase 36 Post-Shift Day-Close Handoff and Locked-Screen Z-Reading Access.
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`.
- Classification: `default-contract-conformance`; printer absence remains a
  supported state and no ADR, API, database, hardware-driver, permission,
  lifecycle, exception, or allowlist change is introduced.

### Acceptance and Validation Evidence

- [x] Online Shift Out passes `openBrowserFallback: false` regardless of admin
  navigation behavior.
- [x] Replayed shift close passes `openBrowserFallback: false`.
- [x] Configured physical-printer dispatch remains attempted through the
  existing hardware abstraction.
- [x] Explicit Print Shift Summary and reprint actions retain browser fallback.
- [x] Focused frontend contract tests pass (2 files, 60 tests).
- [x] Targeted frontend lint reports zero errors (two pre-existing warnings).
- [x] POS production build passes.
- [x] Documentation and ADR validation pass.

### Implementation Links

- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/terminalPairing.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/terminalViewModeContracts.test.js`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`

### Completion Record (2026-08-13)

- Phase 85 is complete. Phase 86 is the next eligible repository phase and
  requires separate approval.

## Phase 86 - POS Release Reconciliation and Merge Readiness

### Initiative and Release

- Initiative: POS release hardening for Parked Sales, Split Payment, terminal
  workflows, and shared receipt behavior.
- Release: `codex/pos-development-reconciled` targeting `develop`.

### Objective and Scope

- Reconcile the approved POS feature work with the current `develop` branch.
- Restore deterministic frontend and backend release validation.
- Bring POS checkout and terminal route chunks back within governed budgets.
- Repair backend archive loading, tenant-location deletion guards, dependency
  audit portability, and stale test contracts exposed by the release matrix.
- Record the compliance declaration and shared receipt package version required
  for review and promotion.

### Status

- `completed`
- User approval received on 2026-08-13.
- Completed on 2026-08-13.

### Dependencies and Governance Note

- ADR 0053 Pluggable POS Hardware Device Drivers.
- ADR 0061 POS Parked Sales and Cashier Ownership.
- ADR 0063 POS Split Tender and Manual Walk-in Payment Recording.
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`.
- `docs/features/POS_PARKED_SALES_CONTRACT.md`.
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Compliance declaration:
  `docs/compliance/impact-declarations/2026-08-13-pos-parked-sales-split-tender-and-reconciliation.md`.

### Acceptance and Validation Evidence

- [x] Post-rebase frontend suite passes: 321 files and 1,807 tests.
- [x] Governed backend matrix passes across all 509 active test files.
- [x] POS checkout route is 152.98 KB against a 154 KB budget.
- [x] SKUpervisor terminal route is 115.99 KB against a 116 KB budget.
- [x] Production dependency audit passes across all four package trees with no
  unsuppressed vulnerabilities; tracked React Router exceptions remain in
  issue #389.
- [x] Architecture guardrails pass across 47 modules and 467 code files; all 86
  controller files preserve model boundaries.
- [x] Compliance, tenant schema coverage, documentation, and all 70 ADR checks
  pass.
- [x] Tenant-location deletion guards cover merchant tender reconciliations and
  contain no duplicate F&B availability references.
- [x] Shared POS receipt package is versioned at 0.1.2.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentWorkflow.jsx`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-api/src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js`
- `apps/dgfy-api/src/services/csvExportService.js`
- `scripts/audit-dependencies.js`
- `packages/pos-receipt/package.json`
- [PR #410 - Parked Sales, Split Payment, and release reconciliation](https://github.com/Sieitzz/dgfy-platform/pull/410)
- [Issue #411 - Developer handoff and workflow documentation](https://github.com/Sieitzz/dgfy-platform/issues/411)

### Completion Record (2026-08-13)

- Phase 86 is complete. Phase 87 is the next eligible repository phase and
  requires separate approval.

## Phase 87 - Authorise Services Handoff Legs to Reach Schema/API

### Initiative and Release

- Initiative: Services pickup-and-return round trip (laundry handoff legs).
- Release: unreleased; this phase is a governance decision, not a code change.

### Objective and Scope

- Lift the governance gate blocking issue #482 (laundry pickup-and-return round trip,
  `pickupReturnLogistics`): ADR 0057 clause 3 (`[binding]`) forbids the fulfillment-profile
  vocabulary from reaching any database column, API contract, or Store Profile section, which
  blocks every piece of schema/API work #482 needs.
- Author ADR 0064, a scoped supersession of ADR 0057 clause 3 for `item_pickup_return` and
  `item_pickup_collection` only, resolving the tech-lead ruling #482 flagged as open (new ADR vs.
  an amendment block) in favor of a new ADR — the same route ADR 0058 already used against ADR
  0057 clause 1.
- No schema, API, migration, or frontend change ships in this phase. Phases 88-92 (schema,
  API contract, storefront wiring, services tracking timeline, POS) are authorized by ADR 0064
  but implemented separately.

### Status

- `completed`
- Completed on 2026-08-15.

### Dependencies and Governance Note

- ADR 0057 (Services Fulfillment Profiles) - clause 3 scoped-superseded; clauses 1, 2, and 4
  unaffected.
- ADR 0058 (Registration Industry Catalog) - the in-tree precedent for a scoped supersession of
  one of ADR 0057's binding clauses via a new ADR rather than a status flip.
- ADR 0039 (ADR Lifecycle, Strictness Tiers, and Amendment Path) - governs the binding-clause
  supersession requirement this phase satisfies.
- `docs/proposals/2026-08-15-liempyo-laundry-discover-flow-and-gap-analysis.md` - the confirmed
  customer-facing spec this authorization is scoped against.
- No compliance impact declaration required: this phase is documentation-only (ADR + ledger),
  no schema, API, or runtime behavior changes.

### Acceptance and Validation Evidence

- [x] `npm run check:adr` passes: 71 ADRs validated, no topic/binding-authority collisions.
- [x] `npm run lint:docs` passes: 28 governed docs validated (chains `check:adr`).
- [x] `docs/architecture/adr/INDEX.md` regenerated via `npm run generate:adr-index` and includes
  ADR 0064 (`accepted`, topic `services_handoff_legs`, 6 binding-clause count).
- [x] `docs/features/SERVICES_FULFILLMENT_PROFILES.md` confirmed unchanged, still
  `authority_level: reference`.
- [x] ADR 0057 confirmed unchanged except its new `## Related` cross-reference; `status: accepted`
  and all four clauses byte-identical.

### Implementation Links

- `docs/architecture/adr/0064-services-handoff-legs-and-round-trip-persistence.md`
- `docs/architecture/adr/0057-services-fulfillment-profiles.md`
- `docs/architecture/adr/INDEX.md`
- Issue #482 - Laundry pickup-and-return round trip (`pickupReturnLogistics`)

### Completion Record (2026-08-15)

- Phase 87 is complete. Phase 88 is the next eligible repository phase and requires separate
  approval; it is authorized by ADR 0064 but not implemented here.

## Phase 88 - Services Handoff-Leg Schema

### Initiative and Release

- Initiative: Services pickup-and-return round trip (laundry handoff legs), continuing #482.
- Release: unreleased; schema-only, no API contract or frontend wiring in this phase.

### Objective and Scope

- Authorized by ADR 0064 (Phase 87). Adds the schema #482 needs: a widened
  `service_bookings.status` enum (+4 round-trip lifecycle values), a fifth
  `service_item_details.service_area_type` value (`item_handoff`, ADR 0064 decision 7's grain
  answer), the handoff-leg entity (`service_booking_handoff_legs`, ADR 0064 decision 2), and a
  transition-event table (`service_booking_status_events`, ADR 0064 decision 4).
- Updates the per-tenant schema baseline (`apps/dgfy-api/scripts/sync-tenant-schemas.js`) so newly
  provisioned tenants and drift-repair on existing ones both carry the new shape - not just the
  migration path.
- Populates `service_area_types: ['item_handoff']` on `item_pickup_return` and
  `item_pickup_collection` in `packages/shared-constants/src/fulfillmentProfiles.js`, closing the
  ADR 0064 decision 7 gap (both profiles were unreachable via
  `resolveFulfillmentProfilesForServiceAreaType` by construction before this phase).
- No API contract, payload field, or frontend change ships in this phase. Nothing writes rows to
  either new table yet - persistence wiring is Phase 100. `pickupReturnLogistics` stays
  `status: 'planned'` per ADR 0064 decision 6.
- Assessed against PR #535 (storefront modularization, merged the same day as Phase 87) before
  starting: #535 touched zero files under `modes/services/` and does not affect this phase's scope.

### Status

- `completed`
- Migration checkpoint reached 2026-08-15: three new files under
  `apps/dgfy-migration-runner/migrations/` trip the Worker/Implementer skill's mandatory
  human-confirmation trigger. Code written and Tier 0-verified, then committed as PR #541.
- Merged 2026-08-15 - PR #541, verified end-to-end against a restored production snapshot (44/44
  tenants repaired cleanly, including the real Liempyo Laundry tenant). The migration dry-run box
  left open below is satisfied by that run.

### Dependencies and Governance Note

- ADR 0064 (Services Handoff Legs and Round-Trip Persistence) - authorizes this phase in full;
  decisions 2, 4, and 7 are implemented directly, decision 3 (no profile key on the wire) is
  structurally enforced by the new table's `(booking_id, direction)` unique index rather than
  implemented here (the derivation function is Phase 100).
- ADR 0057 (Services Fulfillment Profiles) clause 4 (`[binding]`) - unaffected; `item_handoff`
  keeps the vocabulary keyed off `ServiceItemDetail.service_area_type`, a per-item field.
- No compliance impact declaration required: `modules/services/` and
  `apps/dgfy-migration-runner/migrations/` are not in
  `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`; `check:compliance` reports
  no compliance-sensitive changes. Flagged anyway in the PR: the new leg table stores customer
  addresses, which the mechanical guardrail does not classify, though `ServiceBooking` already
  holds name/email/phone so this is incremental exposure, not a new category.
- **Deploy-order dependency on PR #540 / issue #539, kept as a separate PR deliberately** (different
  domain - an unrelated F&B modifier schema-repair bug, found by dry-running this phase's migration
  locally, not caused by it). Applying this phase's migration to any live environment restarts
  `dgfy-api` there, and `sync-tenant-schemas.js`'s tenant preflight is unconditional and
  all-or-nothing under `NODE_ENV=production` - if any real tenant in that environment has the
  `fnb_modifier_groups`-shaped gap #539 documents, that restart crash-loops the whole shared API for
  every tenant, independent of whether this phase's own schema is correct. **#540 should be applied
  to an environment before or alongside this phase**, not because they're the same change, but
  because they share the same restart trigger. See
  `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` (once #540 merges) for the pre-deploy
  `--mode report` census this recommends running first.

### Acceptance and Validation Evidence

- [x] `node --check` on every changed/new `.js`/`.cjs` file (Tier 0; `apps/dgfy-api` has no real
  build step).
- [x] `npm run check:architecture` passes: 47 modules / 467 files checked, 86 controllers checked.
- [x] `npm run check:compliance` passes: no compliance-sensitive changes detected.
- [x] `npm run lint:docs` passes (chains `check:adr`): 28 governed docs, 71 ADRs - unaffected by
  this phase's code-only diff, run as a sanity check.
- [x] Targeted Jest: `fulfillmentProfiles.contract.test.js` (15/15, updated for the new
  `item_handoff` resolution and the now-expressible `out_for_return` status) and
  `servicesMode.usecases.test.js` (54/54, including the existing "rejects invalid booking status
  jumps" transition-map test, unaffected) both pass; 63/63 across all `services`/`fulfillment`
  suites.
- [x] `sync-tenant-schemas.js` loads cleanly post-edit; `getTenantSchemaCapabilityChecksum()`
  computes without error under the bumped `TENANT_SCHEMA_CAPABILITY_VERSION` (`2026-08-15.1`); the
  two new tables and two new enum contracts are present in the registries at runtime.
- [x] `models/index.js` loads cleanly; `ServiceBookingHandoffLeg`/`ServiceBookingStatusEvent`
  associations resolve as designed (`handoffLegs`, `statusEvents` on both sides); confirmed neither
  new model is in `tenantModelFactory.js`'s `NON_TENANT_MODEL_EXPORTS` exclusion set, matching
  `ServiceBookingLine`'s treatment.
- [x] Migration dry-run against a live tenant database - run against a restored production
  snapshot as part of PR #541 (44/44 tenants repaired cleanly).

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260815000001-widen-services-handoff-enums.cjs`
- `apps/dgfy-migration-runner/migrations/20260815000002-create-service-booking-handoff-legs.cjs`
- `apps/dgfy-migration-runner/migrations/20260815000003-create-service-booking-status-events.cjs`
- `apps/dgfy-api/src/models/ServiceBookingHandoffLeg.js`
- `apps/dgfy-api/src/models/ServiceBookingStatusEvent.js`
- `apps/dgfy-api/src/models/ServiceBooking.js`, `ServiceItemDetail.js`, `index.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/modules/services/usecases/serviceUseCases.js`,
  `src/validators/serviceValidator.js`
- `packages/shared-constants/src/fulfillmentProfiles.js`
- `apps/dgfy-api/tests/fulfillmentProfiles.contract.test.js`
- Issue #482 - Laundry pickup-and-return round trip (`pickupReturnLogistics`)
- Issue #538 - Services storefront route ownership (#535 follow-through, filed alongside this
  phase, not part of it)

## Phase 89 - POS Items Gallery and IMS CSV Import Foundation

### Initiative and Release

- Initiative: POS Items multi-image management and IMS-equivalent item bulk import.
- Release: `codex/pos-items-gallery-csv-import` targeting `develop`.

### Objective and Scope

- Expose the existing five-image Storefront item gallery inside the POS Items
  create and edit flows.
- Reuse the existing IMS CSV import wizard and `/items/import/*` contracts in
  POS Items with the dedicated `items:import` permission.
- Preserve Catalog/Inventory ownership and the existing POS primary-image
  presentation behavior.

### Status

- `completed`
- User approval received on 2026-08-14.

### Dependencies and Governance Note

- ADR 0029 Catalog, Inventory, POS, and Storefront Ownership Boundaries.
- ADR 0055 Tenant-Scoped POS Catalog Realtime Invalidation.
- `docs/guides/csv_import_guide.md`.
- Existing `storefront_image_gallery` contract and CSV import APIs.

### Acceptance and Validation Evidence

- [x] POS create and edit flows support up to five images with primary-image
  ordering, individual removal, and per-file validation.
- [x] POS exposes the IMS CSV Upload -> Preview -> Confirm -> Result flow only
  to users with `items:import`.
- [x] Successful CSV imports refresh the current POS and publish the existing
  tenant-scoped catalog invalidation for other POS terminals.
- [x] Feature-level frontend, backend, architecture, API, and guide validation
  passes; final release-wide gates are tracked in Phase 93.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalPageLayout.jsx`
- `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `apps/dgfy-web/Components/items/CSVImportModal.jsx`
- `apps/dgfy-api/src/modules/csv/controllers/itemCsvImportHandlers.js`
- `docs/api/specification.md`
- `docs/guides/csv_import_guide.md`

### Completion Record (2026-08-14)

- Phase 89 completed after the gallery, POS CSV entry point, catalog invalidation,
  focused tests, production POS build, architecture checks, and unauthenticated
  browser smoke passed. Phase 90 is the next eligible phase.

## Phase 90 - POS Items Multi-Image Gallery Delivery

### Initiative and Release

- Initiative: POS item create/edit gallery controls.
- Release: POS Items gallery delivery.

### Objective and Scope

- Replace the current first-file-only UI behavior with the existing five-image
  gallery contract while keeping the first image as POS primary presentation.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 89 permission and contract foundation.
- ADR 0029 and the existing Storefront gallery API remain authoritative.

### Acceptance and Validation Evidence

- [x] Create and edit modal gallery flows are covered by component contracts.
- [x] The five-image gallery limit and the backend 100 MB source-image policy
  are enforced; the POS does not reject large files before server optimization.
- [x] Primary-image reorder and individual deletion are persisted.

### Completion Record (2026-08-14)

- Phase 90 completed with the POS shared-gallery controls and focused frontend
  contracts passing. Phase 91 is the next eligible phase.

## Phase 91 - POS Items IMS CSV Import Delivery

### Initiative and Release

- Initiative: POS Items bulk catalog import.
- Release: IMS-equivalent CSV import delivery.

### Objective and Scope

- Add the existing IMS CSV import wizard to POS Items without duplicating
  import parsing, validation, or persistence logic.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 89 permission wiring.
- `docs/guides/csv_import_guide.md` and the existing CSV import module govern
  templates, limits, SKU upsert behavior, and workflow-mode validation.

### Acceptance and Validation Evidence

- [x] Correct workflow-mode template is downloadable from POS.
- [x] Preview, confirmation, row errors, partial results, and refresh are
  covered by UI and transport tests.
- [x] Import remains gated by `items:import`, not `items:create`.

### Completion Record (2026-08-14)

- Phase 91 completed with the existing IMS wizard reused in POS, the permission
  gate wired through the terminal page, and frontend/backend focused tests
  passing. Phase 92 is the next eligible phase.

## Phase 92 - POS Catalog Refresh After CSV Import

### Initiative and Release

- Initiative: Cross-terminal catalog consistency.
- Release: CSV import invalidation hardening.

### Objective and Scope

- Publish the existing `pos.catalog.changed` invalidation after successful item
  CSV creates or updates and preserve current cart/search/filter state on
  refresh.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 91 import confirmation behavior.
- ADR 0055 governs event publication and client re-fetch behavior.

### Acceptance and Validation Evidence

- [x] Current POS refreshes after import.
- [x] Other connected POS terminals receive the invalidation and re-fetch.
- [x] Failed-only imports do not publish a false catalog update.

### Completion Record (2026-08-14)

- Phase 92 completed with `csv_items_imported` publication for created/updated
  item IDs and a transport test proving the tenant-scoped event payload. Phase
  91 is the next eligible phase.

## Phase 93 - POS Items Gallery and Import Release Hardening

### Initiative and Release

- Initiative: POS Items feature verification and documentation closure.
- Release: POS Items gallery/import readiness.

### Objective and Scope

- Complete responsive browser proof, regression testing, governed documentation,
  and release evidence for Phases 89-92.

### Status

- `in_progress`

### Dependencies and Governance Note

- Depends on Phases 90, 91, and 92.
- Requires architecture, compliance, docs, frontend, backend, and POS smoke
  validation before completion.

### Acceptance and Validation Evidence

- [x] Targeted frontend and backend suites pass; the production POS build also
  passes.
- [x] Architecture and controller-boundary checks pass, and API/CSV guide/phase
  documentation are updated.
- [x] Compliance, API-contract, documentation-lint, and strict ADR checks pass;
  the Phase 93 impact declaration is recorded at
  `docs/compliance/impact-declarations/2026-08-14-pos-items-gallery-csv-import.md`.
- [x] Unauthenticated desktop browser smoke reaches the POS login screen with
  no page errors, failed requests, or 5xx responses; the only console error is
  the expected 401 from `/api/v1/pos/device/status`.
- [x] Frontend bundle-budget gate passes: POS checkout is 152.98 KB / 154 KB
  and SKUpervisor `TerminalPage-` is 115.99 KB / 116 KB after keeping the
  `items:import` check inside the POS-only Items workspace.
- [x] POS accepts large image sources without a local byte rejection; the
  gallery transport and use case enforce the backend 100 MB source policy,
  while shared image storage generates optimized delivery variants.
- [x] Existing POS item edits show an immediate local image preview,
  automatically persist the upload, and replace the preview with the optimized
  delivery asset. New item drafts continue queuing files until item creation.
- [x] Existing-item image uploads now acknowledge quickly with a background
  job, keep Save Item independent from image optimization, and refresh the
  item/gallery through catalog-change invalidation after the optimized asset
  replaces the temporary preview. The interactive POS does not poll the job;
  the same API path is used by the POS browser and iMin WebView.
- [ ] Full frontend regression remains open: 316 files and 1,798 tests passed;
  6 unrelated files failed with 11 timeout or contract failures outside the
  POS Items gallery/import scope.
- [ ] Full backend regression remains open because the repository-wide Jest run
  exceeded the 304-second execution window; the focused CSV transport suite
  passes.
- [ ] Authenticated responsive desktop/mobile proof remains open because no
  approved E2E credentials are available in this workspace. Unauthenticated
  desktop proof is complete.

### Completion Record

- Phase 93 remains an in-progress hardening phase with its existing release
  gates unchanged. On 2026-08-15, the user explicitly directed Phase 94 to
  start as a separately tracked POS payment follow-up without treating Phase
  91 as completed.

## Phase 94 - Current Sale Split Payment and Automatic Order Overview

### Initiative and Release

- Initiative: POS cashier split-payment flow simplification.
- Release: Current Sale payment shortcut and canonical receipt handoff.

### Objective and Scope

- Add a Split Payment action beside Apply Discount in Current Sale while
  retaining the existing split-payment entry inside checkout.
- Rename the split allocation action from Apply Split Payment to Record
  Payment.
- After the server reports zero remaining, call the existing idempotent
  completion operation automatically and open the canonical Order Overview
  only when a transaction is returned.
- Keep merchant-owned walk-in GCash outside PayMongo and preserve Services mode
  without F&B-only parked-sale controls.

### Status

- `in_progress`
- User approval received on 2026-08-15.
- User explicitly directed implementation to start alongside the still-open
  Phase 93 validation work on 2026-08-15.

### Dependencies and Governance Note

- Depends on the completed automatic-finalization, recovery, and configurable
  payment-row contracts in Phases 69, 74, and 84.
- Governed by
  `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
  and `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.
- Classified `within-existing-boundary`: this phase changes frontend entry and
  orchestration only. It adds no database migration, provider checkout, or
  PayMongo behavior.
- Phase 93 remains open and is not implied complete by Phase 94 work.

### Acceptance and Validation Evidence

- [x] Current Sale renders Split Payment beside Apply Discount and the existing
  checkout Split Payment action remains available.
- [x] Record Payment persists non-cash rows before cash through the existing
  idempotent allocation operations and hands the server-returned ready session
  to the existing idempotent completion operation.
- [x] A missing or failed completion result keeps the recorded session
  recoverable, exposes Retry Finish Sale, and does not open a receipt.
- [x] Successful completion clears the current sale and opens the canonical
  `order_preview` receipt source used by normal checkout.
- [x] Focused split-payment, presentation, and responsive validation passes: 4
  files and 38 tests, including desktop/mobile mixed tender, completion
  failure/retry, Services-mode presentation, and terminal scroll contracts.
- [x] Changed-file frontend lint reports zero errors (8 pre-existing warnings
  in `POSCheckoutTerminal.jsx`) and the production POS build passes.
- [ ] Authenticated rendered desktop and mobile proof remains required for the
  direct Current Sale action, Record Payment, automatic Order Overview, and
  failure recovery.
- [ ] The combined dirty branch frontend bundle gate remains open: POS checkout
  is 161.7 KB / 154 KB and SKUpervisor Terminal is 116.03 KB / 116 KB. The
  limit must not be increased to close this gate.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/PosCurrentSaleActions.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentWorkflow.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentDialog.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posModePresentationMatrix.behavior.test.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentManualTender.behavior.test.jsx`

### Completion Record

- Phase 94 remains in progress until authenticated rendered proof and the
  combined branch bundle-budget gate pass. On 2026-08-15, the user approved
  Phase 95 as a separately tracked Storefront PayMongo correction; that work
  does not imply Phase 94 completion.

## Phase 95 - Simple Storefront PayMongo Payment Methods

### Initiative and Release

- Initiative: Storefront online-payment template parity and channel safety.
- Release: Simple/MSME checkout Card, GCash, Maya, and QR Ph integration.

### Objective and Scope

- Replace the Simple/MSME checkout's hardcoded Cash-only payment list with the
  existing server-resolved Storefront payment capability contract.
- Route every enabled online Card, GCash, Maya, and QR Ph selection through the
  PayMongo commerce payment-session endpoint.
- Preserve walk-in POS GCash as a merchant-owned physical-QR tender that never
  enters PayMongo.
- Restore PayMongo hosted-checkout return sessions on both F&B and Simple order
  routes without creating duplicate orders.

### Status

- `in_progress`
- User approval received on 2026-08-15.
- The user explicitly confirmed the channel rule on 2026-08-15: all online
  wallet/card methods use PayMongo; only walk-in POS uses the store's physical
  GCash QR.

### Dependencies and Governance Note

- Depends on ADR 0052's landlord-owned commerce payment-session and verified
  provider-finalization contract.
- Depends on the existing Storefront catalog `payment_capabilities` response and
  the PayMongo payment-session polling/finalization workflow.
- Classified `within-existing-boundary`: the phase reuses existing Storefront
  and commerce-payment boundaries and introduces no database migration or new
  settlement decision.
- Phase 94 remains open and is not implied complete by this separately approved
  Storefront correction.

### Acceptance and Validation Evidence

- [x] Simple checkout builds Cash, Card, GCash, Maya, and QR Ph choices from
  `selectedStore.payment_capabilities`; disabled online methods remain hidden
  in production, with the existing explicit QR Ph sandbox override retained.
- [x] A shared online-payment helper routes Card, GCash, Maya, and QR Ph through
  `POST /api/v1/store/checkout/payment-sessions` and rejects Cash.
- [x] Simple checkout renders the shared PayMongo status/QR panel, prevents a
  duplicate submit while a payment session is active, and offers Cash recovery.
- [x] Hosted PayMongo return parameters restore the payment session on both F&B
  and Simple order routes before status polling resumes. DGFY-hosted stores use
  a store-specific `/tenant-store/:slug/order` return instead of the generic
  `/payment-return` discovery fallback; verified custom domains retain `/order`.
- [x] After the verified session becomes `finalized` and exposes its server-owned
  tracking PIN, both manual **Return to Merchant** and PayMongo's automatic
  redirect continue through the existing Storefront polling flow and navigate
  to that order's tracking route without creating a duplicate order.
- [ ] Exact Masu Cafe sandbox session `CPS-BBF4RAYCYN` reaches the corrected
  store order route, but remains `awaiting_payment` because the configured
  `PAYMONGO_WEBHOOK_ENDPOINT_URL` is still a placeholder and no signed PayMongo
  webhook was received. End-to-end tracking proof remains blocked until a real
  public webhook endpoint is configured and PayMongo delivery succeeds.
- [x] Focused Storefront payment validation passes: 2 files and 25 tests.
- [x] Changed-file frontend lint reports zero errors; the Storefront production
  build passes.
- [ ] The combined dirty-branch frontend budget gate remains blocked by the
  existing POS Checkout 161.7 KB / 154 KB and SKUpervisor Terminal 116.03 KB /
  116 KB overruns. Storefront builds successfully; budget limits were not
  increased.
- [ ] Authenticated rendered desktop and mobile proof remains required for the
  Simple checkout selection, QR/status panel, hosted return, and Cash recovery.
- [ ] Masu Cafe currently reports `FEATURE_DISABLED` for Card, GCash, Maya, and
  QR Ph. Sandbox feature flags, PayMongo configuration, and tenant revenue
  policy/readiness must pass before these methods become customer-visible.

### Implementation Links

- `apps/dgfy-web/apps/store/src/shared/model/storefrontCheckoutPaymentOptions.js`
- `apps/dgfy-web/apps/store/src/shared/services/storefrontOnlinePaymentSession.js`
- `apps/dgfy-web/apps/store/src/shared/components/checkout/StorefrontOnlinePaymentPanel.jsx`
- `apps/dgfy-web/apps/store/src/shared/hooks/useCheckoutSubmission.js`
- `apps/dgfy-web/apps/store/src/modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx`
- `apps/dgfy-web/apps/store/src/modes/simple/checkout/hooks/useSimpleCheckoutRouteProps.js`
- `apps/dgfy-web/apps/store/src/__tests__/simpleCheckoutOnlinePayments.contract.test.js`

### Completion Record

- Phase 95 remains in progress until authenticated rendered proof passes and
  the Masu Cafe sandbox capability response enables at least one PayMongo online
  method through the governed readiness contract. Phase 96 was explicitly
  approved as a parallel POS discount/split-tender correction and does not
  imply Phase 95 completion.

## Phase 96 - POS Discount Visibility and Safe Split-Tender Correction

### Initiative and Release

- Initiative: POS checkout discount clarity and payment-method safety.
- Release: POS Confirm Checkout discount summary and governed split-tender
  compatibility.

### Objective and Scope

- Show the applied discount label and amount inside Confirm Checkout.
- Allow the cashier to remove an unsaved discount with an explicit trash action
  and immediately restore the canonical total.
- Permit split tender for every valid governed discount. The server-owned quote
  applies the discounted total before allocations and the final checkout
  revalidates the discount against current rules and lines.
- Verify employee/manual approval PINs during split-session creation, store only
  a non-secret server approval proof, and never transport or persist the raw PIN
  in a payment session. Senior/PWD beneficiary validation remains server
  authoritative.

### Status

- `in_progress`
- User approval received on 2026-08-15.

### Dependencies and Governance Note

- Depends on ADR 0033's server-authoritative commercial promo and statutory
  discount rules, ADR 0063's server-owned split-payment session, and the POS
  split-payment feature contract.
- Classified `within-existing-boundary`: no database migration, provider
  integration, or payment-ledger change is introduced.
- The frontend display/removal is additive. Split tender reuses the existing
  governed discount snapshot and server quote; approval-protected discounts
  use the server-only proof handoff at completion.

### Acceptance and Validation Evidence

- [x] Confirm Checkout renders a discount summary with label, amount, and
  accessible trash removal control.
- [x] Removing an unsaved discount clears governed, preset, and manual discount
  state and recalculates the sale total.
- [x] Split tender remains enabled after applying any valid discount, while the
  server quote and completion path preserve governed validation.
- [x] Employee/manual approval PIN verification occurs at session creation and
  completion uses only the server-owned proof; the raw PIN is absent from the
  stored snapshot and checkout payload.
- [x] Checkout confirmation no longer auto-focuses or scrolls to Total Payment;
  the cashier must click the field before entering tender.
- [x] Focused split-session and UI contract suites pass: backend split-session
  coverage is 26 tests and the changed POS UI contract is 9 tests; adjacent
  split-tender behavior suites also pass (28 tests across 3 files).
- [x] Changed-file ESLint reports zero errors; existing warnings remain
  unchanged.
- [x] POS production build passes.
- [x] Local rendered POS route loads without an error boundary; terminal login
  is required before an authenticated checkout-modal proof can be captured.
- [ ] Authenticated rendered desktop and mobile proof of discount removal and
  discounted split tender remains required.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posSplitPaymentUi.contract.test.js`
- `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
- `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`

### Completion Record

- Phase 96 remains in progress until authenticated rendered desktop/mobile proof
  passes. Phase 97 is the next eligible phase after this correction closes.

## Phase 97 - Shared Parked Sales and Cashier Handoff

### Initiative and Release

- Initiative: POS cashier handoff and shared parked-sale recovery.
- Release: current POS cashier hardening sequence.

### Objective and Scope

- Show active parked sales to authorized cashiers within the same branch,
  regardless of which cashier or shift originally parked them.
- Allow a cashier with an open shift at that branch to explicitly resume an
  unclaimed parked sale and become its current operational owner.
- Preserve original cashier/shift identity, prevent cross-branch access, keep
  claimed-sale leases exclusive, and allow unclaimed handoff work to outlive
  the originating shift while maintaining shift-close accounting.

### Status

- `in_progress`
- User approval received on 2026-08-15.
- Started on 2026-08-15 alongside the still-open Phases 93, 94, 95, and 96.

### Dependencies and Governance Note

- ADR 0065 POS Shared Parked Sales and Cashier Handoff supersedes ADR 0061 for
  parked-sale visibility and ownership.
- ADR 0031 continues to govern terminal occupancy and cash-drawer ownership;
  this phase does not create parallel open shifts or reassign drawers.
- Classified `cross-boundary`: additive tenant migration, POS API/use-case
  ownership change, frontend queue behavior, audit evidence, and shift-close
  validation.

### Acceptance and Validation Evidence

- [x] Additive origin-ownership migration applies to every tenant schema and
  backfills existing parked rows; the landlord migration and all 14 active
  tenant schemas are healthy after repair.
- [x] Same-location cashiers can list and resume unclaimed parked sales;
  different-location claims fail closed, while cancellation remains limited to
  the current parked-sale owner.
- [x] Origin ownership remains visible in the parked record and audit event;
  current ownership moves to the resuming cashier/shift.
- [x] Claimed carts remain exclusive and cannot be edited concurrently.
- [x] Re-park, split-payment creation, checkout, and cancellation use current
  operational ownership; shift-close blockers count only claimed carts owned
  by the current shift, while unclaimed carts remain available for handoff.
- [x] Pending offline parked-sale syncs and claimed carts still block normal and
  stale-recovery shift close with actionable copy.
- [x] Focused backend/frontend tests, targeted lint, POS build, migration/
  runtime-schema checks, and architecture/doc gates pass; unauthenticated POS
  smoke reaches the locked terminal without a runtime error boundary.
- [ ] Authenticated rendered desktop/mobile proof remains required.

### Implementation Links

- `apps/dgfy-api/src/models/PosParkedSale.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/parkedSaleUseCases.js`
- `apps/dgfy-api/src/services/runtimeSchemaAuditService.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-web/src/features/pos/components/POSParkedSalesDialog.jsx`
- `apps/dgfy-web/src/features/pos/utils/posShiftCloseResolution.js`
- `apps/dgfy-web/src/features/pos/utils/__tests__/posShiftCloseResolution.test.js`
- `apps/dgfy-migration-runner/migrations/20260815000002-add-pos-parked-sale-origin-ownership.cjs`
- `docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md`

### Completion Record

- Phase 97 remains in progress until all acceptance gates and authenticated
  rendered proof pass. Phase 98 is the next eligible phase after completion.

## Phase 98 - PIN-Driven Discount Accountability

### Initiative and Release

- Initiative: POS discount authorization and audit accountability.
- Release: current POS checkout hardening sequence.

### Objective and Scope

- Remove the mandatory manual discount reason so a valid discount is not blocked
  by free-text entry.
- Require a server-verified PIN from an active authorized employee for every
  governed POS discount type: Senior, PWD, Employee, Promo, and Manual.
- Record the canonical PIN owner separately from the cashier handling the sale,
  including discount type/rate/amount, order reference, and approval time.
- Expose authorization evidence in POS transaction history and the Admin audit
  workspace; never persist the raw PIN.
- Reject legacy generic discount fields when they are not backed by a governed
  discount and verified employee PIN.

### Status

- `in_progress`
- User approval received on 2026-08-15.

### Dependencies and Governance Note

- Depends on ADR 0033's server-authoritative POS discount rules and approval
  boundary, the existing `manager_approval_id` relation, and the POS split-
  tender server-owned quote/proof contract.
- Classified `within-existing-boundary`: one idempotent audit-log compatibility
  migration is required because the existing audit model already depends on
  actor/context columns that older tenant schemas do not contain. No new
  discount table or PIN-storage column is introduced; existing discount
  approval identity and immutable audit JSON are reused.
- Existing Admin/Manager defaults remain compatible. The new
  `pos:discount_authorize` permission delegates authorization to an explicitly
  permitted employee without changing PIN storage ownership.

### Acceptance and Validation Evidence

- [x] Manual reason is optional in the POS UI and backend policy.
- [x] The server requires and verifies an active authorized employee PIN for
  every governed discount type; Admin users no longer bypass approval.
- [x] The audit record stores PIN owner, cashier, discount type/rate/amount,
  transaction reference, and approval timestamp; raw PIN is not persisted.
- [x] POS transaction history shows discount amount/type and the authorizing
  employee; Admin audit labels show authorizer and cashier separately.
- [x] Split-payment session creation and completion retain only a server-owned
  approval proof and revalidate the PIN owner before posting the sale.
- [x] Focused backend/frontend tests, changed-file lint, and POS build pass.
- [ ] Authenticated rendered POS proof confirms the authorization modal,
  optional reason, history evidence, and Admin audit evidence.

### Implementation Links

- `apps/dgfy-api/src/config/permissions.js`
- `apps/dgfy-api/src/modules/pos/domain/posDiscountApprovalPolicy.js`
- `apps/dgfy-api/src/modules/pos/domain/posDiscountPolicy.js`
- `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/splitPaymentUseCases.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/components/POSSplitPaymentWorkflow.jsx`
- `apps/dgfy-web/src/features/pos/components/POSTransactionHistoryPanel.jsx`
- `apps/dgfy-web/src/features/pos/components/AuditWorkspacePanel.jsx`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/Components/users/UserManagementModal.jsx`
- `apps/dgfy-migration-runner/migrations/20260815000003-align-audit-log-context.cjs`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`

### Completion Record

- Phase 98 remains in progress until focused validation and authenticated
  rendered proof pass. Phase 99 is the next eligible phase after completion.

## Phase 99 - POS-Native Discount Authorization Setup

### Initiative and Release

- Initiative: Move POS discount authorization setup into the POS surface.
- Release: current POS checkout hardening sequence.

### Objective and Scope

- Let the Master Admin enable or disable explicit discount authorization for
  cashiers and staff from POS Settings.
- Let the Master Admin configure or reset the authorized employee's POS
  approval PIN from the same POS Settings section.
- Allow an active cashier or explicitly authorized employee to hold a PIN;
  preserve server-side role, permission, active-user, and PIN validation.
- Remove the specialized discount-PIN control from SKUpervisor User Management
  so the operational setup has one POS-native home.

### Status

- `in_progress`
- User approval received on 2026-08-15.

### Dependencies and Governance Note

- Depends on Phase 98's `pos:discount_authorize` permission and server-owned
  PIN verification boundary.
- Uses the existing users permission and POS approval PIN endpoints; no raw PIN
  is exposed or stored and no new authorization table is introduced.
- Permission changes remain Master Admin-only, while discount authorization at
  checkout remains enforced by the API.

### Acceptance and Validation Evidence

- [x] POS Settings lists active employees and shows built-in versus explicit
  discount authorization.
- [x] POS Settings can grant or revoke `pos:discount_authorize` for a cashier
  or staff employee.
- [x] POS Settings can set or reset a PIN after authorization is enabled.
- [x] POS checkout keeps authorized employees visible when PIN setup is
  incomplete, marks them as unavailable, and blocks unconfigured selection.
- [x] The discount PIN input is cleared on modal open and resists browser
  password autofill.
- [x] POS PIN inputs are treated as masked one-time numeric codes rather than
  account passwords, preventing browser breach-password warnings while keeping
  the PIN hidden and server-verified.
- [x] An empty optional Employee ID is normalized to `null` before PIN
  verification, preventing a false 422 `Validation failed` response.
- [x] Applying a discount from Current Sale returns the cashier to the
  Checkout confirmation modal after successful authorization.
- [x] Employee is the first discount type with a default 15% rate, and a new
  discount preselects the active shift cashier when that cashier is authorized
  and has a configured PIN.
- [x] The API permits PIN configuration for active explicitly authorized
  employees while preserving the Master Admin-only management boundary.
- [x] SKUpervisor no longer exposes the specialized discount-PIN control.
- [x] Focused frontend/backend tests and changed-file lint pass.
- [ ] Authenticated rendered POS proof confirms the toggle, PIN setup, and
  cashier visibility in the Apply Discount modal.

### Implementation Links

- `apps/dgfy-api/src/services/userService.js`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/Components/users/UserManagementModal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/discountApproverManagement.contract.test.js`

### Completion Record

- Phase 99 remains in progress until authenticated rendered POS proof passes.
- Phase 100 is the next eligible phase after completion.

## Phase 100 - Services Handoff-Leg API Contract

### Initiative and Release

- Initiative: Services pickup-and-return round trip (laundry handoff legs), continuing #482.
- Release: unreleased; backend API contract only (`apps/dgfy-api` + `packages/shared-constants`).
  No storefront wiring, no services tracking UI, and no POS in this phase — each is its own later
  phase. *(Corrected 2026-08-17: this entry originally reserved Phases 101/102/103 by number for
  those three follow-ups. They were never filed as ledger entries, and per this file's own
  continuous-numbering rule the next eligible phase is taken from the highest existing entry — so
  Phase 101 went to the voucher initiative. The services follow-ups take their numbers when they
  are actually written.)*

### Objective and Scope

- Authorized by ADR 0064 (Phase 87). Makes Phase 88's schema live: the booking payload can carry
  `handoff_legs`, the API persists both legs plus a `ServiceBookingStatusEvent` trail, and the
  public tracking read returns the per-variant six-stage timeline.
- **Wire contract**: `handoff_legs` is a two-item array (`{direction, method, address_line |
  customer_address_id | location_id, scheduled_from, scheduled_to, contact_name, contact_phone,
  instructions}`) added to `serviceBookingCoreSchema` (`apps/dgfy-api/src/validators/
  serviceValidator.js`), so it is reachable from the public, admin, and per-draft batch booking
  schemas alike, but not the hold schema. A direction-conditional method whitelist
  (`inbound: business_pickup`; `outbound: business_delivery | customer_collection`) admits only
  the two profiles ADR 0064 decision 1 authorizes - `customer_dropoff` (the
  `item_dropoff_collection` shape) is in the DB enum from Phase 88 but rejected at the validator.
- **Derivation** (`packages/shared-constants/src/fulfillmentProfiles.js`):
  `deriveFulfillmentProfileFromHandoffLegs` maps `(inbound method, outbound method)` to a profile
  key server-side only; it returns `null` for every unauthorized shape, which is the decision-1
  enforcement surface, not merely a validation nicety. **No fulfillment-profile key is ever
  returned to the caller** (ADR 0064 decision 3, read strictly) - the public tracking read returns
  only the resolved `fulfillment.timeline`, never the variant string.
- **Persistence**: legs and a seed `null -> <created status>` status event are written inside the
  same transaction as booking creation, in the one shared writer (`createServiceBookingRecord`)
  that single/hold/batch bookings all funnel through - hold creation is exempt from the
  "`item_handoff` requires legs" gate, since a hold reserves capacity ahead of the step where legs
  are actually captured. `customer_address_id` is session-gated (ownership-checked, 403 on
  mismatch) rather than admin-only, the same trust-boundary shape as `pos_transaction_id` but
  needed by signed-in guests. Idempotency replay is unaffected (it returns before the writer runs);
  `bookingRequestHashPayload` now sorts `handoff_legs` by direction so wire order never causes a
  spurious 409.
- **Status transitions**: `buildUpdateServiceBookingStatusUseCase` now writes a
  `ServiceBookingStatusEvent` per real transition (skipped on a same-status no-op) and drives each
  leg's own `pending -> scheduled -> in_transit -> completed`/`cancelled` lifecycle off the booking
  status (`for_pickup` -> inbound `in_transit`, `pickup_completed` -> inbound `completed`,
  `out_for_return` -> outbound `in_transit`, `ready_for_collection` -> outbound `scheduled`,
  `completed` -> outbound `completed`, `cancelled` -> every non-terminal leg `cancelled`). Actor
  attribution threads `req.user` through the controller for the first time on this route.
- **Two Phase 88 gaps closed as part of this phase** (both small, both in-module): (a)
  `BOOKING_STATUS_TRANSITIONS.confirmed` now also allows `for_pickup` - the confirmed merchant
  state machine documented in the discover-flow proposal is `requested -> confirmed -> for_pickup`,
  which Phase 88 left dead-ended into `checked_in`; (b) `serviceRepository.getDashboardMetrics`'s
  `activeStatuses` now includes the four round-trip statuses, so a handoff booking no longer
  vanishes from the staff dashboard once it leaves `requested`/`confirmed`.
- **Capability-module gating**: unchanged per ADR 0064 decision 6. `capabilityModules.js` is not
  touched; both profiles and `pickupReturnLogistics` stay `status: 'planned'`, pinned by a new
  regression test. Eligibility gates on the per-item `service_area_type === 'item_handoff'` (ADR
  0057 clause 4), not a capability flag.

### Status

- `in_progress`
- Code written and Tier 0/1-verified (see below); not yet run against a live tenant database.
  Mirrors Phase 88's own precedent - that phase stayed `in_progress` until its migration dry-run
  ran against a restored snapshot in PR #541. This phase flips to `completed` once the equivalent
  live-tenant end-to-end run (create both leg shapes, drive the full status sequence, confirm the
  public tracking read) is done.

### Dependencies and Governance Note

- ADR 0064 decisions 1, 2, 3, 5 (`[binding]`) and 4, 6 (`[default]`) - all implemented as specified;
  none required a new ADR or amendment. Decision 3's "never transmitted" is read strictly: the
  derived variant key is computed server-side but never serialized in any response.
- ADR 0057 clause 4 (`[binding]`) - unaffected; the item-level gate in `createServiceBookingRecord`
  keys off `ServiceItemDetail.service_area_type`, never a tenant/template setting.
- **Hard deploy-order dependency on Phase 88 (PR #541).** This phase is non-functional without
  `service_booking_handoff_legs`/`service_booking_status_events` existing; deliberately no
  missing-table tolerance (unlike `isMissingStorefrontLocationItemOverrideTableError`'s pattern
  elsewhere) - a silent leg loss on an under-migrated tenant is worse than a loud failure.
- No compliance impact declaration required: `modules/services/` is not in
  `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`; `check:compliance` reports
  no compliance-sensitive changes. Flagged anyway, as Phase 88 did: the new leg rows this phase
  starts writing carry customer addresses/contact details, same incremental-exposure note as
  before.

### Acceptance and Validation Evidence

- [x] `node --check` on every changed `.js` file (Tier 0; `apps/dgfy-api` has no real build step).
- [x] `npm run check:architecture` passes: 47 modules / 467 files checked, 86 controllers checked.
- [x] `npm run check:compliance` passes: no compliance-sensitive changes detected.
- [x] `npm run lint:docs` passes (chains `check:adr`): 27 governed docs, 71 ADRs.
- [x] Targeted Jest, all green: `fulfillmentProfiles.contract.test.js` (25/25, incl. new
  handoff-leg derivation + cross-product-drift-guard tests), `serviceBookingValidator.test.js`
  (35/35, incl. new handoff-leg schema tests), `servicesMode.usecases.test.js` (55/55, incl. new
  persistence/gate/IDOR/replay/status-event/redaction tests), `serviceBookingSettlement.usecases.
  test.js` (12/12, incl. new orthogonal-payment tests across all four round-trip statuses) - 127/127
  across the four suites this phase touches.
- [ ] Full `npm test` - not run this session; the repo's monorepo-wide suite OOMs the local Node
  heap independent of this change (observed failing deep in an unrelated pre-existing test file).
  Matches this repo's documented two-tier gate model - the full suite is Pat's own post-merge run,
  not a PR-blocking Tier 0/1 requirement.
- [ ] End-to-end run against a live tenant (create both leg shapes, drive the full status sequence,
  confirm the public tracking read) - not run this session; flagged for a human or a later
  DB-backed session before merge, matching Phase 88's own precedent.

### Implementation Links

- `apps/dgfy-api/src/validators/serviceValidator.js`
- `apps/dgfy-api/src/modules/services/repositories/serviceRepository.js`
- `apps/dgfy-api/src/modules/services/usecases/serviceUseCases.js`
- `apps/dgfy-api/src/modules/services/controllers/serviceHandlers.js`
- `packages/shared-constants/src/fulfillmentProfiles.js`
- `apps/dgfy-api/tests/fulfillmentProfiles.contract.test.js`,
  `serviceBookingValidator.test.js`, `servicesMode.usecases.test.js`,
  `serviceBookingSettlement.usecases.test.js`
- Issue #482 - Laundry pickup-and-return round trip (`pickupReturnLogistics`)

## Phase 101 - Voucher Governance Artifacts

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), implementing the entity scoped in #455
  against the decision record in #454.
- Release: unreleased; documentation and governance only. No code, no schema, no behavior change.
  Schema and models are Phase 102; the voucher module and admin CRUD are Phase 103.

### Objective and Scope

- Land the three governance artifacts #455 requires up front, so every later voucher phase has a
  cited authority rather than accumulating governance debt behind shipped code.
- **New [ADR 0066](../architecture/adr/0066-voucher-sale-time-price-resolution.md)**
  (`topic: voucher_sale_time_price_resolution`). Required, not optional: ADR 0029 Decision 2 is
  `[binding]` that Catalog owns base sale price, and a voucher fixed price is a sale-time layer
  resolved above it — the same move ADR 0050 made for affiliate pricing. Four `[binding]` clauses:
  a voucher never mutates a persisted unit price; integer centavos throughout the voucher domain;
  checkout fails closed while catalog display fails open; the ledger is authoritative and
  `redeemed_*` are a derived cache with POS winning any fiscal disagreement. Seven further
  `[default]` clauses cover the fixed-price-as-intent rule, the resolution seam, the
  affiliate-conflict refusal, the POS single-slot constraint, the columns-first/no-JSON rule,
  `NOT NULL` eligibility sets, and folder-descendant snapshotting.
- **ADR 0033 amendment** (dated block, `status: amended` already set, `last_reviewed` refreshed).
  That ADR carries zero strictness tags, so every clause is `default` tier per ADR 0039 and an
  amendment suffices — no supersession, no tech-lead approval. Records that the
  `system_settings.storefront_promos` JSON-storage premise no longer holds, while explicitly
  preserving Decisions 8 and 10.
- **ADR 0050 amendment** (#566), targeting **Consequences item 5**, not Decision 5. #566 is explicit
  that citing Decision 5 would amend the wrong clause — that one is `[binding]` and its
  fail-closed/fail-open asymmetry is inherited unchanged by ADR 0066 Decision 3. `status` flips to
  `amended`. `docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md` decision A11 and
  §7.4 are updated in lockstep, as #566 requires.
- Corrects Phase 100's by-number reservation of Phases 101/102/103, which were never filed as
  ledger entries.

### Status

- `completed`
- Documentation-only phase with no runtime surface; its acceptance gates are the docs linters, which
  pass. Phase 102 is the next eligible phase.

### Dependencies and Governance Note

- Classified `cross-boundary` per `ARCHITECTURE_GOVERNANCE.md` step 1: the voucher initiative
  introduces a sale-time price layer above a `[binding]` Catalog clause. Step 3's last bullet
  applies — "new cross-boundary decision with no ADR covering it: create an ADR" — which is what
  ADR 0066 is. This phase is the governance half; no boundary is actually crossed in code until
  Phase 104.
- ADR 0029 Decision 2 (`[binding]`) - not amended and not weakened. ADR 0066 layers above Catalog's
  base price and never writes back to it. `requireExplicitSalePrice` and its four call sites are
  untouched, including `assertStorefrontPriceReady`, which must never see a voucher price.
- ADR 0039 - amendment path followed for both 0033 and 0050; new-ADR path followed for 0066.
  Topic uniqueness holds: `voucher_sale_time_price_resolution` collides with neither
  `commercial_promo_and_statutory_pos_discount_boundaries` nor
  `affiliate_buyer_facing_pricing_rule_engine`, so the one-binding-ADR-per-topic rule is satisfied.
- ADR 0066 is deliberately **not** registered in `docs/_meta/document-registry.json`. Per ADR 0039's
  2026-07-29 amendment, `scripts/check-adr.js` owns ADR validation; registering an ADR there would
  fail `lint:docs`, since `status: accepted` is not a registry authority-level value.
- No compliance impact declaration required: this phase changes only files under `docs/`, and
  `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` matches no path here.
  `check:compliance` reports no compliance-sensitive changes. Phases 106 and 107 will each require
  one (`modules/pos/` and `modules/settings/` respectively); flagged now so it is planned rather
  than discovered.
- ADR 0066 Decision 8 records a constraint **wider than #454 decision 10**. That decision blocks
  only fixed-price against a statutory Senior/PWD discount; the existing POS single-slot contract
  (`UNIQUE (transaction_id)` plus a single-typed `governed_discount` payload) blocks every benefit
  class including percent-off. Recorded as an inherited architectural constraint, not presented as
  something #454 already decided. Revisit tracked in #605.

### Acceptance and Validation Evidence

- [x] `npm run lint:docs` passes (chains `check:adr --strict`).
- [x] `npm run check:adr` passes: ADR number 0066 unique, required frontmatter present, tier tags
  resolve, no binding-topic collision.
- [x] `node scripts/check-adr.js --write-index` regenerated `INDEX.md`; 0050 now renders `amended`
  and 0066 appears with its binding-clause count.
- [x] `npm run check:compliance` reports no compliance-sensitive changes.
- [ ] `npm run check:documentation-closure` - **not run.** It requires an `--inventoryPath` option
  (`INVALID_ARGS: Missing required option: inventoryPath`) and is a batch-inventory gate for release
  promotion, not a per-PR docs gate. Named rather than silently omitted; `lint:docs` is the
  applicable gate for this phase and it passes.
- [ ] Human review of the four `[binding]` clauses before they constrain Phases 102-107. Binding
  clauses are the expensive tier to unwind by design; flagged for Pat rather than self-certified.

### Implementation Links

- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (new)
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md` (amended)
- `docs/architecture/adr/0050-affiliate-buyer-facing-pricing-rule-engine.md` (amended)
- `docs/architecture/adr/INDEX.md` (regenerated)
- `docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md` (A11, §7.4)
- Issue #455 - voucher entity and ledger; #454 - decision record; #453 - epic; #566 - the ADR 0050
  amendment this phase discharges; #614 - voucher authoring, filed during this phase

### Completion Record

- Phase 101 completed 2026-08-17. Phase 102 (voucher schema, models, and tenant-sync registry
  entries) is the next eligible phase.

## Phase 102 - Voucher Schema, Models, and Tenant Sync Registry

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), entity scoped in #455.
- Release: unreleased; schema and model layer only. No route, no read path, no write path. The first
  consumer is Phase 103 (voucher module + admin CRUD).

### Objective and Scope

- Create four tenant tables in one migration - they are a single FK cluster, so splitting them only
  complicates the `tableExists()` guard: `vouchers` (the campaign), `voucher_scopes` (item /
  item_folder targeting), `voucher_redemptions` (the authoritative append-only ledger), and
  `voucher_redemption_lines` (per-item allocations).
- Shape follows `EmployeeCreditAccount` + `EmployeeCreditLedgerEntry`, the pattern #455 names: an
  account/ledger split where `vouchers.redeemed_count` / `redeemed_value_centavos` /
  `redeemed_quantity` are a derived cache of the ledger (ADR 0066 decision 4), existing so the three
  exhaustion limits can be enforced by one atomic conditional `UPDATE` in a later
  voucher phase.
- Register all four in `REQUIRED_TENANT_SCHEMA_TABLES` in FK-dependency declaration order and bump
  `TENANT_SCHEMA_CAPABILITY_VERSION` to `2026-08-17.1`. Without the registry entries the migration
  reaches only the landlord database and live tenants never receive the tables.
- Models declare `references` for every tenant-local FK, unlike the `EmployeeCredit*` template. New
  tenants are provisioned by `sequelize.sync()` over the models while existing tenants get the
  registry DDL, so omitting `references` would leave sync-provisioned tenants with no referential
  integrity on the ledger. Verified against `tenantModelFactory.contract.test.js`'s FK-graph rule.

**Four deviations from #455's written schema, each verified in code rather than assumed:**

1. `location_id` references `tenant_locations(location_id)`. #455 lists `locations`; no such table
   exists in the tenant schema.
2. `voucher_scopes.scope_ref_id` carries no FK. It is polymorphic across `items(item_id)` and
   `item_folders(folder_id)` depending on `scope_type`, so a real FK is impossible; the reference is
   validated in the repository in Phase 103. #455 lists it among "every FK the ledger needs".
3. Eligibility is `TINYINT UNSIGNED` bitmasks, not MySQL `SET`. **`DataTypes.SET` does not exist in
   Sequelize 6.37.8** (verified: `typeof DataTypes.SET === 'undefined'`), so a `SET` column cannot
   be expressed in the model layer at all - and `sequelize.sync()` over those models is how
   `tenantProvisioningService.js` builds a new tenant. The bitmask keeps the invariant ADR 0066
   decision 10 actually binds (NOT NULL, explicit default, "eligible everywhere" unrepresentable)
   and matches the `weekday_mask` encoding #455 already mandates on the same table. ADR 0066
   decision 10 was updated in this phase to name the encoding.
4. Cumulative money columns are `BIGINT`, not `INT`. Centavos overflow a signed `INT` at ~21.5M
   pesos, which is inside the range a real campaign budget can reach.

### Status

- `completed`
- Both blocking gaps recorded here when this entry was first written have since been discharged. The
  migration **was** run against a restored 44-tenant MySQL 8.0.46 snapshot; that run is what surfaced
  issue #635 (voucher tenant provisioning diverging across the three schema paths), fixed by merged
  PR #636 (`c370a685`). Phase 103 is the first consumer of this schema.

### Dependencies and Governance Note

- Classified `within-existing-boundary`: additive tables in the tenant database, no existing table
  altered, no boundary crossed. The cross-boundary decision itself is ADR 0066, landed in Phase 101.
- ADR 0066 decisions 2, 4 (`[binding]`) and 9, 10, 11 (`[default]`) - implemented as specified, with
  decision 10 amended in this phase to name the bitmask encoding after the Sequelize `SET` finding.
- ADR 0033 Decision 10 - unaffected. Nothing in this phase writes a discount row; the
  `pos_transaction_discounts` pair remains the fiscal record and is untouched.
- No compliance impact declaration required: `apps/dgfy-api/src/models/`,
  `apps/dgfy-api/scripts/`, and `apps/dgfy-migration-runner/migrations/` match no rule in
  `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`; `check:compliance` reports no
  compliance-sensitive changes. **Flagged anyway**, as Phases 88 and 100 did for their own
  incremental exposure: `voucher_redemptions` stores `store_customer_id`, `cashier_user_id`, and a
  `dgfy_account_id` pointer, so this phase creates a new place where redemption activity is
  attributable to a person. The mechanical guardrail does not classify that; it is named here so it
  is a recorded decision rather than an omission.
- **Hard deploy-order dependency, and a live pre-existing risk.** `OPS-TSYNC-001` in
  `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md` is **Reopened**, with four active tenant
  databases carrying foreign-key drift as of the 2026-06-15 production verification. The tenant
  preflight in `sync-tenant-schemas.js` is unconditional and all-or-nothing under
  `NODE_ENV=production`, so any tenant with a pre-existing gap crash-loops the shared `dgfy-api` for
  **every** tenant on the next restart - independent of this change, but triggered by the restart
  this migration causes. Run
  `node apps/dgfy-api/scripts/sync-tenant-schemas.js --mode report` (read-only, no mutation approval
  needed) against each environment for an honest census **before** deploying this phase.

### Acceptance and Validation Evidence

- [x] `node --check` on all seven changed `.js`/`.cjs` files (Tier 0; `apps/dgfy-api` has no real
  build step).
- [x] `npm run check:architecture` passes: 48 modules / 472 files, 87 controllers.
- [x] `npm run check:compliance` passes: no compliance-sensitive changes detected.
- [x] `npm run check:tenant-schema-coverage -- --staged` passes with the migration staged - the four
  `createTable` calls each resolve to a registered tenant table.
- [x] `tenantModelFactory.contract.test.js` 13/13 - all four models register as tenant-scoped (they
  are absent from `NON_TENANT_MODEL_EXPORTS`, which is what makes them tenant models) and every
  declared FK resolves to a cloned tenant model.
- [x] `tenantSchemaSyncScripts.test.js` 15/15, including a new case pinning declaration order, the
  unique idempotency constraint, the NOT NULL eligibility defaults, `BIGINT` centavos, the absence
  of a `scope_ref_id` FK, and the `tenant_locations` target.
- [x] Model DDL generated offline via Sequelize's query generator to confirm the four tables emit
  valid MySQL and that the bitmask columns render `TINYINT UNSIGNED NOT NULL DEFAULT n`.
- [x] **Migration run against a restored 44-tenant MySQL 8.0.46 snapshot** - discharged after this
  entry was first written. The run surfaced issue #635 (the three tenant-provisioning schema paths
  disagreeing about the voucher tables), fixed by merged PR #636 (`c370a685`).
- [x] **Registry DDL re-verified against the resulting live schema.** The hand-derived entries were
  corrected by PR #636 where they had drifted; this is what closed the second open item.
- [ ] Full `npm test` - not run this session; per the repo's two-tier gate model the full suite is
  Pat's own post-merge run, not a PR-blocking requirement.

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260817000001-create-vouchers.cjs`
- `apps/dgfy-api/src/models/Voucher.js`, `VoucherScope.js`, `VoucherRedemption.js`,
  `VoucherRedemptionLine.js`
- `apps/dgfy-api/src/models/index.js` (imports, associations, `db` object, named exports)
- `apps/dgfy-api/scripts/sync-tenant-schemas.js` (four registry entries, capability version bump)
- `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (decision 10 encoding)
- Issue #455 - voucher entity and ledger; #453 - epic

### Completion Record

- Phase 102 completed 2026-08-18. It was held `in_progress` on two evidence items - the unrun
  migration and the hand-derived registry DDL - mirroring Phase 88's precedent, which stayed
  `in_progress` until its own migration dry-run landed in PR #541. Both were discharged by the
  migration run against a restored 44-tenant MySQL 8.0.46 snapshot and the fix it produced
  (issue #635 -> merged PR #636, `c370a685`).
- Phase 103 (voucher module, pure benefit/eligibility domain, and admin CRUD per #614) is the next
  eligible phase.

## Phase 103 - Voucher Module, Benefit/Eligibility Domain, and Admin CRUD

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), entity scoped in #455, authoring surface
  scoped in #614.
- Release: unreleased; backend module and admin API only. No checkout path is wired - POS and
  storefront redemption is Phase 104, and #614's own UI half is not built here.

### Objective and Scope

- Create `apps/dgfy-api/src/modules/vouchers/` as the first consumer of Phase 102's schema, following
  the `employeeCredit` module shape (composition root, `README.md`, `controllers/usecases/repositories`).
- **`domain/voucherBenefitPolicy.js`** - pure, zero-import benefit math: percent-off, amount-off, and
  fixed-price resolution over prepared lines, plus a largest-remainder allocator so per-line
  allocations sum to the order-level discount with no lost centavo. Mirrors
  `affiliatePricingPolicy.js`'s zero-import discipline so the whole thing is fixture-testable.
- **`domain/voucherEligibilityPolicy.js`** - pure, zero-import, collect-all eligibility evaluation:
  derived status, date window, weekday, time-of-day, the three eligibility masks, basket minimums,
  and the three exhaustion previews. Never throws; returns `{ eligible, reasons[] }`.
- **`repositories/voucherRepository.js`** - the only file touching Sequelize. Every model resolves
  through `dbStore.get(...)`, never a static `../../../models/` import: the voucher tables are
  tenant-scoped, and a static import binds to the landlord connection. Carries the polymorphic
  `scope_ref_id` existence check Phase 102 deviation 2 deferred to this phase, the version-guarded
  conditional UPDATE, the guarded lazy-expiry UPDATE, and a read-only ledger aggregate.
- **`usecases/voucherUseCases.js`** - list / get / create / update / activate / pause / archive over
  the `ok`/`fail` ApplicationResult contract, with the status machine, code-immutability rule, and
  optimistic-lock handling.
- **REST surface** `/api/v1/vouchers` (`routes/vouchers.js` + `validators/voucherValidator.js`),
  mounted in `server.js` beside the affiliate admin routes.

**Four design decisions worth recording, each a deviation from the obvious default:**

1. **Time-window logic fails CLOSED, inverting the promo engine it is adapted from.**
   `commercialPromoPolicy.js`'s `isActiveTime` returns *eligible* both when `start === end` and when
   the timezone cannot be resolved. ADR 0066 decision 3 is `[binding]` that checkout fails closed, so
   the wrap-around arithmetic is inherited and both fail-open branches are inverted into
   `VOUCHER_TIME_WINDOW_DEGENERATE` and `VOUCHER_TIMEZONE_UNRESOLVABLE`. The inclusive-both-bounds
   comparison is inherited deliberately, for parity when promos migrate to vouchers in a later phase.
2. **409 vs 422 is split, where the promo engine has only 422.** `promoError` expresses
   `VALIDATION_FAILED` only. A duplicate `code`, a stale `version`, an illegal status transition, and
   a write to an archived voucher are all well-formed payloads conflicting with server state, which
   is what `DomainErrorCode.CONFLICT` -> 409 already means; a second helper, `voucherConflict`, was
   added rather than mislabeling them as validation failures.
3. **No new `PERMISSIONS.VOUCHERS` group; `SYSTEM.VIEW_SETTINGS` / `SYSTEM.EDIT_SETTINGS` are reused**
   - the pair `routes/tenantLocations.js` already uses. Tenant roles persist their permissions as a
   stored array, so a new permission string would require a data migration across every existing role
   before the API was usable at all. Named as deliberate scope exclusion, with the dedicated group
   plus backfill left as follow-up work.
4. **No DELETE endpoint - archive is the delete.** `voucher_redemptions.voucher_id` declares no
   `onDelete`, and ADR 0066 decision 4 makes the ledger authoritative, so the parent campaign row has
   to outlive the campaign. `archived` is terminal; every write to an archived voucher is a 409.
   `expired` is derived, never client-settable, and is materialized lazily by one guarded
   `UPDATE ... WHERE status = 'active'` on list/get so there is no cron dependency.

### Status

- `completed`
- Every gate below ran in this worktree and passed. No schema change, no migration, and no deployed
  environment is touched by this phase, so nothing here carries the Phase 102 class of unverifiable
  evidence.

### Dependencies and Governance Note

- Classified `within-existing-boundary`: a new module inside `apps/dgfy-api/src/modules/`, following
  the existing controller/usecase/repository layering and passing both structural guardrails
  unchanged. The cross-boundary decision itself is ADR 0066, landed in Phase 101; no boundary is
  crossed in code until Phase 104 wires checkout.
- ADR 0066 decisions 1, 2, 3 (`[binding]`) - implemented as specified. Decision 1: nothing in this
  phase writes a unit price; `voucherUnitPriceCentavos` is a derived display value, commented as such
  at its definition. Decision 2: every money value in `domain/` is integer centavos and every rate is
  basis points. Decision 3: the two fail-closed inversions above, each with its own regression test.
- ADR 0066 decisions 5, 9, 10, 11 (`[default]`) - decision 5's `Σ qty × max(0, base − pinned)` with a
  zero clamp is the `fixed_price` branch, fixture-tested including the base-below-pin case that ADR
  0066 Validation item 5 names; decision 9's reserved `conditions` column is `.forbidden()` in both
  request schemas; decision 10's four masks reject both `null` and `0` and default explicitly;
  decision 11's folder-descendant resolution is **explicitly not built here** and is documented in
  the module README as Phase 104 work, since no tree-traversal code exists yet.
- ADR 0029 Decision 2 (`[binding]`) - untouched. `requireExplicitSalePrice`,
  `assertStorefrontPriceReady`, and `posDiscountCalculator.js` are unmodified; Catalog still owns base
  sale price and this module never writes back to it.
- No compliance impact declaration required: `apps/dgfy-api/src/modules/vouchers/`,
  `apps/dgfy-api/src/routes/vouchers.js`, and `apps/dgfy-api/src/validators/voucherValidator.js` match
  no rule in `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` (which covers
  `modules/pos/`, `modules/payments/`, `modules/settings/`, `modules/compliance/`, and the
  `routes/{payments,pos,settings}.js` trio). `check:compliance` confirms: no compliance-sensitive
  changes detected. Phases 106 and 107 will each require a declaration, as Phase 101 already flagged.
- **Permission reuse is a recorded scope exclusion, not an oversight** - see design decision 3 above.
  A dedicated voucher permission group plus the role-data backfill it needs is follow-up work to be
  filed separately.
- No dependency on `docs/ops/TENANT_SCHEMA_SYNC_RESIDUAL_RISK_TRACKER.md`: this phase adds no
  migration and no table, so it carries none of Phase 102's deploy-order coupling.

### Acceptance and Validation Evidence

- [x] `AGENTS.md`'s pre-commit marker scan clean across every changed file.
- [x] `node --check` on all 11 new/changed `.js` files (Tier 0; `apps/dgfy-api` has no real build
  step - its `build` script is a literal no-op).
- [x] `npm run check:architecture` passes: 49 modules / 479 code files, 88 controller files, zero
  violations. Confirms the module has `index.js` + `README.md` + the three layer directories, that
  `voucherHandlers.js` satisfies the `*Handlers.js` naming rule, and that no use case imports a model
  or a legacy service.
- [x] `npm run check:compliance` passes: no compliance-sensitive changes detected;
  `check:compliance:api-contracts` PASS across 10 rules.
- [x] `npm run lint:docs` passes (chains `check:adr --strict`), validating this ledger edit.
- [x] `npx jest` over the four new suites: **227 tests, 227 passing, 0 skipped**
  (`voucherBenefitPolicy.unit` 50, `voucherEligibilityPolicy.unit` 46,
  `voucherUseCases.usecases` 56, `voucherValidator` 75). Note for anyone re-running these: the
  worktree path contains the word "voucher", so a bare `jest voucher` pattern matches **every** test
  file in the repo - use `--runTestsByPath` with the four filenames.
- [ ] Full `npm test` - not run this session; per the repo's two-tier gate model the full suite is
  Pat's own post-merge run, not a PR-blocking requirement. Nothing in this phase modifies an existing
  module, so the blast radius on existing suites is the `server.js` route mount alone.
- [ ] No live HTTP exercise of the seven endpoints - no database is reachable in this environment, so
  the API surface is verified at the use-case and validator layers rather than end to end. Named
  rather than silently omitted.

### Implementation Links

- `apps/dgfy-api/src/modules/vouchers/index.js`, `README.md`
- `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js`,
  `voucherEligibilityPolicy.js`, `voucherErrors.js`
- `apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherUseCases.js`
- `apps/dgfy-api/src/modules/vouchers/controllers/voucherHandlers.js`
- `apps/dgfy-api/src/routes/vouchers.js`, `apps/dgfy-api/src/validators/voucherValidator.js`
- `apps/dgfy-api/src/server.js` (route mount)
- `apps/dgfy-api/tests/fixtures/voucherBenefitCases.json`,
  `tests/voucherBenefitPolicy.unit.test.js`, `tests/voucherEligibilityPolicy.unit.test.js`,
  `tests/voucherUseCases.usecases.test.js`, `tests/voucherValidator.test.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` - the governing ADR
- Issue #614 - voucher authoring; #455 - voucher entity and ledger; #584 - the retail-B2B fixed-price
  driver; #453 - epic

### Completion Record

- Phase 103 completed 2026-08-18. Phase 105 (POS and storefront redemption: atomic limit enforcement
  against the ledger, folder-descendant scope resolution, and the reversal path) was the next eligible
  phase for the voucher initiative — renumbered from this entry's originally-planned 104 because
  Phase 104 (below) was concurrently claimed by an unrelated Storefront PayMongo initiative that
  merged into `develop` first; per this ledger's continuous-numbering rule, 105 was the next unclaimed
  number, not 104. Phase 105 has since completed (PR #661, 2026-08-18) — see its own entry after
  Phase 104 below.

## Phase 104 - Storefront Active PayMongo E-wallet Routing

### Initiative and Release

- Initiative: Storefront payment-method capability expansion.
- Release: Storefront PayMongo active e-wallet/card method selection and direct GCash authorization.

### Objective and Scope

- Show active server-resolved Card, GCash, Maya, GrabPay, ShopeePay, and QR Ph
  choices in Storefront checkout.
- Route the selected method as the single PayMongo Hosted Checkout method; a
  GCash selection must create a session restricted to `gcash`.
- Permit direct GCash and independently opted-in Maya Payment Intent
  authorization behind explicit live configuration; keep Hosted Checkout for
  cards and other methods and as the wallet fallback when direct mode is
  disabled.
- Preserve the existing signed webhook finalization, idempotency, settlement,
  refund, and walk-in POS physical-QR boundaries.
- Defer BPI, UBP, BDO, Landbank, and other direct-online-banking choices until
  the bank-specific `bank_code` Payment Intent flow is separately approved.

### Status

- `in_progress`
- User approval received on 2026-08-17.

### Dependencies and Governance Note

- Depends on ADR 0052's landlord-owned commerce payment-session and verified
  provider-finalization contract, amended on 2026-08-17.
- Depends on the PayMongo capability endpoint and the additive tenant payment
  enum migration.
- Classified `cross-boundary`: Storefront UI/API capability expansion plus an
  additive tenant-schema enum migration; no posted payment or settlement rows
  are changed.

### Acceptance and Validation Evidence

- [ ] Only PayMongo methods reported active by the server capability lookup are
  shown; inactive methods remain hidden.
- [ ] GCash selection sends `payment_type=gcash` and creates
  `payment_method_types=["gcash"]`.
- [ ] Explicitly enabled live GCash and Maya create wallet-specific PayMongo
  Payment Intents and redirect to provider authorization without opening Hosted
  Checkout.
- [ ] Live provider `livemode`, amount, and currency are validated before
  finalization.
- [ ] Maya, GrabPay, ShopeePay, Card, and QR Ph selections preserve their exact
  method identifiers through the same payment-session endpoint.
- [ ] Direct Maya uses `paymaya` only when its independent opt-in flags are
  enabled; cards remain on Hosted Checkout.
- [ ] No direct order finalizes before a verified PayMongo webhook.
- [ ] Existing Cash, QR Ph, return recovery, and POS physical-QR behavior remain
  unchanged.
- [ ] Focused frontend/backend tests, schema checks, architecture checks, lint,
  and Storefront/API validation pass.

### Implementation Links

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-api/src/validators/storeValidator.js`
- `apps/dgfy-api/src/models/PosTransaction.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-migration-runner/migrations/20260817000001-expand-storefront-paymongo-payment-methods.cjs`
- `apps/dgfy-web/apps/store/src/shared/model/storefrontCheckoutPaymentOptions.js`
- `apps/dgfy-web/apps/store/src/shared/services/storefrontOnlinePaymentSession.js`
- `apps/dgfy-api/src/modules/commercePayments/usecases/processVerifiedPaidCommerceSession.js`
- Issue #679

### Completion Record

- Phase 104 remains in progress until the acceptance gates and live-capability
  verification pass. Phase 105 is the next eligible phase after completion.

## Phase 105 - Storefront Voucher Redemption: Atomic Reservation, Ledger, and Reversal

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), entity scoped in #455, authoring surface
  scoped in #614. Continues Phase 103's backend module.
- Release: storefront checkout only. POS redemption is deferred behind #604 (tenant-wide POS voucher
  master switch, not yet built); the catalog display seam (#603) and the dedicated
  `PERMISSIONS.VOUCHERS` group (#655) are both separate, not-yet-landed follow-ups.

### Objective and Scope

- Add `domain/voucherFolderScope.js` — a pure, cycle-safe BFS descendant-folder resolver over
  `ItemFolder.parent_id`, used to resolve which cart lines a folder-scoped voucher applies to.
- Add `usecases/voucherRedemptionUseCases.js` — `buildPreviewVoucherEligibilityUseCase` (no
  transaction, read-only preview used by the QRPh payment-session path) and
  `buildRedeemVoucherUseCase` (the real atomic path: row-lock the voucher, resolve scope, compute the
  benefit, then a single guarded conditional `UPDATE` against `redeemed_count` /
  `redeemed_value_centavos` / `redeemed_quantity`, bumping `version`, inside the already-open checkout
  transaction).
- Add `usecases/voucherReversalUseCases.js` — `buildReverseVoucherRedemptionUseCase`, a symmetric
  decrement floored at zero with its own `entry_type:'reversal'` ledger row. No live caller yet:
  `buildCancelStoreOrderUseCase` has no `status:'voided'` path today, so storefront has no
  cancel/refund hook. Built ahead of that caller per this phase's own scope, covered by a direct unit
  test instead of an integration path.
- Wire the checkout seam into `storeUseCases.js`'s `resolveCheckoutContext`: no-transaction callers
  (quote/QRPh-session preview) get eligibility + benefit calculation only; the transactional checkout
  path gets the full atomic reserve + idempotency-keyed ledger insert
  (`` `storefront:${checkoutIdempotencyKey}:${voucher_id}` ``), reusing the checkout's own transaction
  rather than opening a second one.
- Add `voucher_code` to `storeValidator.js`'s checkout payload schema, symmetric to the existing
  `promo_code`.

### Status

- `completed`

### Dependencies and Governance Note

- Governed by ADR 0066 (`docs/architecture/adr/0066-voucher-sale-time-price-resolution.md`).
- Classified as a new authoritative money-moving ledger write path
  (`voucher_redemptions`/`voucher_redemption_lines`); no compliance declaration was required or
  written because `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` has no pattern
  covering `modules/vouchers/` or `modules/store/` — a confirmed scanner gap, tracked separately
  (#670), not a compliance exemption for this phase's own change.
- Two known, deliberately deferred limitations, both filed as follow-ups rather than fixed here:
  voucher and promo-code discounts currently stack at storefront checkout with no single-slot cap
  unlike POS (#667), and the QRPh payment-session flow can succeed a payment before the real
  reservation runs at webhook-confirmed finalization, which can roll back an already-paid order if the
  voucher is exhausted in between (#668).

### Acceptance and Validation Evidence

- [x] `reserveRedemption`'s guarded conditional `UPDATE` returns `0` affected rows (mapped to the
      specific exhaustion reason code) rather than silently over-redeeming when the voucher's
      redemption count, peso budget, or benefit quantity limit is reached.
- [x] A checkout retry sharing the same idempotency key returns the already-committed ledger row
      (`idempotentReplay: true`) without a second `reserveRedemption` call — no double-fire on retry.
- [x] Folder-scoped vouchers resolve descendant folders cycle-safely and fail closed (422) when the
      scope matches zero eligible cart lines.
- [x] Unit and use-case tests for the folder-scope resolver, redemption use case, and reversal use
      case (`tests/voucherFolderScope.unit.test.js`,
      `tests/voucherRedemptionUseCases.usecases.test.js`,
      `tests/voucherReversalUseCases.usecases.test.js`).
- [x] `node --check` on all 11 changed/new files, `check:architecture`, `check:adr`, and
      `check:compliance` all pass. Local Jest could not run in the implementing worktree (no
      `node_modules` installed) — stated in PR #661 rather than silently skipped.

### Implementation Links

- `apps/dgfy-api/src/modules/vouchers/domain/voucherFolderScope.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js`,
  `voucherReversalUseCases.js`
- `apps/dgfy-api/src/modules/vouchers/repositories/voucherRepository.js` (+8 methods)
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js` (+2 reason codes)
- `apps/dgfy-api/src/modules/vouchers/index.js` (composition-root wiring)
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (checkout-seam hookup)
- `apps/dgfy-api/src/validators/storeValidator.js` (`voucher_code`)
- `apps/dgfy-api/tests/voucherFolderScope.unit.test.js`,
  `voucherRedemptionUseCases.usecases.test.js`, `voucherReversalUseCases.usecases.test.js`
- PR #661, merged to `develop` as `f4011814` (2026-08-18)
- Issue #455 - voucher entity and ledger (`Refs`, left open — POS redemption remains, gated behind
  #604); #614 - voucher authoring UI (separate, in progress); #453 - epic

### Completion Record

- Phase 105 completed 2026-08-18 via PR #661. Phase 106 (storefront voucher catalog display seam,
  #603) is the next eligible phase for the voucher initiative.

## Phase 106 - Storefront Voucher Catalog Display Seam

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), scoped in #603 (API half only — the
  storefront-consuming UI is split out as #672, not yet built). Continues Phase 105's checkout-path
  module with a read-only display-time counterpart.
- Release: storefront public catalog and QR-resolve endpoints only. Recorded retroactively — PR #678
  merged to `develop` before this ledger entry was written, a gap this entry corrects rather than
  repeats (see Phase 107's own note on the same class of miss).

### Objective and Scope

- Add `usecases/voucherDisplayUseCases.js` — `buildResolveVoucherDisplayPricesUseCase`, a third
  sibling of the redemption preview/redeem pair, deliberately not built on `resolveEligibleBenefit`
  (which requires prepared cart lines and throws on ineligibility — both wrong for a browse page with
  no cart yet). Fail-open by design: any resolution failure (voucher not found, unresolvable
  timezone, malformed benefit config, one bad item in a batch) falls back to the plain catalog price
  rather than blocking the response, mirroring `storeUseCases.js`'s `applyAffiliateDisplayPrice`
  template. Only the campaign-level (structural) eligibility reasons block display; basket
  minimums/fulfillment/order-timing are unknowable pre-cart and are not evaluated against display.
- `percent_off` and `fixed_price` resolve to a rewritten per-item price at quantity 1;
  `amount_off` gets badge-only display (an order-level cap has no well-defined single-item price
  shown in isolation).
- ADR 0066 decision 7 mirrored at display time: a `fixed_price` voucher under active affiliate
  attribution is refused identically to checkout, so a displayed price never contradicts what
  checkout will actually allow.
- Wire `folder_id` into `storeRepository.js`'s attribute lists and row mappings (3 methods:
  `listStoreCatalog`, `findSellableItemsByIds`, `resolvePublicBarcode`) so folder-scoped vouchers can
  resolve against catalog items at display time, reusing `resolveVoucherScopeItemIds` as-is.
- Add `voucher_code` to both catalog query validators; wire response fields `voucher_price_applied`,
  `voucher_display_price`, `voucher_badge_only` (additive — `default_sale_price` is never
  overwritten, unlike the affiliate pricing precedent, so a struck-through UI can render both values).
- Cache correctness: a `voucher_code`-bearing request switches the shared 45s public cache to
  no-store (`bypassCacheForVoucherCode`, later generalized to `bypassCacheForPerBuyerPricing` by
  #671's fix for the parallel affiliate-cookie gap).
- Rate limiting: `storeVoucherLookupLimiter` (20 req/min/store in prod) added ahead of the cache
  bypass, since `voucher_code` on a public unauthenticated route is a valid/invalid-code oracle.

### Status

- `completed`

### Dependencies and Governance Note

- Governed by ADR 0066, same as Phase 105.
- Classification: `major`, `surfaces: payments,pos,terminal` — the first phase to actually require a
  declaration under #676's newly-added `COMPLIANCE_SENSITIVE_RULES` coverage for `modules/vouchers/`
  and `modules/store/` (the gap Phase 105 shipped ahead of).

### Acceptance and Validation Evidence

- [x] 11 unit tests (`tests/voucherDisplayUseCases.usecases.test.js`) covering empty/not-found code,
      percent_off/fixed_price pricing (incl. zero-clamp), amount_off badge-only, every campaign-level
      gate, confirmation that non-structural reasons do not block display, the affiliate/fixed-price
      conflict, folder-scope exclusion, and fail-open on a repository error.
- [x] Full regression pass, 373 tests, 0 failures (run against the main checkout's installed
      `node_modules`, symlinked into the implementing worktree for the run only).
- [x] `check:architecture` OK (49 modules, 487 files; 88 controller files).
- [x] Two reviewer-found blockers fixed pre-merge, not left as follow-ups: declaration `surfaces`
      corrected to also cover the `pos,terminal` rule (`ec806f09`), and a dedicated
      `storeVoucherLookupLimiter` added since neither route otherwise carried a limiter beyond the
      app-wide bucket (`7bcc1420`).

### Implementation Links

- `apps/dgfy-api/src/modules/vouchers/usecases/voucherDisplayUseCases.js`
- `apps/dgfy-api/src/modules/vouchers/index.js` (composition-root wiring)
- `apps/dgfy-api/src/modules/store/repositories/storeRepository.js` (`folder_id` plumbing)
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (`applyVoucherDisplayPrice`,
  `serializeStoreCatalogItem`)
- `apps/dgfy-api/src/routes/store.js` (`bypassCacheForVoucherCode`, `limitVoucherCodeLookups`)
- `apps/dgfy-api/src/validators/storeValidator.js` (`voucher_code` query param)
- `apps/dgfy-api/tests/voucherDisplayUseCases.usecases.test.js`
- `docs/compliance/impact-declarations/2026-08-18-voucher-catalog-display-seam.md`
- PR #678, merged to `develop` as `bbf866fe` (2026-08-18)
- Issue #603 - display seam (`Refs`, left open — #603 stays `In progress` until #672, the
  storefront-consuming UI half, also lands); #672 - storefront voucher-code entry + shared
  struck-through price component (separate, not yet built); #671 - the parallel affiliate-cache gap
  this phase's cache mechanism was later reused to fix; #453 - epic

### Completion Record

- Phase 106 completed 2026-08-18 via PR #678, recorded retroactively in this entry. Phase 107
  (voucher merchant authoring UI, #614) is the next eligible phase for the voucher initiative.

## Phase 107 - Voucher Merchant Authoring UI

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), scoped in #614 — the merchant-facing client
  for Phase 103's already-shipped voucher admin CRUD API.
- Release: POS/Terminal settings surface only. Does not process a transaction, move money, or touch
  the POS drawer — it is a campaign-configuration UI, not a checkout-path change.

### Objective and Scope

- Add `VoucherManagementPanel.jsx` (new, standalone) and its thin API client `voucherService.js`
  (new), wired as a new `vouchers` pane in the existing POS/Terminal settings tab bar alongside
  employees/affiliates, gated the same way the API it calls already is (`settings:view` /
  `settings:edit` — see #655 for the dedicated `PERMISSIONS.VOUCHERS` group tracked separately).
- Status machine mirrored client-side from `voucherUseCases.js`'s `ALLOWED_STATUS_TRANSITIONS`, so an
  invalid transition is caught before the request is even sent, with the backend's `409
  VOUCHER_INVALID_STATUS_TRANSITION` as the authoritative fallback. `status` itself is never
  form-editable — only the dedicated activate/pause/archive actions can change it.
- Every update carries the voucher's `version` from the last GET/PUT response; a `409
  VOUCHER_VERSION_CONFLICT` (a concurrent redemption or another merchant's edit landed first) surfaces
  a reload-and-discard prompt rather than silently overwriting server state — the exact
  read-modify-write clobber bug the legacy Promo Codes editor this UI is modeled after was prone to.
  Server-owned redemption counters (`redeemed_count`, `redeemed_value_centavos`,
  `redeemed_quantity`) are never sent back on create or update.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 103's voucher admin CRUD API (PR #641, #614's backend half) and Phase 102's
  schema/models. No backend code changes in this phase.
- Classification: `major`, `surfaces: pos,terminal` — forced by the
  `^apps/dgfy-web/src/features/pos/` compliance rule.
- ADR 0067 (Chrome 80 browser-support baseline, landed the same day) applies to every file in this
  phase; confirmed zero restricted runtime methods before this phase was committed.

### Acceptance and Validation Evidence

- [x] `npm run build:pos` — real Vite production build of the POS/Terminal surface this panel ships
      in (also the surface ADR 0067's Layer 2 es-compat gate runs inside).
- [x] `npm run check:compliance` — this phase's own declaration gate.
- [x] `npm run check:architecture` — architecture boundary check against the merge-result tree.
- [x] No backend changes, so no migration/tenant-schema verification applies. Local Jest could not be
      run in the implementing worktree (no `node_modules` installed) — stated here rather than
      silently omitted; the PR body carries the same note.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/VoucherManagementPanel.jsx` (new)
- `apps/dgfy-web/src/services/voucherService.js` (new)
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`,
  `TerminalPageLayout.jsx`, `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx` (tab wiring)
- `docs/compliance/impact-declarations/2026-08-18-voucher-merchant-authoring-ui.md`
- Branch `feature/614-voucher-merchant-ui`, PR against `develop` (see issue #614 for the merged PR
  once open)
- Issue #614 - authoring UI (`Refs`, left open — #655's dedicated permission group deliberately not
  included in this phase); #453 - epic

### Completion Record

- Phase 107 completed 2026-08-18. Next eligible phase: 108 (`PERMISSIONS.VOUCHERS` group, #655).

## Phase 108 - Dedicated PERMISSIONS.VOUCHERS Group

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), scoped in #655. Closes the gap named as
  deliberate follow-up work in three places (PR #641's description, `modules/vouchers/README.md`,
  `routes/vouchers.js`'s own inline comment).
- Release: permission-config and route-gate change only, dual-gated for one release rather than a
  hard cutover.

### Objective and Scope

- Add a `VOUCHERS` group (`view`/`manage`) to `apps/dgfy-api/src/config/permissions.js`, added to
  `DEFAULT_ROLE_PERMISSIONS.manager` (admin inherits via `getAllPermissions()`).
- Re-verified against `develop` before implementing: no data migration needed.
  `scripts/backfill-role-permissions.js` already performs an idempotent, additive, cross-tenant
  permission merge, already wired into `scripts/deploy.sh` ahead of the pm2 reload.
- Dual-gate all 7 routes in `routes/vouchers.js` — `VOUCHERS.*` OR the legacy
  `SYSTEM.VIEW_SETTINGS`/`EDIT_SETTINGS` pair, via the existing `checkAnyPermission` middleware —
  for one release, since `resolveEffectivePermissions` only re-derives role defaults when a user's
  stored permissions array is empty. The legacy arm's removal is filed as a dated follow-up (#686),
  not left open-ended.
- Add `VOUCHERS` to `config/modeRolePresets.js`'s `PERMISSION_GROUP_VISIBILITY` for every workflow
  mode, and bump `ROLE_CATALOG_VERSION` — without this the group would exist but never reach
  `GET /users/role-catalog`, the actual source the user-management UI reads (not
  `permissions_frontend.js`'s `PERMISSION_GROUPS`, which is only a degraded-path fallback, mirrored
  here for consistency but not the live path).
- Update #614's `canManageVouchers` in `TerminalPage.jsx` to the same dual-gate.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 103's voucher admin CRUD API and Phase 107's authoring UI (#614), whose
  `canManageVouchers` this phase updates.
- Classification: `major`, `surfaces: pos,terminal` — forced, matching Phase 107's declaration.

### Acceptance and Validation Evidence

- [x] `node --check` on all three touched backend files (`config/permissions.js`,
      `config/modeRolePresets.js`, `routes/vouchers.js`) — OK.
- [x] `npm run build:pos` — real Vite production build of the touched POS/Terminal surface.
- [x] `npm run check:compliance` — PASS.
- [x] `npm run check:architecture` — OK (49 modules / 488 files; 88 controller files).
- No new tests: permission-config and route-gate wiring against the repo's existing
  `checkAnyPermission` implementation, not new business logic. Local Jest could not be run in the
  implementing worktree (no `node_modules` installed).

### Implementation Links

- `apps/dgfy-api/src/config/permissions.js`, `config/modeRolePresets.js`
- `apps/dgfy-api/src/routes/vouchers.js`, `modules/vouchers/README.md`
- `apps/dgfy-web/src/config/permissions_frontend.js`,
  `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx`
- `docs/compliance/impact-declarations/2026-08-18-vouchers-permission-group.md`
- Branch `feature/655-vouchers-permission-group`, PR #685 (base `feature/614-voucher-merchant-ui`)
- Issue #655 (`Closes`); #686 - legacy-arm removal follow-up; #453 - epic

### Completion Record

- Phase 108 completed 2026-08-18 via PR #685. Next eligible phase: 109 (POS voucher master switch,
  #604).

## Phase 109 - POS Voucher Redemption Master Switch

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), scoped in #604.
- Release: gate-only change — ships the tenant-wide switch ahead of POS voucher redemption itself,
  which does not yet exist (Phase 105/PR #661 was storefront checkout only). No runtime behavior
  changes for any existing caller.

### Objective and Scope

- Add a tenant-wide setting, `voucher_pos_redemption_enabled` (default `false`), registered in both
  Joi schemas (`settingsValidator.js`). No seeding/migration — an absent `system_settings` row
  already reads falsy in every consumer, which is the correct default.
- Add a tenant-scoped 15s-TTL read-path cache, `voucherPosRedemptionSettingCache.js`, modeled on the
  existing `inventoryAuthoritySettingsCache.js` pattern (relies on the TTL for staleness, same as
  its precedent — not wired into `updateSettingsUseCase.js`'s cache-invalidate list).
- Add a fail-closed guard inside `buildRedeemVoucherUseCase` itself, checked on `channel === 'pos'`
  — tenant-wide and un-bypassable by any future POS-side caller, since every POS redemption path
  must go through this one function. New `VOUCHER_POS_REDEMPTION_DISABLED` reason code. Orthogonal
  to a voucher's own `channels` mask (`VOUCHER_CHANNEL_BITS.pos`), evaluated separately per #604's
  own body.
- Add a merchant-facing toggle to the existing POS Setup pane (`TerminalOperationsWorkspace.jsx`),
  following the Strict Shift Location Binding toggle end to end.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 103's voucher domain/CRUD and Phase 105's storefront redemption path (the guard
  lives in the same shared use case Phase 105 built). No dependency on Phase 107/108's authoring UI
  or permission group.
- Classification: `major`, `surfaces: pos,terminal` (declaration approved by Pat before staging).
- Known gap, tracked separately, not fixed in this phase: the `channel === 'pos'` guard in
  `voucherRedemptionUseCases.js` runs before the function's own empty-code short-circuit — inert
  today (no live POS caller exists to exercise the ordering) but a latent bug once one does. Flagged
  in PR #687's review (unfixed) and again in PR #684's review; filed as #693, parented under #604,
  rather than fixed inline here.

### Acceptance and Validation Evidence

- [x] `node --check` on all four touched/new backend files — OK.
- [x] `npm run build:pos` — real Vite production build of the touched settings surface.
- [x] `npm run check:compliance` — PASS (declaration on file for `voucherErrors.js`,
      `voucherRedemptionUseCases.js`, `voucherPosRedemptionSettingCache.js`,
      `TerminalOperationsWorkspace.jsx`, `classification: major`, `surfaces: pos,terminal`).
- [x] `npm run check:architecture` — OK (49 modules / 488 files; 88 controller files).
- No test coverage for the `channel === 'pos'` branch beyond the syntax check, disclosed plainly in
  the compliance declaration rather than implied: nothing in the codebase yet constructs a call with
  `channel: 'pos'`, since POS redemption doesn't exist yet. Tracked as part of #693's definition of
  done, not deferred silently.

### Implementation Links

- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherPosRedemptionSettingCache.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js`
- `apps/dgfy-api/src/validators/settingsValidator.js`
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `docs/compliance/impact-declarations/2026-08-18-pos-voucher-master-switch.md`
- Branch `feature/604-pos-voucher-master-switch`, PR #687 (base `feature/614-voucher-merchant-ui`)
- Issue #604 (`Refs` on the PR; closed manually post-merge, see PR #684's own review); #693 —
  guard-ordering follow-up; #453 - epic

### Completion Record

- Phase 109 completed 2026-08-18 via PR #687, landing on `develop` via PR #684. Next eligible phase:
  110.

## Phase 110 - Voucher Governed Discount Slot and Fiscal Audit Row, Race-Code Widening, Compliance Gate Coverage

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), audited for backlog reconciliation
  2026-08-18/19 after the Phase 101-109 wave (PRs #661-#704) shipped without ever being checked
  against the still-open backlog.
- Release: four `develop`-targeted PRs (#708, #709, #710, #711), merged in that order deliberately —
  #711's new compliance rule landing last so it would not retroactively demand a declaration from
  #710.

### Objective and Scope

- **#708 (Refs #667)** — enforce ADR 0066 Decision 8 (one governed discount slot per transaction) on
  the storefront checkout path, where it had never been wired up despite already being accepted and
  already relied on by `pos_transaction_discounts`' `UNIQUE (transaction_id)`. A voucher code
  submitted alongside an already-applied promo code now rejects 422
  `VOUCHER_DISCOUNT_SLOT_OCCUPIED` before either benefit resolves, burning no redemption. With that
  guarantee in place, a voucher-only storefront order now writes the same `pos_transaction_discounts`
  fiscal audit row and per-line allocations a promo order already did (ADR 0066 Decision 10) — a
  confirmed compliance gap in already-merged code, not new behavior. Voucher codes capped at 40 chars
  (from 64) to fit the shared audit column with no migration. Supersedes PR #705 (reopened,
  corrected, re-landed — #705's guard was right; the reviewing session's earlier `BLOCK` verdict on
  it was wrong and was retracted in public comments on #705 and #667).
- **#709 (Refs #693)** — reorder `voucherRedemptionUseCases.js`'s POS master-switch guard to run
  after the empty-code short-circuit, not before. Required a manual merge-conflict resolution against
  #708 (both touched the same file) — resolved keeping #693's guard position with #708's enriched
  return shape.
- **#710 (Refs #706)** — widen `finalizePaidCommerceSession.js`'s
  `VOUCHER_REDEMPTION_UNAVAILABLE_REASON_CODES` from 4 to 9: adds `VOUCHER_EXPIRED`,
  `VOUCHER_NOT_ACTIVE`, `VOUCHER_WEEKDAY_NOT_ELIGIBLE`, `VOUCHER_TIME_WINDOW_BLOCKED`,
  `VOUCHER_PRICE_BELOW_COST` — all of which the redeem branch's under-lock full eligibility re-run
  can actually raise, and which previously landed as a generic `ORDER_FINALIZATION_FAILED`.
  Deliberately excludes deterministic-for-a-fixed-payload codes (`VOUCHER_MIN_SPEND_NOT_MET`,
  `VOUCHER_MIN_QUANTITY_NOT_MET`, `VOUCHER_NOT_STARTED`, `VOUCHER_TIMEZONE_UNRESOLVABLE`) since those
  are not races and a distinct code there would mislead an operator.
- **#711 (Refs #707)** — add `modules/commercePayments/` and `routes/commercePayments.js` (the QRPh
  money-capture module) to `COMPLIANCE_SENSITIVE_RULES`, which had covered `modules/pos|vouchers|
  store|payments|settings|compliance/` but not this one.
- Board reconciliation alongside the code: closed #602 and #584 as already-implemented (found during
  the same audit, no code changes needed); #667 corrected from "deferred to #695" to "resolved by
  this phase."

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 101-105's voucher entity, redemption ledger, and storefront redemption path (all
  four PRs touch code those phases built).
- ADR 0066 amended (not superseded) with a dated 2026-08-19 entry recording that Decisions 8 and 10
  are now *enforced* on the storefront path, not changed — both were already-accepted `[default]`
  clauses.
- Classification: `major`, `surfaces: payments,pos,terminal` for #708 (`modules/store/` +
  `modules/vouchers/`); `major`, `surfaces: pos,terminal` for #709; existing declaration extended for
  #710; no compliance-sensitive path in #711 itself (it changes the scanner's own rule set, not a
  scanned path).
- Every merge overrode a red/pending CI check state — logged explicitly on each PR via a public
  override comment naming the bypassed check and the substituted local evidence, per AGENTS.md's
  Merge Safety rule, at the user's explicit direction (`docker.io` token-timeout and a shared stuck
  base-image layer, unrelated to any of the four diffs, confirmed via direct `docker build`
  reproduction rather than a CI rerun).

### Acceptance and Validation Evidence

- [x] Real `docker build` (not npm-level substitution) run locally for all four PRs against the
      Dockerfiles `pr-checks.yml` itself builds from, simulating that workflow rather than trusting
      npm tests alone — required a lima Docker VM memory bump (4GiB → 6GiB) to avoid an OOM (exit
      137) building 3 concurrent Vite apps.
- [x] Full composed test suite against merged `develop` tip (`d2b0380c`) — 464/464 passing across 19
      suites, not just each branch tested in isolation.
- [x] `npm run check:compliance` — PASS on merged tip.
- [x] `npm run check:architecture` — OK, 49 modules / 491 code files.
- [x] `npm run check:adr --strict` — OK, 74 ADRs.
- No integration test exercises a full storefront-voucher-checkout end-to-end (would need a live
  MySQL instance or a DI seam for `buildStoreCheckoutUseCase`); disclosed as a gap in PR #708's own
  Testing Evidence rather than implied covered — this absence is why the fiscal-audit-row defect
  shipped undetected in the first place.

### Implementation Links

- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`,
  `apps/dgfy-api/src/modules/store/repositories/storeRepository.js`
- `apps/dgfy-api/src/modules/vouchers/domain/voucherErrors.js`,
  `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js`,
  `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js`
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js`
- `apps/dgfy-api/src/validators/voucherValidator.js`
- `apps/dgfy-web/src/features/pos/components/VoucherManagementPanel.jsx`,
  `apps/dgfy-web/src/features/pos/components/ReceiptPrintView.jsx`
- `scripts/check-compliance-impact.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (2026-08-19 amendment)
- `docs/compliance/impact-declarations/2026-08-19-storefront-voucher-fiscal-audit-row.md`,
  `docs/compliance/impact-declarations/2026-08-19-voucher-pos-guard-order.md`
- Branches `fix/667-voucher-governed-discount-slot`, `fix/693-voucher-pos-guard-order`,
  `fix/706-widen-voucher-race-codes`, `chore/707-compliance-commerce-payments`; PRs #708/#709/#710/#711
- Issues #667, #693, #706, #707 (all `Refs`, now `For QA`); #602, #584 (closed as already-implemented);
  #453 - epic

### Completion Record

- Phase 110 completed 2026-08-18 via PRs #708 (`61b1809c`), #709 (`9648685a`), #710 (`4ecd5f2a`),
  #711 (`d2b0380c`), merged in that order onto `develop`. Next eligible phase: 111.

## Phase 111 - POS Checkout Terminal Decomposition

- Initiative/release: POS maintainability; behavior-preserving R0-R9 refactor.
- Objective/scope: replace the checkout monolith with a compatibility shell, focused hooks, views, and pure utilities; POS only.
- Status: `completed`; dependencies: ADR 0031 and the existing POS UI/API contracts.
- Acceptance/evidence: shell/view contracts, full POS/F&B regression, production build, and authenticated browser certification passed in aggregate under Phase 132.
- Completion: 2026-08-20. Links: `docs/features/POS_CHECKOUT_TERMINAL_REFACTOR.md`, `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`.

## Phase 112 - Administrator No-Shift Void Certification

- Initiative/release: accountable POS void lifecycle.
- Objective/scope: allow an authorized administrator to void without opening/reassigning a shift while preserving cashier shift enforcement.
- Status: `completed`; dependencies: Phase 111 and ADR 0031's administrator exception.
- Acceptance/evidence: route/use-case tests and authenticated closed-shift admin-void E2E passed.
- Completion: 2026-08-20. Links: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`, `apps/dgfy-web/tests/e2e/pos/admin-void.spec.js`.

## Phase 113 - Receipt and Dialog Presentation Extraction

- Initiative/release: POS terminal refactor.
- Objective/scope: move receipt preview, dialogs, and presentation markup out of the compatibility shell without UI/API change.
- Status: `completed`; dependencies: Phase 111.
- Acceptance/evidence: receipt, terminal view-mode, and shell contract tests passed.
- Completion: 2026-08-20. Links: `POSCheckoutTerminalView.jsx`, `POSCheckoutTerminalReceiptDialogs.jsx`.

## Phase 114 - POS-Native Cashier Void Permission Control

- Initiative/release: cashier accountability.
- Objective/scope: independently manage `pos:void` and `pos:cash_drawer_adjust` inside POS Settings while preserving unrelated permissions.
- Status: `completed`; dependencies: existing user permission APIs.
- Acceptance/evidence: POS Settings contract and backend authorization tests passed.
- Completion: 2026-08-20. Links: `TerminalOperationsWorkspace.jsx`, `posSettingsCashier.contract.test.js`.

## Phase 115 - Voided Transaction Visibility

- Initiative/release: POS history/audit UX.
- Objective/scope: retain voided sales in History with status, reason, actor, timestamp, receipt audit, and original cashier/shift attribution.
- Status: `completed`; dependencies: Phase 112.
- Acceptance/evidence: history/search/receipt contracts and live E2E passed.
- Completion: 2026-08-20. Links: `POSTransactionHistoryPanel.jsx`, `usePosHistoryVoidWorkflow.js`.

## Phase 116 - Paid-Void Lifecycle Contract

- Initiative/release: refund governance discovery.
- Objective/scope: define distinct unpaid, cash, merchant-owned digital, provider-owned, Employee Credit, split-tender, and post-close outcomes.
- Status: `completed`; dependencies: Phases 112 and 115.
- Acceptance/evidence: approved contract is documented in the POS flow, API specification, ADR 0031, and split-payment contract.
- Completion: 2026-08-20. Links: `docs/features/POS_CASHIER_TERMINAL_FLOW.md`, `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.

## Phase 117 - Transaction Adjustment Evidence Foundation

- Initiative/release: additive POS financial evidence.
- Objective/scope: create tenant-local append-only adjustment persistence with original and actor context, idempotency, provider/external, retry, and drawer links.
- Status: `completed`; dependencies: Phase 116 and tenant schema registry.
- Acceptance/evidence: migration/model/repository/runtime-schema tests passed; landlord and 14/14 tenant schemas are current.
- Completion: 2026-08-20. Links: migration `20260819000001-create-pos-transaction-adjustments.cjs`, `PosTransactionAdjustment.js`.

## Phase 118 - Internal Void Evidence Wiring

- Initiative/release: accountable internal void.
- Objective/scope: write one deterministic succeeded `void` adjustment in the same transaction as the internal void.
- Status: `completed`; dependencies: Phase 117.
- Acceptance/evidence: idempotency, attribution, rollback, and duplicate-void tests passed.
- Completion: 2026-08-20. Links: `posUseCases.js`, `posRepository.js`.

## Phase 119 - Financial Outcome Classification

- Initiative/release: fail-closed refund routing.
- Objective/scope: derive refund-required state and next action from persisted transaction/tender evidence without performing a refund.
- Status: `completed`; dependencies: Phase 118.
- Acceptance/evidence: outcome-domain and void-response matrix tests passed.
- Completion: 2026-08-20. Links: `posVoidFinancialOutcome.js`.

## Phase 120 - Adjustment Read Projection

- Initiative/release: auditable transaction detail.
- Objective/scope: expose sanitized adjustments and latest financial outcome without read-side mutations or raw request metadata.
- Status: `completed`; dependencies: Phases 117-119.
- Acceptance/evidence: repository/detail/history read tests passed.
- Completion: 2026-08-20. Links: `posRepository.js`, `posHandlers.js`.

## Phase 121 - Financial Follow-Up Presentation

- Initiative/release: truthful POS refund status UX.
- Objective/scope: show whether cash, external, provider, or split follow-up is required without presenting an internal void as a completed refund.
- Status: `completed`; dependencies: Phase 120.
- Acceptance/evidence: receipt/history presentation contracts passed.
- Completion: 2026-08-20. Links: `POSCheckoutTerminalReceiptDialogs.jsx`, `POSTransactionHistoryPanel.jsx`.

## Phase 122 - Reusable Administrator-Void E2E

- Initiative/release: state-changing browser certification.
- Objective/scope: provide credential-safe, diagnostic E2E coverage with opt-in cleanup limited to the configured disposable cashier's stale shift.
- Status: `completed`; dependencies: Phases 112 and 121 plus disposable sandbox credentials.
- Acceptance/evidence: Google Chrome E2E passed 1/1 with admin no-shift void, cashier refund, drawer, history, and report assertions.
- Completion: 2026-08-20. Links: `tests/e2e/pos/admin-void.spec.js`, `tests/e2e/fixtures/posVoid.js`.

## Phase 123 - Runtime and Tenant Schema Readiness

- Initiative/release: deploy-safe schema convergence.
- Objective/scope: register adjustment and split-reversal tables/columns/indexes in runtime audit and additive tenant repair.
- Status: `completed`; dependencies: Phase 117 migrations.
- Acceptance/evidence: landlord migrations are current; tenant repair/report succeeded 14/14 at capability `2026-08-20.1`.
- Completion: 2026-08-20. Links: `scripts/sync-tenant-schemas.js`, `runtimeSchemaAuditService.js`.

## Phase 124 - Paid-Refund Lifecycle Gates

- Initiative/release: server-authoritative refund eligibility.
- Objective/scope: require prior void, supported paid tender, terminal scope, actor permission/shift rules, and idempotency before financial follow-up.
- Status: `completed`; dependencies: Phases 116-123.
- Acceptance/evidence: negative authorization, validation, ownership, and replay matrix passed.
- Completion: 2026-08-20. Links: `posValidator.js`, POS refund use cases.

## Phase 125 - Paid-Cash Refund and Drawer Event

- Initiative/release: physical cash accountability.
- Objective/scope: atomically record cash refund evidence and one linked `cash_out` event on the acting cashier's owned open shift.
- Status: `completed`; dependencies: Phase 124 and `pos:cash_drawer_adjust`.
- Acceptance/evidence: cash refund use-case/route tests and authenticated E2E passed.
- Completion: 2026-08-20. Links: `cashRefundUseCases.js`.

## Phase 126 - Merchant-Owned Digital Reversal Evidence

- Initiative/release: walk-in digital reversal accountability.
- Objective/scope: record external reference under manual review, then require explicit same-reference confirmation; never call PayMongo.
- Status: `completed`; dependencies: Phase 124.
- Acceptance/evidence: evidence, confirmation, duplicate-reference, actor-shift, and no-provider-call tests passed.
- Completion: 2026-08-20. Links: `externalRefundUseCases.js`.

## Phase 127 - Provider-Owned Refund Adapter

- Initiative/release: verified online provider refund.
- Objective/scope: verify server-owned PayMongo payment/session identity and exact amount/method/currency before refund submission; preserve retry state.
- Status: `completed`; dependencies: Phase 124 and commerce payment ownership records.
- Acceptance/evidence: provider success, pending, failure, replay, mismatch, and unsupported-tender tests passed.
- Completion: 2026-08-20. Links: `providerRefundUseCases.js`, `commercePaymentAdminUseCases.js`.

## Phase 128 - Split-Tender Allocation Reversal

- Initiative/release: allocation-level refund lifecycle.
- Objective/scope: reverse each successful cash, merchant-owned, or provider-owned allocation with server-maintained amount/status summaries.
- Status: `completed`; dependencies: Phases 125-127 and migration `20260819000002`.
- Acceptance/evidence: partial/full, over-refund, idempotency, ownership, and provider-evidence tests passed.
- Completion: 2026-08-20. Links: `splitAllocationReversalUseCases.js`, `docs/features/POS_SPLIT_PAYMENT_CONTRACT.md`.

## Phase 129 - Post-Close and Post-Z Accounting

- Initiative/release: immutable close reporting.
- Objective/scope: report later adjustments by their event timestamp without rewriting a prior shift summary/Z-reading or double-subtracting the void.
- Status: `completed`; dependencies: Phases 117-128.
- Acceptance/evidence: close-boundary, same-second, cashier-history, daily-report, and zero-value breakdown regressions passed.
- Completion: 2026-08-20. Links: `posRepository.js`, `PosReportsAnalyticsWorkspace.jsx`, `ShiftCloseSummaryPrintView.jsx`.

## Phase 130 - POS Refund Workflow and Permission UX

- Initiative/release: operator-facing refund completion.
- Objective/scope: route History's Refund/Continue Refund action to the server-classified cash, external, provider, or split workflow and show acting authority requirements.
- Status: `completed`; dependencies: Phases 114 and 124-129.
- Acceptance/evidence: workflow dialog, permission, history, receipt, and terminal contracts passed.
- Completion: 2026-08-20. Links: `POSRefundWorkflowDialog.jsx`, `usePosHistoryVoidWorkflow.js`.

## Phase 131 - Refund Lifecycle Failure Matrix

- Initiative/release: deterministic release certification.
- Objective/scope: cover authorization, validation, idempotency, ownership, provider mismatch/retry, report attribution, and browser runtime failures.
- Status: `completed`; dependencies: Phases 124-130.
- Acceptance/evidence: backend 22 suites/190 tests, frontend 104 files/515 tests, and authenticated E2E 1/1 passed.
- Completion: 2026-08-20. Links: POS backend suites and `tests/e2e/pos/admin-void.spec.js`.

## Phase 132 - Paid-Refund Release Closure

- Initiative/release: PR #681 combined Storefront payment and POS accountability closure.
- Objective/scope: merge current `develop`, resolve conflicts, apply landlord/tenant migrations, validate, document, push, and update the open PR without merging or deploying it.
- Status: `completed`; dependencies: Phases 111-131 and `develop` commit `498d20f45`.
- Acceptance/evidence: merge completed; landlord migration is current; tenant schemas passed 14/14; backend 190 tests, frontend 515 tests, POS build, authenticated E2E, architecture, and compliance gates passed.
- Completion: 2026-08-20. Links: PR #681, issues #679 and #754,
  `docs/compliance/impact-declarations/2026-08-20-pos-accountable-void-refund-lifecycle.md`,
  and commits `f84acb9c3`, `313a9351d`, `54976dbab`, `96f8eeb54`, `f3cfb5844`, and `f62be4275`.

### POS initiative numbering reconciliation

The POS work was discussed under temporary working labels before the Phase 110
voucher ledger landed on `develop`. To preserve the authoritative continuous
sequence, working Phase 107 maps to canonical Phase 111; working Phases 113-133
map in order to canonical Phases 112-132. Historical approvals are preserved by
this mapping and were not renumbered in-place in any merged ledger entry. Next
eligible repository phase at the time this note was written: 133.

**Update, 2026-08-20:** #761 flagged that #696 (voucher pricelist entity) shipped without ever
getting a phase entry — filed when Phase 111 was still open, before this section's own numbering
reconciliation claimed 111 for the unrelated POS decomposition initiative above. #761's underlying
finding stands; the number it named does not. Per this ledger's own continuous-sequence rule
(phases are assigned in documentation order, not backdated to match when the code actually merged —
see Phase 110's own retroactive-audit precedent), the missing #696 entry and this session's new
work take the next two eligible numbers below, **133** and **134**. Next eligible repository phase
after this update: **135**.

## Phase 133 - Voucher Pricelist Entity (retroactive entry for #696)

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453). Retroactively documented 2026-08-20 per
  #761 -- the code shipped 2026-08-18 (PR #700) but the ledger entry was never written.
- Release: PR #700, merged to `develop` 2026-08-18.

### Objective and Scope

- Extends #584's `fixed_price` benefit class from one pinned price for every scoped item to a real
  per-item wholesale pricelist -- N prices for N items, not one price applied uniformly.
- New tenant tables: `pricelists` (`name`, `description`, `status` draft/active/archived, `version`
  optimistic lock, timestamps) and `pricelist_items` (`pricelist_id`, `item_id`,
  `unit_price_centavos`, `is_manual_override`, unique on `(pricelist_id, item_id)`).
  `is_manual_override` is load-bearing, not bookkeeping -- it distinguishes a deliberately-typed
  price from an autofilled SRP default, since `Item.default_sale_price` moves on Dispatch Order
  dispatches and an unmarked row would start granting an unintended discount as SRP rises.
- `vouchers.pricelist_id` (new nullable FK column, `ON DELETE RESTRICT`) lets a `fixed_price`
  voucher attach a pricelist instead of a single scalar price -- mutually exclusive with
  `fixed_unit_price_centavos`, enforced in `voucherUseCases.js`'s `applyBenefitConfig`, not the
  schema. When a pricelist is attached, it **is** the scope -- `voucher_scopes` is not consulted.
- Explicitly not a reversal of #569 (B2B deferral) -- per #454 decision 2, vouchers serve the
  B2B-shaped need through a B2C mechanism without building B2B itself.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 102-103's voucher entity and benefit-resolution domain (`voucherBenefitPolicy.js`
  extended, not replaced).
- Classification: `major`, `surfaces: pos,terminal,payments` --
  `docs/compliance/impact-declarations/2026-08-18-voucher-pricelist-entity.md`.
- ADR 0066 Decision 5 amended 2026-08-18 to extend the `fixed_price` intent-not-stored-delta
  principle from a single scalar to a pricelist.

### Acceptance and Validation Evidence

- Backend unit tests for pricelist-backed voucher resolution (fails closed when the pricelist
  matches nothing in the cart, when the attached pricelist is archived; succeeds when active) --
  see `apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js`'s `#696 pricelist-backed
  voucher` block.
- `check:compliance`, `check:architecture`, `check:adr` passed on the merging PR.

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260818000001-create-pricelists.cjs`
- `apps/dgfy-api/src/models/Pricelist.js`, `apps/dgfy-api/src/models/PricelistItem.js`
- `apps/dgfy-api/src/modules/vouchers/domain/voucherBenefitPolicy.js`
- `apps/dgfy-web/src/features/pos/components/PricelistManagementPanel.jsx`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (2026-08-18 amendment)

## Phase 134 - POS Voucher Redemption

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453). Issue #712, filed after a backlog audit
  found POS voucher redemption did not exist as a real feature anywhere in the codebase despite the
  #604 master switch and the channel-mask eligibility check both already being built and waiting for
  a caller.
- Release: single `develop`-targeted PR (`feature/712-pos-voucher-redemption`).

### Objective and Scope

- Wires `redeemVoucherUseCase`/`previewVoucherEligibilityUseCase` into `checkoutPosUseCase`, sale-
  level only (a voucher's own `voucher_scopes`/pricelist decides which lines it touches, matching
  the storefront path -- no per-line voucher entry was added).
- Gate: `voucher_pos_redemption_enabled` (#604, tenant-wide, default off) **and** the specific
  voucher's `channels_mask` including the POS bit. No `voucher_kind`-based restriction -- rejected as
  a redundant second gating mechanism for the same question `channels_mask` already answers.
- Customer name required, matching the existing POS promo-code requirement -- narrows #454 decision
  6 (ADR 0066 amendment, 2026-08-20, above); manager PIN required, parity with ADR 0033 Decision 7,
  no exception (a follow-up issue questions this parity without changing today's behavior).
- Two defects found and fixed while wiring this, neither previously covered by any test:
  1. `redeemVoucherUseCase`'s ledger idempotency key was hardcoded to a `storefront:` prefix
     regardless of the caller's `channel` -- a POS redemption would have shared the storefront
     idempotency namespace. Now derived from `channel`.
  2. POS's `quoteOnly` checkout path (used by `createPosPaymentSessionUseCase`) would otherwise have
     called `redeemVoucherUseCase` unconditionally and burned a real redemption on a mere price
     check -- `quoteOnly` is the discriminator that selects `previewVoucherEligibilityUseCase`
     instead, since POS (unlike the storefront) always has an open transaction and so cannot use
     transaction-presence as the preview/redeem signal.
- A voucher's discount is never run through `calculatePosDiscount` (the generic redistributor used
  by promo/senior/pwd/employee/manual) -- `posVoucherDiscountCalculator.js`'s
  `buildVoucherGovernedCalculation` builds the same return-shape contract directly from the
  voucher's own authoritative `lineAllocations`, since re-deriving a `fixed_price` voucher's per-line
  discount via proportional redistribution would silently diverge from ADR 0066 Decision 5's
  per-line delta.
- Frontend: a sixth discount-type card (Voucher) in the POS checkout modal, no client-side code
  validation (unlike Promo, no endpoint enumerates a store's vouchers), and a new redemption-time
  reason-code copy map (`posCheckoutErrorMessages.js`) -- `VoucherManagementPanel.jsx`'s existing map
  is authoring-only and covered none of the codes a cashier can actually hit at checkout.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 102-105 (voucher entity, redemption ledger, master switch) and Phase 110
  (governed discount slot / fiscal audit row pattern, reused rather than re-derived).
- Classification: `major`, `surfaces: pos,terminal` --
  `docs/compliance/impact-declarations/2026-08-20-pos-voucher-redemption.md`.
- ADR 0066 amended 2026-08-20 (above) narrowing #454 decision 6.

### Acceptance and Validation Evidence

- `apps/dgfy-api/tests/posDiscountPolicy.unit.test.js`'s `voucher discounts (#712)` block -- customer
  name requirement, voucher-code requirement before calling the redemption dependency, percent_off
  and fixed-benefit application shaping, sale-level-only line scoping, and a regression guard against
  the voucher branch ever reaching `UNSUPPORTED_DISCOUNT_TYPE`.
- `apps/dgfy-api/tests/posVoucherDiscountCalculator.unit.test.js` -- proportional-split divergence
  guard, ineligible-line zeroing, VAT always zero (never statutory), method/rate resolution, and a
  full subtotal/discount/final-line-amount reconciliation.
- `apps/dgfy-api/tests/voucherRedemptionUseCases.usecases.test.js`'s new channel-namespacing
  regression test (idempotency key prefix derived from `channel`, not hardcoded).
- `apps/dgfy-api/tests/posValidator.discountPolicy.test.js` -- accepts a governed voucher discount
  and a voucher `discount_approval`, rejects an over-length voucher code, rejects a voucher
  `discount_type` on a per-line `item_discount` (sale-level-only boundary).
- `apps/dgfy-web/src/features/pos/utils/__tests__/posCheckoutErrorMessages.test.js` -- voucher
  reason-code coverage including the 409 `VOUCHER_DISCOUNT_SLOT_OCCUPIED` case, which the generic
  422-only validation-message path would otherwise miss.
- `discountTypeCards.contract.test.js` updated for six cards; `build:pos` and `build:skupervisor`
  both clean.
- No live-database integration test exercises a full POS-voucher-checkout end-to-end -- disclosed as
  a gap rather than implied covered, same disclosure Phase 110 made for the equivalent storefront
  gap.

### Implementation Links

- `apps/dgfy-api/src/modules/pos/domain/posDiscountPolicy.js`,
  `apps/dgfy-api/src/modules/pos/domain/posVoucherDiscountCalculator.js` (new)
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherRedemptionUseCases.js`
- `apps/dgfy-api/src/validators/posValidator.js`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`,
  `POSCheckoutTerminalView.jsx`, `apps/dgfy-web/src/features/pos/utils/posCheckoutTerminalUtils.js`,
  `posCheckoutErrorMessages.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (2026-08-20 amendment)

## Phase 135 - Voucher Public Listing Flag and Storefront Discovery

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453). Issue #713, filed after a backlog audit
  found the voucher entity has no public marketing/discovery surface -- the legacy promo engine
  advertises active promos as "Current Promos" storefront cards; a voucher, once redeemable, had no
  equivalent way for a customer to discover it exists without already knowing a code.
- Release: single `develop`-targeted PR (`feature/713-voucher-public-listing`).

### Objective and Scope

- New `vouchers.is_publicly_listed BOOLEAN NOT NULL DEFAULT false` column, deliberately independent
  of the pre-existing `channels_mask` -- `channels_mask` controls where a code is USABLE
  (storefront/POS), this controls whether it's ADVERTISED on the public storefront. A B2B pricelist
  voucher (#696) can be POS-usable and unadvertised, the combination `channels_mask` alone cannot
  express. Default `false` because no existing "usable but unadvertised" concept exists for this
  column to preserve -- every active promo is unconditionally advertised today.
- Backend: `storefrontDiscoveryIndexService.js`'s snapshot builder gains
  `buildPublicStorefrontVouchers`, querying `active`, `is_publicly_listed` vouchers per tenant and
  filtering each through `evaluateVoucherEligibility`'s existing channel/weekday/time-window checks
  (via `voucherDisplayUseCases.js`'s `DISPLAY_RELEVANT_REASON_CODES`, exported and reused rather than
  re-derived -- the exact same "unknowable before a cart exists" filter that module's own
  code-in/price-out display path already applies). Fails open on a query error, mirroring that
  module's own convention -- a bad voucher lookup must never blank the whole discovery snapshot.
- Frontend: no new component. `fnbPromoModel.js`'s `getPromoCandidates` gains
  `storefront_vouchers` as a second candidate source, adapted into the exact raw shape a
  `storefront_promos` entry already has (`code` -> `promo_code`, `percent_off_bps` basis points ->
  `discount_percent` 0-100) before the existing normalize/dedupe/cap pipeline ever sees it --
  vouchers become ordinary promo candidates the moment they leave the adapter, so
  `StorefrontPromoSection.jsx` and all five of its mode-specific consumers render a voucher card
  identically to a promo card with zero changes to any of them. A promo and a voucher sharing the
  same code dedupe to whichever was collected first (`storefront_promos` before
  `storefront_vouchers`), matching the existing storefront_promos-before-legacy-storefront_promo
  precedence order.
- A non-`percent_off` voucher (amount_off/fixed_price) surfaces on its title/badge with no
  fabricated discount label, matching the catalog-display seam's (#603) own convention of giving
  amount_off a badge only, never an invented percentage or price.
- Cache-key concern from #713's own body, resolved (not deferred): unlike the affiliate-attribution
  class of bug (#671), voucher listing eligibility depends only on `now`/`timezone` -- the same
  page-level, periodically-refreshed values `storefront_open`/business-hours status already use in
  this same snapshot -- never on anything visitor-specific (no affiliate code, no session, no
  customer id). No new per-visitor cache variance is introduced.
- Disclosed, not silently accepted: because this projection is time/weekday-aware and the discovery
  index snapshot is built periodically (not per-request), a voucher can appear or disappear from the
  storefront listing between syncs as its validity window opens or closes -- the legacy promo
  projection (`parsePublicCommercialPromos`) does no such time-of-day/weekday filtering at all, so
  this is more precise than the promo engine's own equivalent, not less, but the staleness window
  itself is inherited from the existing sync cadence, not newly introduced.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 102-106 (voucher entity, benefit/eligibility domain, catalog display seam). No
  code dependency on Phase 134 (POS voucher redemption) -- the two PRs are independent; Phase 134
  merged first purely by scheduling/priority order (#712 was Pat's stated priority), not because
  #713 requires it.
- Classification: `major`, `surfaces: pos,terminal` --
  `docs/compliance/impact-declarations/2026-08-20-voucher-public-listing.md`.
- No ADR amendment required -- `is_publicly_listed` adds a new, independent eligibility axis; it
  does not narrow, reverse, or contradict any existing ADR 0066 decision or consequence.

### Acceptance and Validation Evidence

- `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js` -- new column-repair registration test.
- `apps/dgfy-api/tests/voucherValidator.test.js`, `voucherUseCases.usecases.test.js` -- create/update
  schema defaults and writable-column coverage for `is_publicly_listed`.
- `apps/dgfy-api/tests/storefrontDiscoveryIndexService.catalogVisibility.test.js` -- two new tests:
  only active + publicly-listed + storefront-channel-eligible vouchers are listed (a POS-only
  publicly-listed voucher is confirmed excluded), and the projection fails open (empty list, not a
  thrown error) when the `Voucher` model is unavailable on a tenant connection.
  `voucherDisplayUseCases.usecases.test.js` -- confirms the exported `DISPLAY_RELEVANT_REASON_CODES`
  reuse didn't change that module's own 16 existing tests.
- `apps/dgfy-web/apps/store/src/modes/fnb/promos/model/fnbPromoModel.test.js` -- four new tests: a
  percent_off voucher adapts correctly (bps -> percent conversion verified), a non-percent_off
  voucher surfaces without a fabricated discount label, a voucher sharing a promo's code dedupes
  correctly, and an inactive voucher is dropped.
- `apps/dgfy-web/src/features/pos/__tests__/voucherManagementPayload.test.js` -- two new tests:
  `is_publicly_listed` defaults to `false` and is independent of `channelFlags`/`channels_mask`.
- `npm run build:pos` and `npm run build:skupervisor` both pass.

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260820000001-add-voucher-public-listing.cjs`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/models/Voucher.js`
- `apps/dgfy-api/src/validators/voucherValidator.js`
- `apps/dgfy-api/src/modules/vouchers/usecases/voucherUseCases.js`,
  `voucherDisplayUseCases.js`
- `apps/dgfy-api/src/services/storefrontDiscoveryIndexService.js`
- `apps/dgfy-web/src/features/pos/components/VoucherManagementPanel.jsx`
- `apps/dgfy-web/apps/store/src/modes/fnb/promos/model/fnbPromoModel.js`

## Phase 136 - Governance: ADR 0069 Supersedes ADR 0068 for Retail Downpayment Capture

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #818, Phase 136 of the
  epic's phase sequence, continuing this ledger's numbering from its prior highest entry, 135.
- Release: single `develop`-targeted PR (`docs/818-adr-0069-downpayment-capture-methods`).

### Objective and Scope

- Docs-only. ADR 0068 (accepted 2026-08-21, the same day) capped Retail downpayment capture to
  PayMongo QRPh only, `[binding]`. The product owner reversed that constraint hours later during
  the #273 planning session: capture should support any online method the store enables,
  configurable per store and optionally narrowed for downpayment specifically (#816), with card
  once constructible (#477). Changing a `[binding]` clause has exactly one lawful path under ADR
  0039 — a new superseding ADR plus tech-lead approval; amendment was already ruled out for this
  ADR specifically (a prior fix to clause 2 removed "or amending decision" language for the same
  reason), and the `review_by`-decay exception does not apply (2027-02-21, six months out).
- ADR 0069 authored, fully restating ADR 0068's clauses 2-9 with three changes: clause 1 rewritten
  and split (1a widens the capture-method authorization, 1b carries over the capped-amount rule
  unchanged, still `[binding]`); clause 8 changed from a fixed `[snapshot]` forfeiture policy to a
  per-store refundable/non-refundable `[default]` toggle; new clause 10 (`[default]`) recording the
  platform-fee basis for a partial capture as the captured amount, pending revisit (#817). Clause 6
  (Retail-only scope) is unchanged -- this ADR does not widen authorization to Services (#812
  remains its own authorizing decision).
- ADR 0068 flipped to `status: superseded`, `authority_level: historical`,
  `superseded_by: 0069-...md`; its `## Status` section rewritten to point at ADR 0069. Both ADRs
  share the same `date: 2026-08-21` deliberately -- the reversal happened same-day, and superseding
  (rather than editing 0068 in place, which the governance system has no path for on an `accepted`
  ADR) preserves that record instead of erasing it.
- `docs/architecture/adr/INDEX.md` regenerated (`npm run generate:adr-index`); diff is exactly the
  0068 row (`accepted` -> `superseded`) and a new 0069 row.
- No compliance impact declaration required or added -- every rule in
  `scripts/check-compliance-impact.js` is anchored to `apps/dgfy-api/` or `apps/dgfy-web/`; a
  docs-only change under `docs/` matches none of them and the script exits 0.

### Status

- `completed`

### Dependencies and Governance Note

- Gates every subsequent phase of epic #815 (#819-#827) -- none may proceed until this ADR is in
  force, since they all cite ADR 0068/0069 clause numbers as their authorization.
- Classification: this is the `[binding]`-clause supersession path per
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`'s Mandatory Process step 3 and ADR 0039's tier
  table -- it therefore requires tech-lead approval as a separate obligation from authoring the ADR
  itself. Drafting and opening the implementing PR does not constitute that approval; merging the
  PR is what enacts the decision, and that approval gate is held by Pat, not by the Worker role.
- Depends on ADR 0068 (commit `8f69e4d0c`, PR #787, closing #703) having landed first, same day.

### Acceptance and Validation Evidence

- `npm run check:adr` -- `[adr-lint] OK. Validated 76 ADRs.`
- `npm run test:adr` -- `check-adr.js` regression suite, unchanged pass.
- `npm run lint:docs` -- chains `lint-docs.js` + `check:adr`.
- `npm run check:compliance` -- `No compliance-sensitive changes detected.`
- Manual cross-check: every in-body "ADR 00NN" reference in both 0068 and 0069 resolves to the
  correct number -- two of the three prior supersession precedents in this repo (0027->0052,
  0061->0065) shipped with the wrong ADR number in their Status prose; this one was checked
  specifically to not repeat that.
- No live-database or runtime test applies -- no code changed.

### Implementation Links

- `docs/architecture/adr/0069-retail-downpayment-multi-method-capture-and-refund-policy.md` (new)
- `docs/architecture/adr/0068-retail-downpayment-payment-capture-authorization.md` (status flip)
- `docs/architecture/adr/INDEX.md`

## Phase 137 - Data Model + Migration: Partial-Payment Vocabulary (retroactive entry)

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #819, Phase 137 of the
  epic's phase sequence, continuing this ledger's numbering from Phase 136.
- Release: `develop`-targeted PR #829, plus follow-up PR #830 addressing `pr-reviewer`'s findings
  from #829's review.
- **This entry is added retroactively, in the Phase 138 (#820) session** — the #819 session closed
  out PR #829/#830 without ever adding a ledger entry, a gap AGENTS.md's Continuous Phase Numbering
  rules make this ledger authoritative against. Not caught by either PR's review.

### Objective and Scope

- Added the partial-payment data-model vocabulary `PosTransaction` and checkout lacked, per ADR
  0069 clause 4 (carried over verbatim from ADR 0068 clause 4, unchanged by the Phase 136
  supersession): `amount_paid`/`balance_due` peso `DECIMAL(14,4)` columns on `pos_transactions`
  (clause 4a), a `partially_paid` `payment_status` ENUM value, and a new tenant-local
  `pos_order_payments` per-order ledger table (clause 4b) — one row per
  downpayment/balance/refund/forfeiture event, structurally modeled on `pos_payment_allocations`,
  not `platform_invoice_payments`. No `payment_timing` value added (clause 4c). No behavior change
  — nothing outside the migration's own backfill reads or writes these columns/table yet.
- Three migrations: `20260821000002-add-pos-transaction-partial-payment-columns.cjs` (nullable-add
  → backfill → NOT NULL, same shape as `20260807000002-add-pos-payment-timing.cjs`),
  `20260821000003-expand-pos-transaction-payment-status-partially-paid.cjs` (tenant-fan-out ENUM
  widening, same shape as `20260817000001-expand-storefront-paymongo-payment-methods.cjs`), and
  `20260821000004-create-pos-order-payments.cjs` (new tenant-local table).
- `PosTransaction.js` extended; new `PosOrderPayment.js` model added and registered in
  `models/index.js`. `sync-tenant-schemas.js` registrations added for all three surfaces
  (`REQUIRED_TENANT_SCHEMA_COLUMNS`, `REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS`,
  `REQUIRED_TENANT_SCHEMA_TABLES`); `TENANT_SCHEMA_CAPABILITY_VERSION` bumped to `2026-08-21.1`.
- **This is a checkpoint phase** (migrations under `apps/dgfy-migration-runner/migrations/`) — the
  full design was presented to Pat before any file was committed, per Pat's "just go straight to
  PR" go-ahead.
- No compliance impact declaration required — none of the changed paths (`src/models/`,
  `apps/dgfy-migration-runner/migrations/`, `scripts/sync-tenant-schemas.js`, `tests/`) match any
  `COMPLIANCE_SENSITIVE_RULES` pattern.
- `pr-reviewer`'s review of PR #829 (verdict `COMMENT`, no blockers) raised three should-fix
  findings, all addressed in follow-up PR #830: RF-1 (the backfill conflated
  refunded/partial-refunded/refund-pending with unpaid — corrected so those three statuses backfill
  `balance_due = 0`, since they're resolved, not outstanding), RF-2 (a stale "before merge" comment
  on the `REQUIRED_TENANT_SCHEMA_TABLES` DDL, corrected to record that the DDL was independently
  verified by the review rather than still pending), RF-3 (`docs/database/schema.md` was never
  updated — added).

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 136 (ADR 0069) being in force — cites clause 4 throughout.
- Gates the phases that build on this vocabulary: Phase 140 (quote/checkout resolution), Phase 141
  (capture), Phase 144 (refund/forfeiture), Phase 148 (balance settlement). (Corrected 2026-08-22,
  #848: this line's own phase numbers had already drifted from what those phases actually became
  before the renumbering below — Phase 139 turned out to be the ADR 0070 governance correction, not
  quote/checkout resolution. Re-corrected 2026-08-22 for the #853/#578-precedent renumber: #825
  moved from Phase 145 to Phase 148 — see the dated note at the end of this file.)
- Board: #819 was set `Done` automatically by the project's own workflow when PR #829 merged with
  `Closes #819`. Flagged back to `For QA` in the Phase 138 (#820) session (Housekeeping, this
  session) since no deployed-environment verification (Verifier/QA role) has actually run yet —
  `Done` was a merge-time artifact, not a completed verification.

### Acceptance and Validation Evidence

- `node --check` on every new/changed file — clean.
- `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js` — 26/26 passing (3 new cases: column
  repair, enum repair, whole-table repair, mirroring existing precedent).
- `npm run check:compliance` — clean, both before and after the RF-1/2/3 follow-up.
- **Open gap, carried forward honestly, not silently closed**: the migrations' `up()`/`down()` were
  never run against a live/scratch MySQL database in either session (#819 or the #830 follow-up) —
  no local DB was available. RF-1's corrected backfill CASE logic is therefore still unverified
  against real data. Flag this before Phase 139+ relies on `amount_paid`/`balance_due` being
  correctly backfilled in a real deployed environment.

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260821000002-add-pos-transaction-partial-payment-columns.cjs`
- `apps/dgfy-migration-runner/migrations/20260821000003-expand-pos-transaction-payment-status-partially-paid.cjs`
- `apps/dgfy-migration-runner/migrations/20260821000004-create-pos-order-payments.cjs`
- `apps/dgfy-api/src/models/PosTransaction.js`, `apps/dgfy-api/src/models/PosOrderPayment.js`
- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/tests/tenantSchemaSyncScripts.test.js`
- `docs/database/schema.md` (`### pos_transactions: partial-payment columns (Phase 137)`,
  `### pos_order_payments (Phase 137)`)
- PR #829, PR #830

## Phase 138 - Config Surface: Per-Store Payment Mode + Downpayment Policy (Backend)

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #820, Phase 138 of the
  epic's phase sequence, continuing this ledger's numbering from Phase 137.
- Release: single `develop`-targeted PR (`feat/820-downpayment-config-surface`).

### Objective and Scope

- Per-tenant config surface ADR 0069 clause 5 (`[default]`, config-surface steer) and clause 7
  (`[binding]`, non-Retail rejection) authorize: `payment_mode`
  (`full_payment`/`downpayment_required`/`customer_choice`), downpayment amount/type
  (`percentage`/`fixed`, basis-points/centavos), refundability, and an `allowed_capture_methods`
  override.
- New **landlord** table `tenant_downpayment_settings` (one row per tenant), modeled on
  `TenantAffiliateSettings.js` per clause 5's explicit steer — migration
  `20260821000005-create-tenant-downpayment-settings.cjs`. New model
  `apps/dgfy-api/src/models/Landlord/TenantDownpaymentSettings.js`, registered in `models/index.js`.
- New module `apps/dgfy-api/src/modules/downpayment/` (repository, use cases, controllers) — a
  genuinely new bounded domain this epic's later phases (capture, refund/forfeiture, balance
  settlement) will keep extending, not folded into `modules/dgfy/` (the affiliate settings'
  precedent) or `modules/store/`.
- **Deliberately registered as a compliance-sensitive surface**: `scripts/check-compliance-impact.js`'s
  `COMPLIANCE_SENSITIVE_RULES` gained a `^apps/dgfy-api/src/modules/downpayment/` entry
  (`major`, `surfaces: payments`), mirrored into `docs/compliance/compliance-classification-matrix.md`
  — this is substantively a payment/checkout config surface regardless of which module folder it
  lands in (ADR 0069's own Hardening Contract names "payment, checkout" as a trigger domain), so
  leaving it outside the existing pattern list would have silently dodged the guardrail rather than
  correctly tripping it. This is the first phase in the epic to actually trigger a compliance
  declaration — Phase 136/137 both confirmed clean of any match.
- Joi validators (`apps/dgfy-api/src/validators/downpaymentSettingsValidator.js`) own shape/bounds;
  the use-case layer (`downpaymentSettingsUseCases.js`) owns the two DB-dependent business rules Joi
  can't express: **ADR clause 7's non-Retail rejection** (a `payment_mode = downpayment_required`
  update is rejected, `422 WORKFLOW_MODE_NOT_RETAIL`, unless the tenant's `ops_workflow_mode`
  resolves to Retail — `resolveStorefrontPaymentCapabilities` has no `workflow_mode` concept and
  doesn't catch this on its own) and **`customer_choice` rejection** (`422
  PAYMENT_MODE_NOT_SUPPORTED` — schema-authorized so no future migration is needed when it ships,
  but not actually settable in v1). Every write re-validates the full *effective* (merged)
  settings row, not just the fields the request touches, so a partial update can never leave the
  row internally inconsistent.
- New `PERMISSIONS.DOWNPAYMENT` block (`VIEW_DOWNPAYMENT_SETTINGS`/`MANAGE_DOWNPAYMENT_SETTINGS`);
  `GET`/`PUT /api/v1/downpayment/settings`, mounted in `server.js` mirroring `affiliateAdminRoutes`'s
  convention exactly (same prefix shape, room for this epic's later admin endpoints as siblings).
- New `packages/shared-constants/src/downpaymentDefaults.js` per-vertical-defaults registry,
  mirroring `posDefaultsAndTerminology.js`'s pattern (per #820's own explicit ask) — every entry's
  value is intentionally identical today (nothing in ADR 0069 or #820 specifies real per-vertical
  divergence, and clause 6 scopes actual usage to Retail only regardless); future-ready plumbing,
  not invented business logic. Not wired into the repository's own `DEFAULT_SETTINGS` fallback,
  which stays flat/non-vertical-aware (no tenant-DB `workflow_mode` visibility from the landlord
  repository without extra plumbing this phase doesn't need).
- Compliance impact declaration:
  `docs/compliance/impact-declarations/2026-08-21-downpayment-config-surface.md` (`major`,
  `surfaces: payments`) — states plainly that the live `POST /api/v1/compliance/preflight` endpoint
  was **not** executed against a live environment this session (none available), following the
  established honest-caveat shape from `2026-07-29-pos-batch-menu-import.md`.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 136 (ADR 0069, clauses 5 and 7) and Phase 137 (the `payment_status`/`amount_paid`
  vocabulary this config surface's later consumers will read).
- Gates Phase 139 (server-authoritative downpayment resolution at quote/checkout) — that phase is
  the first actual *reader* of `tenant_downpayment_settings`; this phase is config-surface only.
- This phase has **two** checkpoints (`.agents/skills/implement/SKILL.md`'s checkpoint table): the
  migration under `apps/dgfy-migration-runner/migrations/`, and the compliance declaration this
  phase's own `modules/downpayment/` registration triggers. Both resolved at one combined stop
  point before commit, per Pat's confirmation.
- Board: #818 and #819 (Phases 136/137) were also flipped `Done` → `For QA` in this session
  (Housekeeping), independent of #820's own code — see Phase 137's entry above.

### Acceptance and Validation Evidence

- `node --check` on every new/changed `.js`/`.cjs` file — clean.
- `apps/dgfy-api/tests/downpaymentSettingsUseCases.unit.test.js` (14 cases, including the issue's
  named-required non-Retail-rejection case and the `customer_choice` rejection case),
  `downpaymentSettingsRepository.unit.test.js` (3 cases), `downpaymentSettingsValidator.unit.test.js`
  (6 cases) — 23/23 passing.
- `npm run check:compliance` — confirmed it correctly *requires* a declaration once
  `modules/downpayment/` existed without one, then accepts it once the declaration file was added.
- `npm run check:architecture` — `[ArchitectureGuardrails] OK.` / `[ControllerBoundary] OK.` — new
  module passes module-structure and controller-boundary checks.
- **Open gap, carried forward honestly, not silently closed**: the migration's `up()`/`down()` was
  never run against a live/scratch MySQL database (none available this session — same gap as Phase
  137), and the live `POST /api/v1/compliance/preflight` call was not executed (see the compliance
  declaration's own Verification Evidence section for what a reviewer with a live environment must
  do before merge).

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260821000005-create-tenant-downpayment-settings.cjs`
- `apps/dgfy-api/src/models/Landlord/TenantDownpaymentSettings.js`
- `apps/dgfy-api/src/modules/downpayment/` (`index.js`, `README.md`, `repositories/`, `usecases/`,
  `controllers/`)
- `apps/dgfy-api/src/validators/downpaymentSettingsValidator.js`
- `apps/dgfy-api/src/config/permissions.js` (`DOWNPAYMENT` block)
- `apps/dgfy-api/src/routes/downpaymentSettings.js`, `apps/dgfy-api/src/server.js` (mount)
- `packages/shared-constants/src/downpaymentDefaults.js`,
  `apps/dgfy-api/src/modules/shared/constants/downpaymentDefaults.js`
- `scripts/check-compliance-impact.js`, `docs/compliance/compliance-classification-matrix.md`
- `docs/compliance/impact-declarations/2026-08-21-downpayment-config-surface.md`
- `docs/database/schema.md` (`### tenant_downpayment_settings (Phase 138)`)

## Phase 139 - Governance Correction: Downpayment Authorization Across All Workflow Modes

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #833, Phase 139 of the
  epic's phase sequence, continuing this ledger's numbering from Phase 138.
- Release: single `develop`-targeted PR (`fix/821-downpayment-authorization-all-verticals`).

### Objective and Scope

- Corrects a scope error introduced in ADR 0068 (superseded), restated unexamined in ADR 0069, and
  shipped as live code in Phase 138 (#820, PR #832): downpayment authorization was gated to Retail
  only (`422 WORKFLOW_MODE_NOT_RETAIL` in `downpaymentSettingsUseCases.js`). Pat's actual planning
  intent, confirmed directly 2026-08-21: Retail/Surebiz is the priority and reference
  implementation, not the authorization boundary — "it DOES NOT MEAN that it's only for retail, and
  other industries don't support it now... I personally rather allow downpayments to any industry
  as soon as now."
- New ADR 0070 supersedes ADR 0069. Carries clauses 1-5 and 8-10 forward verbatim (unchanged
  mechanics: capture cap, balance settlement, DB surface, config-surface steer, refund/forfeiture
  toggle, fiscal deferral, fee basis). Replaces clause 6 (Retail-scoped authorization) with
  `[default]` authorization for every workflow mode, and reframes clause 7's enforcement from
  *vertical-scope* to *reachability*: a downpayment configuration must never be honored by a
  checkout flow not wired to compute/capture it (today: the shared storefront checkout only —
  Services bookings and Hospitality reservations remain unwired, tracked separately at #812, not
  authorization-blocked).
- Confirmed cheap to correct: `storefront` is a universal capability module
  (`packages/shared-constants/src/capabilityModules.js`), not per-vertical — every workflow mode
  selling through the online store already shares the identical `resolveCheckoutContext`
  (`storeUseCases.js`). Widening cost exactly one deleted vertical check, its now-unused
  workflow-mode-resolution plumbing (`resolveTenantWorkflowMode`, the `resolveWorkflowMode`
  injectable dependency, three now-unused imports), and its test.
- Confirmed the fence's own history before rewriting it: ADR 0068's Context justified excluding
  Services (ADR 0057 clause 3, `[binding]`) and Hospitality (ADR 0041) specifically — both real,
  unrelated gates on those verticals' own checkout/booking surfaces. F&B carried no such gate (ADR
  0019 has no payment-collection deferral at all) and was included by generalization, not by its
  own cited reason.
- Scanned the epic's remaining phase bodies (#822/#824/#826/#827, soon retitled 141/142/144/145)
  for inherited Retail-only assumptions before deciding whether a full epic replan was needed — none
  found; their mechanics were already vertical-neutral, only the authorization gate above them was
  wrong. #823 (checkout UI wiring, retitled 143) legitimately stays Retail-specific: it wires the
  *existing* Retail storefront frontend components, not an authorization boundary — other
  verticals' UI is separate, not-yet-requested follow-up work, not a mistranslation.
- Filed #834 (separate, Iteration 3) to audit Hospitality's broader framing as a DGFY-native peer
  niche across ADRs/docs, given the platform's own `WORKFLOW_MODE_ENGINE` classification already
  marks it `'transitional'` (planned sister-app engine, "Sync Core"). Explicitly out of this ADR's
  scope — ADR 0070 treats Hospitality only as "not yet wired," the same treatment already applied to
  Services, without taking a position on its longer-term platform placement.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on and corrects Phase 136 (ADR 0069/formerly 0068) and Phase 138 (#820, the code that
  shipped the gate this phase removes).
- Gates Phase 140 (formerly #821, server-authoritative downpayment resolution at quote/checkout,
  retitled per this phase) — that phase's implementation is simpler under ADR 0070: no vertical
  family check needs to be written at all.
- **Checkpoint**: ADR 0069 clause 6 was `[binding]`; per ADR 0039 and `ARCHITECTURE_GOVERNANCE.md`
  step 3, the only lawful path to change it is a new superseding ADR plus tech-lead approval — an
  `## Amendments` block was not available. Pat's plan approval in this session is that tech-lead
  approval, named and dated in ADR 0070's own Context.
- Board: #820 was still `For Review` despite PR #832 having merged (`Refs #820`) — flipped to
  `For QA` in this session, matching #818/#819. #833 (this phase's own issue) set `In progress` at
  branch time. #821-#827 retitled Phases 140-146; #815's Definition of done and #821's `## Verify`
  section amended to match ADR 0070.

### Acceptance and Validation Evidence

- `node --check` on every new/changed `.js` file — clean.
- `apps/dgfy-api/tests/downpaymentSettingsUseCases.unit.test.js` — rewritten: the non-Retail-
  rejection test replaced by its inverse ("accepts downpayment_required for a non-Retail tenant
  (ADR 0070)"); every other case (customer_choice rejection, type/rate/min-required validation, the
  effective-merged-state test, allowed_capture_methods handling) unchanged and still passing.
  22/22 passing across all three Phase 138 suites (`downpaymentSettingsUseCases`,
  `downpaymentSettingsRepository`, `downpaymentSettingsValidator`).
- `grep -rn "WORKFLOW_MODE_NOT_RETAIL" apps/ docs/` — zero hits outside ADR 0069's own superseded
  historical text and ADR 0070's Context narrative.
- `npm run lint:docs` / `npm run check:adr` / `npm run check:compliance` / `npm run
  check:architecture` — see this phase's PR for full output; the compliance declaration's precondition
  #2 was amended (dated note, not rewritten history) rather than left asserting a guarantee the code
  no longer makes.

### Implementation Links

- `docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md` (new)
- `docs/architecture/adr/0069-retail-downpayment-multi-method-capture-and-refund-policy.md`
  (flipped to `status: superseded` / `authority_level: historical`)
- `apps/dgfy-api/src/modules/downpayment/usecases/downpaymentSettingsUseCases.js` (gate removed)
- `apps/dgfy-api/tests/downpaymentSettingsUseCases.unit.test.js` (rewritten)
- `docs/compliance/impact-declarations/2026-08-21-downpayment-config-surface.md` (precondition #2
  amended)
- Issues #833 (this phase), #834 (Hospitality-framing audit, Iteration 3, out of this ADR's scope)

## Phase 140 - Server-Authoritative Downpayment Resolution at Quote/Checkout

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #821, Phase 140 of the
  epic's phase sequence (retitled from a pre-Phase-139-renumbering "139" per Phase 139's own
  correction), continuing this ledger's numbering from Phase 139.
- Release: single `develop`-targeted PR
  (`feat/821-downpayment-quote-checkout-resolution`).

### Objective and Scope

- First reader of `tenant_downpayment_settings` (Phase 138, #820) — nothing computed or exposed a
  downpayment split before this phase. Compute the split server-side, after the promo/voucher fold,
  and never trust a client-sent figure.
- New pure module `apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js`
  (`resolveDownpaymentForTotal`): percentage/fixed math, `min_downpayment_centavos` floor, clamp to
  the order total (never negative balance, never more than the order is worth), fails closed to
  `full_payment` on a `null`/malformed settings row. Same bps-rounding convention as
  `affiliateCommissionAccrual.js`/`affiliatePricingPolicy.js`
  (`Math.round(baseCentavos * bps / 10000)`).
- `resolveCheckoutContext` (`storeUseCases.js`, the shared resolver behind `/cart/quote`,
  `/store/checkout`, and the QRPh payment-session path) gains an **injected, non-defaulted**
  `downpaymentSettingsRepository` dependency — deliberately not a hard module-level import like the
  existing `dgfyAffiliateRepository` precedent in the same file, because every order needs this
  lookup (unlike the affiliate lookup, gated behind an optional `attribution_enrollment_id`); a hard
  import would have made it an unconditional, unmockable live landlord-DB call on every existing
  store unit test — confirmed by an initial hard-import attempt that broke `buildStoreCheckoutUseCase`
  callers (which pass an explicit `tenantId`, unlike quote/payment-session) before being corrected to
  the `tenantRevenueRepository`-style injected pattern. `undefined` (every pre-Phase-140 caller)
  resolves via `?.` guards to "no settings, full_payment" — zero test edits needed for ~30 existing
  call sites across 6 test files.
- Exposes `payment_mode`/`downpayment_amount`/`balance_due_amount`/`downpayment_refundable` on both
  `/cart/quote`'s response and `/store/checkout`'s `totals`. Deliberately not added to
  `storeQuoteSchema`/`storeCheckoutSchema` (request-body validators with `stripUnknown: true`) — a
  correction from #821's original scope text, which wrongly named those validators as the target;
  response fields belong in the use-case response objects instead.
- Two new fail-closed `422 DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` guards, temporary by design (updated by
  Phase 141/#822 once capture is wired — see that phase's entry): `buildStoreCheckoutUseCase` (ADR
  0070 clause 7 `[binding]` — capture isn't wired yet on this path, so an order claiming "downpayment
  required" that collected nothing is the exact bogus-order case this feature exists to prevent;
  `amount_paid`/`balance_due` themselves already exist as of Phase 137/#819, this guard is about
  nothing being collected, not about missing schema) and `buildStoreCheckoutPaymentSessionUseCase`
  (ADR 0069 clause 1b `[binding]` — that path authorizes `resolved.totalAmount` in full; letting a
  `downpayment_required` order through would authorize the whole order total online, never the
  downpayment amount only).

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 138 (#820, the config surface this phase reads) and Phase 139 (#833, ADR 0070 —
  authorization spans every workflow mode, so this phase's read path performs no vertical check at
  all).
- Gates Phase 141 (#822, capture + webhook finalization) — that phase removes both fail-closed
  guards added here once real PayMongo capture is wired to the downpayment amount specifically.
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table (no migration, no `main`
  base, no deploy dispatch) — proceeded through commit/push/PR per the standing preference recorded
  in the Worker skip-checkpoint-confirmation memory.
- Board: #821 set `In progress` at branch time, `For Review` at PR-open time.

### Acceptance and Validation Evidence

- 22 new unit tests, all passing, no database required: `downpaymentPolicy.unit.test.js` (14 —
  percentage/fixed math, rounding, floor, clamp-to-total, zero/negative total, malformed-row
  fail-closed, refundable flag) and `storeCheckoutDownpaymentResolution.unit.test.js` (8 — quote
  exposure for both `downpayment_required` and `full_payment`, no-injected-repository regression, no
  ambient-tenant regression, both `422` guards firing with no order/session created, a full_payment
  checkout still succeeding with the null downpayment shape).
- Full `apps/dgfy-api` store-prefixed test suite re-run after every code change: 419 passed, 2
  pre-existing failures confirmed via `git stash` to fail identically on unmodified `develop`
  (`storefrontPrimaryLocation.discovery.integration.test.js`,
  `storeRouteTenantContext.integration.test.js`, both requiring a live database, unrelated to this
  change). Zero edits to any pre-existing test file.
- `npm run check:architecture` — `ArchitectureGuardrails OK` (505 files), `ControllerBoundary OK`.
- `npm run check:compliance` — confirmed to **fail** first (missing declaration, proving the
  guardrail actually fires on this diff), then pass once
  `docs/compliance/impact-declarations/2026-08-21-downpayment-quote-checkout-resolution.md` was
  added (`major`/`payments`).
- `node --check` on every new/changed `.js` file — clean.
- Named gaps, not glossed over: no live DB or deployed environment this session, so neither the
  landlord read nor the `422` guards are exercised end-to-end (unit coverage only); `POST
  /api/v1/compliance/preflight` not executed against a live environment (same disclosure shape as
  Phase 138's declaration).

### Implementation Links

- `apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js` (new)
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (`resolveCheckoutContext` +
  the three builders + two fail-closed guards)
- `apps/dgfy-api/src/modules/store/index.js` (wires the real `downpaymentSettingsRepository`)
- `apps/dgfy-api/tests/downpaymentPolicy.unit.test.js` (new),
  `apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js` (new)
- `docs/api/specification.md` (`/store/cart/quote`, `/store/checkout`,
  `/store/checkout/payment-sessions`)
- `docs/database/schema.md` (`tenant_downpayment_settings` reader note corrected)
- `docs/compliance/impact-declarations/2026-08-21-downpayment-quote-checkout-resolution.md` (new)
- Issue #821 (this phase)

## Phase 141 - Capture: Downpayment Payment Session + Webhook Finalization

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #822, Phase 141 of the
  epic's phase sequence, continuing this ledger's numbering from Phase 140.
- Release: single `develop`-targeted PR
  (`feat/822-downpayment-capture-webhook-finalization`).

### Objective and Scope

- **Model correction, made during planning (2026-08-21, Pat's call), before any code was
  written.** #822's own text assumed a downpayment order is "an online order that charges less."
  That is wrong: at a `downpayment_required` store the order is **cash-on-delivery, gated by a
  mandatory online downpayment** — ADR 0069 clause 2 `[binding]` (carried forward by ADR 0070)
  requires the balance to always be collected out-of-band with no second automatic PayMongo charge,
  so every such order is inherently COD-for-the-balance. "Pay the full order online" is the
  separate, deliberately unbuilt `customer_choice` mode. The customer's only online choice is which
  rail pays the downpayment leg. This reframing is what drove the design below; #822's own issue
  text needs a PM correction (handed off, not done in this phase — see Dependencies).
- `buildStoreCheckoutPaymentSessionUseCase` (`storeUseCases.js`): the Phase 140 fail-closed guard is
  replaced with the real capture computation. For a `downpayment_required` tenant, the amount
  authorized/captured online — `total_amount_centavos`, the PayMongo `amount`,
  `platform_fee_centavos` — becomes the downpayment amount, never the order total (ADR 0069 clause
  1b `[binding]`). A new `422 DOWNPAYMENT_POLICY_UNRESOLVED` guard fails closed when the tenant's
  stored setting says `downpayment_required` but the resolved policy doesn't — corrects a Phase 140
  direction error where `downpaymentPolicy.js`'s own fail-closed-to-`full_payment` design (correct
  when nothing could capture) would otherwise let a malformed settings row silently authorize the
  *full* order online with no downpayment gate at all.
- New landlord migration `20260821000006-add-downpayment-capture-to-commerce-payment-sessions.cjs`:
  four additive columns on `commerce_payment_sessions` — `capture_kind`
  (`ENUM('full','downpayment') DEFAULT 'full'`, so every pre-existing row is correct by
  construction), `order_total_centavos` (backfilled from `total_amount_centavos` for pre-existing
  rows), `capture_payment_method`, `downpayment_refundable`. `total_amount_centavos` itself is
  unchanged and now means "the captured amount" — this single reinterpretation is what makes the
  platform-fee guard, the webhook's exact-amount-equality check, and the reject-refund path (#822's
  own "should fall out correctly" list) all work with zero further code change.
- `finalizePaidCommerceSession.js`: derives the order's own `payment_type` to `'cash'` for a
  downpayment capture (COD for the balance is what the order *is*) and builds a new
  `capturedPayment` server-internal sibling argument (never a payload field — `storeCheckoutUseCase`'s
  other caller, `storeHandlers.js`, never passes it) into `storeCheckoutUseCase`.
- `resolveStorefrontPaymentSnapshot` (`storeUseCases.js`) gains a `capturedPayment` branch:
  `payment_status: 'partially_paid'` (or `paid`, if the captured amount happens to equal the order
  total) with `amount_paid`/`balance_due` — the one centavos-to-peso conversion boundary for this
  feature (ADR 0069 clause 4b).
- `buildStoreCheckoutUseCase`'s Phase 140 guard is made **conditional**, not deleted: with
  `capturedPayment` present (the webhook finalizer, after real money was captured) it proceeds and
  writes ledger row 1 (`kind: 'downpayment'`, via the new `storeRepository.createOrderPaymentEntry`,
  inside the same transaction that creates the order); without it (the direct HTTP path — a
  customer picking plain `cash`, collecting nothing) it still fails closed with `422
  DOWNPAYMENT_CAPTURE_NOT_AVAILABLE` (ADR 0070 clause 7 `[binding]`) — deleting this guard outright
  was identified as the failure mode to avoid.
- No change to `processVerifiedPaidCommerceSession.js`'s exact-amount-equality check, #476's
  idempotency claim/row-lock, or the provider-event-replay guard — all inherited unchanged and
  pinned with new tests rather than re-derived.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 140 (#821, the resolution this phase captures against) and, transitively, Phase
  137's (#819) tenant schema (`pos_transactions.amount_paid`/`balance_due`, the `partially_paid`
  enum value, `pos_order_payments`) — all first written by this phase.
- Gates Phase 142 (#823, storefront UI), Phase 144 (#824, accept/reject/refund — the reject-refund
  path this phase makes refund the correct, downpayment-only amount), and Phase 148 (#825, balance
  settlement, the second ledger-row writer). (#824/#825 renumbered 2026-08-22, #848; #825 moved
  again 145→148 on 2026-08-22 for the #853/#578-precedent renumber — see the dated note at the end
  of this file.)
- **Governance wrinkle identified, not resolved here:** ADR 0070 carries ADR 0069's clauses 1-5/8-10
  forward *by reference* rather than restating them, so those live, load-bearing clauses physically
  sit in a document marked `status: superseded`/`authority_level: historical` — which `AGENTS.md`
  forbids citing for new decisions. Works today; breaks the moment one of those clauses needs a
  dated amendment (#817 explicitly anticipates one on clause 10). Handed to PM to file, not fixed in
  this phase.
- Two items handed to PM during this phase, both filed:
  - **#838** — courier cash remittance/reconciliation for COD deliveries (Retail downpayment + F&B):
    once a courier collects the balance in cash, nothing models that money's path back into the
    business's own records. Raised, not solved, during design discussion.
  - **#839** — `sync-tenant-schemas.js` backfills `amount_paid`/`balance_due` incorrectly (flat
    `DEFAULT 0`, no `CASE WHEN payment_status='paid'` logic the Sequelize migration itself uses),
    discovered and reproduced against a restored production snapshot while verifying Phase 137's
    backfill per this phase's own plan requirement — see Acceptance and Validation Evidence.
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table beyond the migration
  itself, which is why its `up`/`down`/`up` cycle was run against a real database this session (see
  below) rather than deferred — proceeded through commit/push/PR per the standing preference
  recorded in the Worker skip-checkpoint-confirmation memory.
- Board: #822 set `In progress` at branch time, `For Review` at PR-open time.

### Acceptance and Validation Evidence

- 20 new/changed unit tests across three files, all passing, no database required for the unit
  layer (fakes throughout): `storeCheckoutDownpaymentResolution.unit.test.js` (11, rewritten from
  Phase 140's 8 — 1 kept, recontextualized as the surviving offline-path guard; the
  payment-session describe block fully rewritten into 4 tests covering the real capture, the fee
  guard on the captured amount, `DOWNPAYMENT_POLICY_UNRESOLVED`, and — added post-review, RF-2 —
  a legitimate zero-total order not being misclassified as a malformed settings row);
  `downpaymentWebhookFinalization.unit.test.js`
  (5, new — the amount-equality check passing for a downpayment session despite `order_total_centavos`
  differing, the same check still catching a genuine mismatch, the order landing `partially_paid`
  with correct `amount_paid`/`balance_due`, the ledger row written inside the order-creation
  transaction, a replayed webhook delivery being a no-op); `storePaymentTruth.unit.test.js` (2, new
  — `resolveStorefrontPaymentSnapshot`'s `capturedPayment` branch in isolation). Pre-existing
  `processVerifiedPaidCommerceSession.usecase.test.js` (7) and `finalizePaidCommerceSession.usecase.test.js`
  (18) suites pass unmodified, confirming no regression to #476's idempotency fix.
- Full `apps/dgfy-api` store-prefixed test suite: 388 passed, the same 2 pre-existing
  DB-dependent integration failures Phase 140 already identified
  (`storefrontPrimaryLocation.discovery.integration.test.js`, `storeRouteTenantContext.integration.test.js`).
- **Reviewer feedback (PR #840, `pr-reviewer`, verdict COMMENT, no blockers) addressed**: RF-1 —
  `createOrderPaymentEntry` now records `payment_reference` (the actual PayMongo charge ID), not
  just `provider_event_id` (the webhook delivery ID); needed by Phase 144/#824's refund-vs-forfeiture
  logic to trace a ledger row back to its charge. RF-2 — the `DOWNPAYMENT_POLICY_UNRESOLVED` guard
  now excludes a legitimate zero-total order (gated on `resolved.totalAmount > 0`), which previously
  misclassified that case instead of falling through to the pre-existing, more accurate
  `totalAmountCentavos <= 0` guard. RF-3/RF-4 (nits) — deleted a stale test-file cross-reference to a
  file that was never created; reconciled the test-count discrepancy across the PR body, the
  compliance declaration, and this entry (388, not 452/387 — the PR body's 452 was simply wrong;
  387 was correct pre-fix, both are now 388 after RF-2's added test). Both should-fix items and both
  nits are fixed, not deferred.
- `npm run check:architecture` — `ArchitectureGuardrails OK` (505 files), `ControllerBoundary OK`.
- `npm run check:compliance` — confirmed to **fail** first (missing declaration), then pass once
  `docs/compliance/impact-declarations/2026-08-21-downpayment-capture-webhook-finalization.md` was
  added (`major`/`payments`).
- `npm run lint:docs` — OK, 27 governed docs + 77 ADRs validated.
- `node --check` on every new/changed `.js` file — clean.
- **Migration run against a real database — the gap Phases 137/138/140 each carried forward is
  closed for this phase's own migration, and Phase 137's backfill was independently re-verified in
  the process.** Using `do-not-commit/local-test/` on docker context `ch` (restored production
  landlord + tenant MySQL 8.0 snapshots): the new landlord migration ran `up → down → up` cleanly —
  all four columns present with correct types/defaults after `up`, all four cleanly absent after
  `down`, correctly restored after the second `up`. Separately, rebuilding the stack's `dgfy-api`
  image (previously 27 hours stale, predating Phase 137) and running
  `npm run check:tenant-schema`/the tenant additive-repair path surfaced that Phase 137's
  `amount_paid`/`balance_due` backfill does **not** land correctly through the real tenant-provisioning
  mechanism (`sync-tenant-schemas.js`, distinct from the Sequelize migration file) — reproduced
  concretely against tenant `sku_tenant_bullduckresto_15a50c4f`'s `pos_transaction_id=1`
  (`payment_status='paid'`, `amount_paid` landed at `0` instead of the order's `total_amount`).
  Root-caused (the tenant-repair DDL registry uses a flat `DEFAULT 0`, not the migration's
  `CASE WHEN payment_status='paid'` logic) and filed as #839 rather than fixed here — out of this
  phase's own scope (a different subsystem than anything Phase 141 touches).
- **Not verifiable this session, disclosed rather than glossed:** no live PayMongo sandbox capture
  end to end; `POST /api/v1/compliance/preflight` not executed against a live environment (same
  disclosure shape as the Phase 138/140 declarations).

### Implementation Links

- `apps/dgfy-migration-runner/migrations/20260821000006-add-downpayment-capture-to-commerce-payment-sessions.cjs` (new)
- `apps/dgfy-api/src/models/Landlord/CommercePaymentSession.js` (four new columns)
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (capture computation, policy-unresolved
  guard, `resolveStorefrontPaymentSnapshot`'s `capturedPayment` branch, conditional checkout guard,
  ledger write)
- `apps/dgfy-api/src/modules/store/repositories/storeRepository.js`,
  `apps/dgfy-api/src/modules/store/contracts/storeRepository.contract.js` (new
  `createOrderPaymentEntry`)
- `apps/dgfy-api/src/modules/commercePayments/usecases/finalizePaidCommerceSession.js` (derives
  `payment_type: 'cash'`, builds `capturedPayment`)
- `apps/dgfy-api/tests/storeCheckoutDownpaymentResolution.unit.test.js` (rewritten),
  `apps/dgfy-api/tests/downpaymentWebhookFinalization.unit.test.js` (new),
  `apps/dgfy-api/tests/storePaymentTruth.unit.test.js` (extended)
- `docs/api/specification.md` (`/store/cart/quote`, `/store/checkout`,
  `/store/checkout/payment-sessions`)
- `docs/database/schema.md` (`commerce_payment_sessions`, `pos_order_payments`,
  `tenant_downpayment_settings` reader notes corrected/extended)
- `docs/compliance/impact-declarations/2026-08-21-downpayment-capture-webhook-finalization.md` (new)
- Issue #822 (this phase); #838, #839 (handed to PM during this phase)

## Phase 142 - Storefront Checkout UI for Downpayment

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #823, Phase 142 of the
  epic's phase sequence, continuing this ledger's numbering from Phase 141.
- Release: two `develop`-targeted PRs — PR #841 (prerequisite fix, #613), then the Phase 142 PR
  stacked on it (`feature/823-downpayment-checkout-ui`).

### Objective and Scope

- **Prerequisite fixed first, its own PR (#613).** Retail and Simple MSME guest checkout was
  blocked at Place Order even after successful OTP verification — `StorefrontApp.jsx` never passed
  `guestCheckoutIntentId`/`guestCheckoutOtpVerified`/`guestCheckoutProof` into the shared
  `useCheckoutSubmission` call site, a pure wiring omission (the sibling F&B call a few lines above
  it already had them). Guest checkout is broken without this fix and Surebiz (the epic's driving
  customer) is Retail guest-heavy. Also fixed `guestCheckoutDraft.js`'s stale payment-type
  allow-list (missing `grab_pay`/`shopeepay`, silently coercing a restored draft to `cash`).
- **The frontend had zero downpayment awareness before this phase** — greenfield on the client.
  Implements the corrected model from Phase 141/PR #840: at a `downpayment_required` store the
  customer's only choice is which online rail pays the downpayment; no plain-cash option (the
  backend already 422s `DOWNPAYMENT_CAPTURE_NOT_AVAILABLE`), no full-online option (the separate,
  unbuilt `customer_choice` mode), no payment-mode toggle.
- **Backend, additive-only, no capture logic touched:**
  `buildListStoreCatalogUseCase` gains a top-level `payment_mode` field on the public
  `GET /store/catalog` response (`'full_payment'` default, fail-closed on any settings-read
  error) — lets the storefront hide cash and force a quote before the payment step, since Simple/
  Retail previously never quoted at all without a discount code applied.
  `serializePaymentSession` gains `capture_kind`/`order_total_amount`/`balance_due_amount`/
  `downpayment_refundable` (persisted since Phase 141, never serialized before).
  `serializeOrderBase` gains `amount_paid`/`balance_due` (same gap). All four new session/order
  fields are `null`/`'full'` for a `full_payment` order, present-and-null per Phase 140's own
  convention.
- **Frontend, one shared presentation model
  (`shared/model/storefrontDownpaymentPresentation.js`) every surface reads from:** normalizes
  order/session/quote (in that precedence — presence of a higher-precedence source always wins,
  even when it says "no downpayment here") into one `{active, downpaymentAmount,
  balanceDueAmount, orderTotalAmount, refundable}` shape. Threaded through: a third mode-agnostic
  auto-quote arm in `StorefrontApp.jsx` (forces the quote Simple/Retail previously skipped);
  `requireQuoteForCheckout` in `useCheckoutTotalsAndGating.js` (blocks Place Order until that
  quote lands); downpayment/balance rows on every checkout summary (Simple/F&B/Retail, desktop +
  mobile); a downpayment-aware payment-step label/callout and hidden cash option
  (`buildStorefrontCheckoutPaymentOptions`'s new `hideCash` option); a downpayment-aware pending-
  payment panel (amount due, balance note, "Try a different payment method" instead of a
  cash-fallback dead end); downpayment-aware confirmation-screen and tracking-page rows; a
  dedicated `downpayment_zero_total` block reason for the voucher-discounts-order-to-zero edge
  case (named risk in planning, not discovered live).
- **Retail wired to online payment for the first time** (subsumes #626 gap 2). Its payment step
  was a hardcoded cash-only placeholder with an inert "coming soon" card and its own disconnected
  local `paymentType` state. Now shares `fnbPaymentType`/`handlePaymentTypeChange` with F&B/MSME
  (threaded through `useRetailOrderPageProps.js`'s existing big-prop-object pattern — the
  intermediate prop-forwarding layers needed no changes, since they already pass that object
  through opaquely), and the online-session-creation branch in `useCheckoutSubmission.js`
  (previously Simple-only) also serves Retail. Retail's own step state is local to
  `RetailOrderPage.jsx` (not hoisted like Simple's), so it self-resumes to its payment step after a
  PayMongo redirect by watching `qrphPaymentSession` rather than needing a pushed-down step
  number. #626 gap 1 (per-store cash/COD disable for card-only full_payment stores) stays deferred.
- `resolveTrackedTotals`, previously duplicated verbatim in `useCheckoutSubmission.js` and
  `useFnbCheckoutSubmission.js`, extracted to `shared/model/trackedTotals.js` and widened to
  overlay `amount_paid`/`balance_due` (previously silently discarded alongside the pre-existing
  `total_amount` fix, RF-1/PR #753).

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 141 (#822, the capture backend this phase's UI drives) and, for the guest
  checkout prerequisite, #613 (fixed first, PR #841).
- Gates nothing downstream directly, but is the storefront-visible half of what Phase 144 (#824,
  accept/reject/refund) and Phase 148 (#825, balance settlement) will build on — the
  `downpayment_refundable` seam (`buildDownpaymentRefundableNote`) exists now for Phase 144 but
  ships no reviewed legal copy (blocked on #280). (#824/#825 renumbered 2026-08-22, #848 — Phase
  143 is now the POS admin config UI, #848 (corrected from an earlier "skupervisor" framing during
  #848's own planning). #825 renumbered again 145→148 on 2026-08-22 for the #853/#578-precedent
  collision — see the dated note at the end of this file.)
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table — no migration, no
  compliance-declaration ambiguity (declared major/payments per the existing `modules/store/**`
  floor), no `staging`/`main` base — proceeded through commit/push/PR per the standing
  skip-checkpoint-confirmation preference.
- Board: #613 → `For Review` at PR #841's open. #823 → `In progress` at branch time, `For Review`
  at PR-open time.
- **Hand-off to PM, not resolved here:** #822 and #823 both still carry the stale "online order
  that charges less" framing in their own issue text; #823 additionally cites superseded ADR 0069
  clause 7 as its rationale (ADR 0070 clause 7 is the live successor). The admin UI gap this note
  originally flagged (no way to configure downpayment for a real tenant except a raw authenticated
  `PUT /api/v1/downpayment/settings` call) is now filed, scheduled, and shipped as its own Phase
  143 ledger entry: #848, a POS Settings tab (not skupervisor, per that phase's own premise
  correction), which prompted the #824/#825 renumbering to 144/145 above and a further 145→148
  renumber since — see Phase 143's own entry and the dated note at the end of this file.

### Acceptance and Validation Evidence

- PR #841 (#613): a source-text contract test scoped to the `useCheckoutSubmission` call-site
  block specifically (not the whole file — the three identifiers were already referenced
  elsewhere via `useGuestCheckoutOtp`/`useFnbCheckoutSubmission`, so a blanket file-content check
  would have passed even with the bug present) — verified to fail on the pre-fix code and pass
  after. `grab_pay`/`shopeepay` regression cases added to `guestCheckoutDraft.test.js`. Full store
  vitest suite: 453 passed, 1 pre-existing unrelated failure (confirmed identical on unmodified
  `develop`). `npm run build:store` passed.
- Backend: 15 tests in `storeCheckoutDownpaymentResolution.unit.test.js` (13 pre-existing + 2 new
  — the client-facing session serializer's downpayment case and its additive-only pin), 7 in
  `downpaymentWebhookFinalization.unit.test.js` (5 pre-existing + 2 new — the client-facing order
  serializer's `amount_paid`/`balance_due` case and its additive-only pin), 5 new in
  `storeCatalogPaymentMode.unit.test.js` (including the settings-read-failure and
  no-repository-injected fallbacks). `npm run check:architecture` OK.
  `GITHUB_BASE_REF=develop npm run check:compliance` confirmed to fail first (missing
  declaration), then pass with
  `docs/compliance/impact-declarations/2026-08-22-downpayment-storefront-checkout-ui.md`. Full
  `apps/dgfy-api` store-scoped suite: 392/397, the 3 failures (2 DB-dependent integration suites +
  1 missing-workspace-module migration test) confirmed identical on unmodified `develop`.
- Frontend: new/extended test coverage across every changed surface —
  `storefrontDownpaymentPresentation.test.js` (the shared model, 18 cases including precedence and
  the `buildPaymentModeStorePatch` patch builder), `retailCheckoutOnlinePayments.contract.test.js`
  (new, mirrors the Simple contract test), extended
  `simpleCheckoutOnlinePayments.contract.test.js`, `simpleCheckoutSuccessStep.test.jsx`, new
  `fnbCheckoutConfirmation.test.jsx`, extended `simpleTrackingPresentation.test.js` (Simple/
  Retail/F&B tracking balance-due wiring), new `trackedTotals.test.js`, `checkoutRules.test.js`
  (the `downpayment_zero_total` reason and `requireQuote` behavior), and a `renderHook`-based
  `useCheckoutTotalsAndGating.downpayment.test.js`. A first attempt at testing
  `useStoreCatalogLoader.js`'s `payment_mode` patch through the full hook via `renderHook` crashed
  the vitest worker on an effect-triggered infinite loop (an over-simplified `requestJson` mock
  returning the same response for every call site) — fixed by extracting the pure
  `buildPaymentModeStorePatch` function instead of testing through the hook, not by working around
  the crash. Full store vitest suite: 495 passed, the same 1 pre-existing unrelated failure.
  `npm run build:store` (tier-0) passed after every batch, not just once at the end.
- **Not verifiable this session, disclosed rather than glossed:** no end-to-end verification
  against a live PayMongo sandbox or a real tenant flipped to `downpayment_required` — unit/
  contract coverage only. `POST /api/v1/compliance/preflight` not executed against a live
  environment (same disclosure shape as every prior downpayment-epic declaration).

### Implementation Links

- PR #841: `apps/dgfy-web/apps/store/src/StorefrontApp.jsx`,
  `apps/dgfy-web/apps/store/src/checkout/guestCheckoutDraft.js`
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`,
  `apps/dgfy-api/src/modules/store/index.js` (catalog `payment_mode`, session/order serializer
  widenings)
- `apps/dgfy-web/apps/store/src/shared/model/storefrontDownpaymentPresentation.js`,
  `apps/dgfy-web/apps/store/src/shared/model/storefrontCheckoutPaymentOptions.js` (`hideCash`),
  `apps/dgfy-web/apps/store/src/shared/model/trackedTotals.js`,
  `apps/dgfy-web/apps/store/src/shared/model/checkoutRules.js` (`downpayment_zero_total`)
- `apps/dgfy-web/apps/store/src/shared/components/checkout/DownpaymentPaymentCallout.jsx` (new),
  `PaymentMethodSelectorBlock.jsx`, `StorefrontOnlinePaymentPanel.jsx`,
  `StorefrontCheckoutSummaryContainer.jsx`
- `apps/dgfy-web/apps/store/src/shared/hooks/useStoreCatalogLoader.js`,
  `apps/dgfy-web/apps/store/src/shared/hooks/useCheckoutSubmission.js`
- `apps/dgfy-web/apps/store/src/modes/simple/checkout/**`,
  `apps/dgfy-web/apps/store/src/modes/fnb/checkout/**` (summary rows, payment step, confirmation)
- `apps/dgfy-web/apps/store/src/modes/retail/checkout/pages/RetailOrderPage.jsx`,
  `apps/dgfy-web/apps/store/src/modes/retail/checkout/components/RetailOrderPaymentStep.jsx`,
  `apps/dgfy-web/apps/store/src/modes/retail/checkout/hooks/useRetailOrderPageProps.js` (Retail
  wiring)
- `apps/dgfy-web/apps/store/src/modes/{simple,retail,fnb}/tracking/model/*TrackingPayload.js`,
  `.../components/*ActiveView.jsx`, `.../components/*CompletedView.jsx` (balance-due tracking rows)
- `docs/api/specification.md`
  (`docs/compliance/impact-declarations/2026-08-22-downpayment-storefront-checkout-ui.md`, new)
- Issue #823 (this phase); #613 (prerequisite, PR #841); #626 gap 2 subsumed, gap 1 deferred

## Phase 143 - Downpayment Settings UI in the POS App

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #848, Phase 143 of the
  epic's phase sequence, continuing this ledger's numbering. Built in parallel to Phase 142 (#823) --
  cut from a fresh `origin/develop` worktree rather than #823's branch, sharing no files with it.
  Phase 142 merged into `develop` 2026-08-22 (PR #844), ahead of this phase's own merge.
- Release: single `develop`-targeted PR (`feature/848-downpayment-settings-ui`).

### Objective and Scope

- **#848's own premise was corrected during planning, before implementation.** The issue as filed
  said the POS app has no settings surface and needs "its own route, page shell, and nav entry
  point." That's wrong — `TerminalOperationsWorkspace.jsx`'s `SettingsWorkspace` already ships a
  full tab strip (Profile Setting / POS Setup / Storefront / Employees), reached from the terminal's
  existing Settings entry. POS also has essentially one React route; every settings/reports/items
  surface is a `?view=` view mode inside `TerminalPage`, not a `<Route>`. Corrected the issue body
  to match before opening the PR (surface: a new **Payments** tab in the existing tab strip, not a
  new route). The destination #848 asked for — the POS app, deliberately not the back-office app
  whose extract/freeze/deprecate future is unresolved per #358 — is unchanged; only the "from
  scratch" framing was wrong.
- New self-contained `DownpaymentSettingsPanel.jsx`, modelled directly on
  `AffiliatesWorkspacePanel.jsx` (the closest existing analogue: tenant-scoped settings, bps/centavos
  fields, its own permission gate, its own fetch/save cycle). Reads/writes the already-shipped Phase
  138 (#820) `GET`/`PUT /api/v1/downpayment/settings` — no backend change.
- Two-tier permission gate that genuinely splits: `downpayment:view` shows the tab, and
  `downpayment:settings` is required to save (`admin`/`is_master_admin` get both, `manager` is
  view-only, `staff`/`cashier` see nothing). A view-only user sees a disabled Save button with an
  amber explanatory note, following the `Pages/Settings.jsx` convention of disabling rather than
  hiding.
- New pure module `downpaymentSettingsForm.js` (no React, no I/O): wire-unit ↔ form-string mapping
  (`_bps`/`_centavos` on the wire, `_percentage`/`_pesos` on the form — naming convention from
  `tenantRevenuePolicyForm.js`), client-side validation mirroring the backend's own effective-row
  rules in `downpaymentSettingsUseCases.js` (type required, matching amount field required,
  `min_downpayment_centavos > 0` when mode is `downpayment_required`), and a live split preview
  mirroring `downpaymentPolicy.js`'s `resolveDownpaymentForTotal` math exactly (rounding, min floor,
  clamp to total) — pinned to that file the same way `affiliatePricingPolicy.js` pins itself to
  `affiliateCommissionAccrual.js`'s rounding.
- **`customer_choice` is deliberately never offered** in the mode selector — the backend 422s any
  write that resolves to it as the effective mode, and a tenant somehow stored in that state is
  bricked (every later PUT 422s regardless of payload, since the rejection keys on the *effective*
  mode). The UI cannot create that state.
- **Save always PUTs the full six-field set, never a single dirty field.** Not a style choice: the
  backend re-validates the whole merged (effective) row on every write, so flipping only
  `downpayment_refundable` on an incompletely-configured `downpayment_required` row 422s
  (`downpaymentSettingsUseCases.js`'s own "deliberate fail-closed choice"). Verified in the panel's
  behavior test.
- **Real INT-column bug defended against, not just documented.** The Joi validator on
  `downpaymentSettingsValidator.js` allows amount fields up to `999999999999`, but the migration's
  columns are `Sequelize.INTEGER` (MySQL `INT`, max `2147483647`) — a value between those bounds
  passes validation and then fails or truncates at the database. `MAX_SAFE_CENTAVOS` in
  `downpaymentSettingsForm.js` clamps both amount inputs client-side so this UI can never trigger
  that path. Unit-tested.
- **Standalone pre-existing defect fixed on the way, in scope because this PR is the first UI
  consumer of the permission group it affects:** `apps/dgfy-web/src/config/permissions_frontend.js`
  never mirrored the `DOWNPAYMENT` permission group Phase 138 (#820) added backend-side.
  `permissionsFrontendParity.test.js` has been red on `develop` since (confirmed: "frontend is
  missing group DOWNPAYMENT", 2 failed / 15 passed before this PR). Fixed by adding the group,
  verbatim-mirrored from `apps/dgfy-api/src/config/permissions.js` — test now 17/17. (The same fix
  landed independently on `develop` via PR #853's release batch before this PR's own merge into
  `develop`; this PR's copy of the fix is a byte-identical no-op, kept only for its comment,
  resolved during the post-#853 conflict merge.)
- Three-line addition inside `SettingsWorkspace` (`TerminalOperationsWorkspace.jsx`): an import, a
  `canViewDownpayment` permission derivation feeding a conditional `SETTINGS_TABS` entry, and a
  `renderPane` branch. No existing tab, permission derivation, or save path changed —
  `hydrateSettingsWorkspace` and the shared `handleSave` used by the other four tabs are untouched,
  since the new panel self-fetches and self-saves independently.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 138 (#820, the settings API this UI reads/writes). ADR 0070 (`accepted`) clause 6
  `[default]` authorizes downpayment for every workflow mode, so this UI needs no per-vertical gate;
  the Retail-only `422 WORKFLOW_MODE_NOT_RETAIL` gate Phase 139 removed from
  `downpaymentSettingsUseCases.js` is already gone on `develop`.
- Does not gate or depend on Phase 142 (#823) — different app (POS settings vs. storefront
  checkout), different files, cut from a separate `origin/develop` worktree. Both phases merged
  independently and required no coordination between their PRs.
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table — no migration, no
  compliance-declaration ambiguity (the `pos, terminal` surface floor was already clear), no
  `staging`/`main` base, no deploy dispatch, no force-push. Proceeded through commit/push/PR per the
  standing preference recorded in the Worker skip-checkpoint-confirmation memory.
- Board: #848 set `In progress` at branch time, `For Review` at PR-open time.

### Acceptance and Validation Evidence

- `apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsForm.test.js` (new, 18 tests) — unit
  mapping round-trips, all four effective-row validation rules, the INT clamp, and the split-preview
  math checked directly against `downpaymentPolicy.unit.test.js`'s own backend cases.
- `apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsPanel.behavior.test.jsx` (new, 6
  tests) — view-gate denial, load-and-hydrate against a seeded row, `full_payment` hides the amount
  fields, client-side save-block on an incomplete row (never calls the API), a valid save's exact
  six-field payload shape, and the manager view-only disabled state.
- `apps/dgfy-web/src/config/__tests__/permissionsFrontendParity.test.js` — 15/17 (red, pre-existing)
  → 17/17.
- Full `apps/dgfy-web` `src/features/pos/__tests__/` suite: 533 passed, 3 pre-existing failures in
  `receiptContractConformance.contract.test.js` confirmed identical on a clean `origin/develop`
  checkout (stashed this PR's diff, re-ran, same 3 failures) — unrelated to receipts/fiscal
  printing, not a regression.
- `npm run build:pos` — real Vite build (the only affected app), succeeded.
- `npm run lint` on every new/changed file — 0 problems (two `react/no-unescaped-entities` findings
  in the new panel fixed; one pre-existing unrelated finding elsewhere in
  `TerminalOperationsWorkspace.jsx`, at a line this PR does not touch, left as-is).
- `npm run check:compliance` — confirmed to require a declaration for the `pos, terminal` surface;
  `docs/compliance/impact-declarations/2026-08-22-downpayment-settings-pos-ui.md` added
  (`major`/`pos,terminal`).
- **Not verifiable this session, disclosed rather than glossed:** no live end-to-end verification
  against a deployed environment — unit/behavior coverage only. `POST /api/v1/compliance/preflight`
  not executed against a live environment (same disclosure shape as prior downpayment-epic
  declarations). The local Docker stack (`do-not-commit/local-test/`) has tenant *Pat Marketing*
  already seeded `downpayment_required` (20%, PHP 50.00 minimum) from an earlier session and is the
  intended manual verification target before this PR is marked ready for review.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/DownpaymentSettingsPanel.jsx` (new)
- `apps/dgfy-web/src/features/pos/services/downpaymentSettingsService.js` (new)
- `apps/dgfy-web/src/features/pos/utils/downpaymentSettingsForm.js` (new)
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx` (`SettingsWorkspace`:
  import, `canViewDownpayment`, `SETTINGS_TABS` entry, `renderPane` branch)
- `apps/dgfy-web/src/config/permissions_frontend.js` (`DOWNPAYMENT` group added)
- `apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsForm.test.js` (new),
  `apps/dgfy-web/src/features/pos/__tests__/downpaymentSettingsPanel.behavior.test.jsx` (new)
- `docs/compliance/impact-declarations/2026-08-22-downpayment-settings-pos-ui.md` (new)
- Issue #848 (this phase)

## Phase 144 - Accept/Reject, Refund, and Forfeiture for Downpayment Orders

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815 / #273). Issue #824, Phase 144 of
  the epic's phase sequence -- this number is #824's own long-standing reservation, recorded in the
  issue title and in the 2026-08-22 renumber note at the end of this file. Built after Phase 150
  (#865/#866) merged, so it is numerically out of order relative to when it was written; the
  reservation is preserved rather than renumbered, per rule 5.
- Release: single `develop`-targeted PR (`feature/824-downpayment-refund-and-forfeiture`).

### Objective and Scope

- **The defect this phase exists to close:** Phase 138 (#820) shipped a per-store
  `downpayment_refundable` toggle and Phase 141 (#822) snapshotted it onto every capture, with a
  code comment saying it was there "for Phase 144's refund-vs-forfeiture decision." **Nothing read
  it.** `commerceOrderLifecycleUseCase.js` treated `rejected` and `cancelled` identically and
  refunded unconditionally. The toggle was dead config, and two of epic #815's Definition-of-done
  lines were unmet.
- **A second, larger hole found during planning, not named in #824:**
  `buildCancelStoreOrderUseCase` -- the customer self-service cancel endpoint
  `PATCH /store/orders/:tracking_pin/cancel` -- flipped `fulfillment_status`, released the
  inventory reservation, and **never touched payments at all**. A customer who paid a downpayment
  online could self-cancel and the money was neither refunded, forfeited, nor recorded anywhere.
  #824's own scope assumed a customer-cancellation path with payment semantics; it did not exist.
  Wiring it is what makes the toggle reachable at all.
- **Origin-based forfeiture (Pat's call, 2026-08-22), resolving an ambiguity ADR 0069 clause 8 left
  open.** Clause 8 says *whether* a cancellation may forfeit but never defines what counts as a
  *customer* cancellation, and `cancelled` is reachable from two actors. Settled: a store-initiated
  terminal state -- `rejected`, or `cancelled` set by staff through POS -- **always refunds**,
  regardless of the toggle, because the store's inability to fulfil is not the customer's
  forfeiture. Only the storefront self-service cancel may forfeit. `initiatedBy` defaults to
  `'store'`, so a caller that omits it fails toward returning the money. Accepted limitation, stated
  rather than hidden: a customer who phones the store and has staff cancel is refunded; attributing
  that intent needs an explicit origin field on the POS payload and is not built.
- **The `#824` checkbox that was already true but unpinned:** reject refunds exactly the captured
  downpayment, never the order total. True by construction since Phase 141 redefined
  `session.total_amount_centavos` as the captured amount -- this phase adds the regression test that
  stops a future edit from silently refunding money that was never collected.
- New `tenantOrderPaymentLedgerRepository.js` writes the reversal half of the ledger
  (`kind: 'refund'` / `'forfeiture'`), which no code had ever written. Reaches the tenant database
  explicitly via `TenantConnector`/`getTenantModels` rather than `dbStore`, because the PayMongo
  webhook path is landlord-scoped with no tenant request context -- copying
  `updateTenantPaymentStatus`'s existing cross-database pattern rather than inventing a second one.
  Refund rows are written `pending` on submission and promoted when the refund webhook confirms,
  using the `status` enum `pos_order_payments` has carried unused since Phase 137.
- **POS visibility, added on Pat's call after planning surfaced it:** `amount_paid`/`balance_due`
  had **zero** references anywhere in `apps/dgfy-web`. The incoming-order card rendered
  `Payment: Cash on delivery` and `Payment Status: partially paid` and nothing else, so staff
  handing over goods could not see how much cash to collect. The card now shows the split, and the
  reject dialog names the real downpayment amount instead of asserting an unconditional "full
  refund". Both read data already on the wire -- no backend change.
- **No migration.** `pos_order_payments.kind` has been
  `ENUM('downpayment','balance','refund','forfeiture')` with `related_pos_order_payment_id` since
  Phase 137 (#819); `capture_kind`/`downpayment_refundable` on the session since Phase 141 (#822).
  This phase is the first reader and first writer of the reversal half.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 137 (#819, the ledger table), Phase 138 (#820, the toggle), and Phase 141 (#822,
  the capture and the policy snapshot this phase reads).
- **Two dated ADR amendments, both `[default]`/untagged, both in this PR** (AGENTS.md rule 4 /
  ADR 0039 -- no superseding ADR, no tech-lead approval):
  - **ADR 0052** clause 14 stated that rejecting or cancelling a paid order "submits one idempotent
    full-refund request to PayMongo" -- unconditional, and silent on a forfeiture that makes no
    provider call at all. Clause 14 is untagged (plain numbered list), so a dated amendment is the
    correct route. Amended to describe both outcomes explicitly.
  - **ADR 0070** carries the origin-based refinement of ADR 0069 clause 8. Recorded on 0070, not on
    0069, because 0069 is `status: superseded`/`authority_level: historical` and AGENTS.md forbids
    citing it for a new decision -- the same governance wrinkle Phase 141 flagged and handed to PM.
- **Architecture guardrail caught a real layering mistake mid-implementation.** The ledger module was
  first written to `commercePayments/services/`, which tripped `usecaseLayerLeak` on all three
  importing use cases (`LEGACY_SERVICE_IMPORT_PATTERN` matches any `/services` path). Resolved by
  moving it to `repositories/` -- where data access belongs -- rather than adding a brand-new file to
  the `usecaseLegacyServiceImports` allowlist, which would have introduced an exception with no
  removal plan (AGENTS.md's own validation rule).
- **A real module cycle was found and worked around, not ignored.**
  `commercePayments/usecases/finalizePaidCommerceSession.js` statically imports `store/index.js`, so
  a top-level import in the other direction would leave one side observing `undefined` at
  module-evaluation time. `store/index.js` resolves the lifecycle use case with a call-time dynamic
  import, the pattern already used for cross-module cycles in `settings/` and `compliance/`.
  (`pos/index.js` can import it statically because POS is not part of that cycle.)
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table -- no migration, no
  compliance-declaration ambiguity (the `payments` + `pos, terminal` floors were unambiguous), no
  `staging`/`main` base, no deploy dispatch, no force-push.
- Board: #824 set `In progress` at branch time, `For Review` at PR-open time.

### Acceptance and Validation Evidence

- `apps/dgfy-api/tests/commerceOrderLifecycle.usecase.test.js` -- 11 passed (was 3). Includes the
  #815 Definition-of-done pin (a session with `total_amount_centavos: 20000` against
  `order_total_centavos: 100000` refunds exactly `20000`, asserted explicitly *not* `100000`),
  store-reject refunding a non-refundable downpayment anyway, POS-cancel doing the same via the
  `'store'` default, customer-cancel forfeiting with zero provider calls, customer-cancel refunding
  when refundable, a **null** snapshot refunding rather than forfeiting, a full-payment session
  being unaffected by the new parameter, and the pre-existing succeeded-refund idempotency
  short-circuit still winning over the forfeiture branch.
- `apps/dgfy-api/tests/tenantOrderPaymentLedgerRepository.unit.test.js` -- 16 passed (new): the
  `capture_kind` gate, the `related_pos_order_payment_id` back-link (and still recording when the
  original row is missing), deterministic non-colliding idempotency keys, the already-recorded
  short-circuit instead of a UNIQUE-index throw, `confirmed_at` null for a pending row,
  centavos-to-peso conversion, and both never-throw failure paths.
- `apps/dgfy-api/tests/storeCancelDownpaymentLifecycle.unit.test.js` -- 6 passed (new): customer
  origin attribution for logged-in and guest cancels (the guest case signs a real `cancel_proof`
  with `generateStoreCancelProof` rather than asserting conditionally), post-commit ordering, and
  survival of both a returned failure and a thrown error.
- `apps/dgfy-api/tests/commercePaymentRefunds.usecases.test.js` -- 8 passed (was 4): pending and
  failed tenant ledger rows on submission, webhook promotion to `successful`, and the webhook still
  acknowledging when the tenant ledger update fails.
- **Backend regression sweep** (`tests/store tests/commerce tests/pos tests/downpayment`): 950
  passed / 29 failed, against a baseline of 932 passed / 29 failed measured by running the identical
  command with this PR's diff `git stash`ed. **Identical failure count, +18 passing** -- the 29 are
  DB-backed integration suites with no local database, plus the known
  `DIRECT_PAYMENT_NOT_READY`/`DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE` drift Phase 150 already
  documented.
- `apps/dgfy-web/src/features/pos/__tests__/terminalDownpaymentVisibility.behavior.test.jsx` -- 6
  passed (new). Full POS suite: 114 files, 581 tests, all passing, including
  `terminalViewModeContracts.test.js`, which string-matches source text from the exact component
  this phase edits.
- Storefront change is **comment-only** (a stale `Phase 143 (#824)` label corrected to `Phase 144`,
  plus a restated #280 block), verified by diffing out every comment line;
  `storefrontDownpaymentPresentation.test.js` 19 passed.
- `npm run build:pos` -- real Vite build, succeeded. `npx eslint` on every new/changed file -- 0
  errors (one pre-existing `max-lines` warning on `TerminalPage.jsx`, at a line this phase does not
  touch). `npm run check:architecture` -- OK, 50 modules / 508 files, no allowlist exception added.
  `npm run check:compliance` -- confirmed to **fail** first with 9 sensitive files, then pass.
  `npm run lint:docs` -- OK, 28 governed docs + 77 ADRs.
- **Not verifiable this session, disclosed rather than glossed:** no live PayMongo sandbox refund end
  to end, and no live exercise of the forfeiture path against a `downpayment_refundable = false`
  tenant -- unit/behavioral coverage only. This is the most consequential gap in this phase
  specifically, because forfeiture is the one path whose failure mode is *keeping a customer's money
  that should have been returned*. `POST /api/v1/compliance/preflight` also not executed against a
  live environment (same disclosure shape as #822/#848/#865/#866).

### Implementation Links

- `apps/dgfy-api/src/modules/commercePayments/repositories/tenantOrderPaymentLedgerRepository.js` (new)
- `apps/dgfy-api/src/modules/commercePayments/usecases/commerceOrderLifecycleUseCase.js`
  (`initiatedBy`, the forfeiture branch),
  `apps/dgfy-api/src/modules/commercePayments/usecases/commercePaymentAdminUseCases.js` (refund
  ledger mirroring),
  `apps/dgfy-api/src/modules/commercePayments/usecases/handlePayMongoCommerceWebhookUseCase.js`
  (webhook promotion)
- `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js` (`buildCancelStoreOrderUseCase`
  post-commit lifecycle), `apps/dgfy-api/src/modules/store/index.js` (cycle-safe lazy wiring)
- `apps/dgfy-web/src/features/pos/components/TerminalOperationsPanels.jsx` (card split, reject
  dialog copy), `apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx` (`forfeited` toast)
- `apps/dgfy-web/apps/store/src/shared/model/storefrontDownpaymentPresentation.js` (comment only)
- `docs/architecture/adr/0052-tenant-revenue-collection-ledger-and-settlement.md` (amended),
  `docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md` (amended)
- `docs/api/specification.md` (`PATCH /pos/orders/:id/status` payment side effects -- previously
  undocumented; `PATCH /store/orders/:tracking_pin/cancel` -- previously unspecified entirely;
  `partially_paid` added to the POS `payment_status` vocabulary it had been missing from)
- `docs/compliance/impact-declarations/2026-08-22-downpayment-refund-and-forfeiture.md` (new)
- Issue #824 (this phase)

## Phase 145 - MSME POS Online Order Queue Visibility

### Initiative and Release

- Initiative: MSME online-order operations visibility.
- Release: POS workflow presentation and Store Profile correction.

### Objective and Scope

- Allow MSME POS tenants with effective `pos` and `storefront` capabilities to
  see and load the shared Incoming Online Queue.
- Repair stale persisted Store Profiles that still contain the historical
  `show_online_queue: false` default.
- Preserve Services isolation and all existing POS permission, active-shift,
  location-scope, connectivity, API, order, payment, and inventory behavior.

### Status

- `completed`
- User approval received on 2026-08-22.
- Completed on 2026-08-22.

### Dependencies and Governance Note

- [ADR 0008](../architecture/adr/0008-tenant-workflow-mode-msme-simplification.md),
  amended 2026-08-22.
- [ADR 0017](../architecture/adr/0017-customer-access-modes-and-inventory-display.md)
  for the customer-facing Online Ordering Mode boundary.
- [ADR 0029](../architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md)
  for Storefront/POS ownership boundaries.
- [ADR 0070](../architecture/adr/0070-downpayment-authorization-across-workflow-modes.md)
  for the shared Storefront checkout path serving MSME.
- Phase 79 Services navigation and online-queue isolation.
- Phase 143 is the downpayment admin configuration UI (#848) and Phase 144 is
  downpayment accept/reject/refund (#824) — both part of the downpayment epic (#815),
  not the PWA canary roadmap this note originally (and incorrectly) named. This
  initiative uses Phase 145 because it was the next number free of any prior
  reservation at the time it was authored; the downpayment epic's own Phase
  145 slot (balance settlement, #825) was moved to Phase 148 on 2026-08-22 to
  avoid colliding with this already-completed phase — see the dated note at
  the end of this file. The PWA canary roadmap (`docs/features/PWA-Phases.md`)
  remains unregistered in this ledger entirely; tracked separately, not by a
  phase-number reservation here.
- Classification: `within-existing-boundary` with an amendment to ADR 0008's
  untagged/default MSME presentation rule. No new ADR, migration, API route,
  permission, or exception allowlist is required.

### Acceptance and Validation Evidence

- [x] MSME profile defaults `show_online_queue` to `true`.
- [x] Stale persisted MSME profiles rebuild to the current profile before POS
  navigation and polling consume the profile.
- [x] MSME queue visibility and Services isolation regression tests pass.
- [x] Local authenticated Playwright verification passes: `Tindahan Ko`
  (`workflow_mode=msme`) renders `Orders (0)`, while `Laundry`
  (`workflow_mode=services`) does not render Orders; both sessions had no page
  errors, console errors, or HTTP 5xx responses.
- [x] Store Profile equivalence and MSME golden snapshot tests pass.
- [x] Architecture checks pass before final validation.
- [x] No tenant data, order, payment, inventory, shift, or database record was
  created, modified, migrated, or deleted.

### Implementation Links

- `packages/shared-constants/src/posDefaultsAndTerminology.js`
- `apps/dgfy-web/src/features/settings/WorkflowModeContext.jsx`
- `apps/dgfy-web/src/features/settings/__tests__/WorkflowModeContext.profile.test.jsx`
- `apps/dgfy-web/src/features/pos/utils/__tests__/posOperationalVisibility.test.js`
- `apps/dgfy-api/tests/storeProfile.equivalence.contract.test.js`
- `apps/dgfy-api/tests/__snapshots__/storeProfile.equivalence.contract.test.js.snap`
- `docs/architecture/adr/0008-tenant-workflow-mode-msme-simplification.md`

## Phase 146 - POS Maintainability Closure

### Initiative and Release

- Initiative: POS terminal presentation maintainability cleanup, bundled into PR #853's release
  batch (originating PR #845, superseded — see Phase 147 below).
- Release: `develop`, via PR #853 (merged `d02dc70a6`, 2026-08-22).

### Objective and Scope

- Remove dead terminal queue presentation state (`queuedTerminalOperations`, `queueStatusFilter`,
  `setQueueStatusFilter`) from `TerminalOperationsWorkspace.jsx` — queue replay/summary services are
  the actual source of truth, per the declaration's precondition 3.
- Replace a synchronous UI-only payment auto-fill update with a derived value.
- Split the terminal presentation chunk out of the POS route bundle to stay under the
  frontend-budgets chunk-size limit.
- No change to authorization rules, payment methods, fiscal calculations, database schemas, or
  transaction persistence (declaration's own classification: `major` on the `pos,terminal` surface
  floor, not on content — this is presentation-layer only).

### Status

- `completed`

### Dependencies and Governance Note

- Backfilled into this ledger 2026-08-22 (#848 session) — the compliance impact declaration below
  shipped via PR #853 with no corresponding ledger entry, a rule-7 gap ("every ledger entry must
  include...") discovered while resolving the #853/#578-precedent phase-number collision. Not
  authored by this session's own work; recorded here for the first time from existing evidence.
- This phase number (146) was one of the two #853 grabbed without checking the downpayment epic's
  prior reservation (#815/#848); unlike #853's own Phase 142/145 claims (moved to Phase 147/148
  below), Phase 146 for *this* content is kept as-is because #827 (the downpayment epic's original
  Phase 146 claimant, "Hardening + documentation closure") had not shipped anything under that
  number yet — #827 moves to Phase 149 instead. See the dated note at the end of this file.

### Acceptance and Validation Evidence

- `npm run lint:docs` — PASS.
- `npm run check:architecture` — PASS.
- POS tests — PASS (148 files, 721 tests).
- Changed-file POS lint — PASS with zero errors.
- `npm run build:pos` — PASS.
- `npm run check:frontend-budgets` — PASS after lazy-loading the terminal presentation boundary;
  POS route chunk 133.43 KB against the 190 KB limit.

### Implementation Links

- `apps/dgfy-web/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `apps/dgfy-web/src/features/pos/components/POSCheckoutTerminal.jsx`
- `apps/dgfy-web/src/features/pos/__tests__/posCheckoutTerminalShell.contract.test.js`
- `docs/compliance/impact-declarations/2026-08-21-pos-maintainability-phase-146.md`
- Commits `835440c0e`/`c99961d0c` ("remove dead terminal queue state"),
  `15bee98da`/`1d7238635` ("split terminal presentation chunk")

## Phase 147 - PR #853 POS Release Batch Rebuild (supersedes #845)

### Initiative and Release

- Initiative: POS release-batch reconciliation and release-readiness closure.
- Release: `develop`, via PR #853 (merged `d02dc70a6`, 2026-08-22) — the clean replacement for the
  earlier draft PR #845, which is superseded and stays unmerged.

### Objective and Scope

- Rebuild from the current `develop` head, then reapply only the intended POS, storefront,
  inventory-reservation, payment, PWA, and audit changes from the prior PR branch.
- Preserve newer `develop` checkout, voucher, payment, schema-registry, and phase-ledger contracts
  when cherry-pick conflicts occur.
- Keep React Router security work and compliance-script enforcement in separate follow-up PRs
  (tracked as draft PRs #854/#855).

### Status

- `completed`
- Renumbered from Phase 142 to Phase 147 on 2026-08-22 (#848 session) — Phase 142 was already the
  downpayment epic's reservation for #823 (storefront checkout UI, PR #844) per #849's 2026-08-22
  renumber, which predates this phase's own PR by hours; #853's branch did not contain that renumber
  when authored. See the dated note at the end of this file for the full resolution and the #578
  precedent applied.

### Dependencies and Governance Note

- Depended on the `develop` head at authoring time and the PR conventions in `docs/ai/PR.md`.
- Required fresh-schema and upgrade migration checks, architecture/compliance/docs gates, and
  targeted POS/storefront payment and inventory tests before completion — all passed per PR #853's
  own Testing Evidence section.
- Three findings from this phase's reconciliation were later confirmed as unintended reverts, not
  intentional scope (`resolveTrackedTotals`/#747, services local-simulation dead-wiring, and a
  mixed-cart `checkoutPayload` argument-shape regression) — tracked and restored separately under
  #857, not part of this phase's own acceptance evidence below.

### Acceptance and Validation Evidence

- Reconciliation base: `0e2d329f483c8bf7b94a9941f80fb9c690eef379`.
- Old PR state preserved in local branch `backup/pr-845-before-rebuild`.
- Focused inventory/RBAC tests: 6 suites, 41 tests passing; tenant migration and registry contracts
  pass; architecture/compliance/docs hooks passed on the final commits.
- Merged as PR #853, `mergeStateStatus: CLEAN`, `d23a65c9`-lineage build checks green.

### Implementation Links

- `apps/dgfy-api/scripts/sync-tenant-schemas.js`
- `apps/dgfy-api/src/modules/inventory/services/inventoryReservationService.js`
- `apps/dgfy-api/src/modules/shared/utils/onlineInventoryEffects.js`
- `apps/dgfy-migration-runner/migrations/20260822000001-create-inventory-reservations.cjs`
- Issue #843 and PR #853 (replacement for draft PR #845)

---

**Dated note, 2026-08-22 (#848 session) — Phase-number collision between PR #853 and the
downpayment epic (#815), resolved per the #578 precedent ("the prior reservation wins; the side
that grabbed a number without checking renumbers"):**

PR #853's branch was cut before #849 (2026-08-22) renumbered the downpayment epic's Phase
143/144→144/145 to keep #848 at 143, and #853's branch never merged that renumber before landing its
own `## Phase 142` and `## Phase 145` ledger entries — confirmed: `62cd75c0b` (#849's merge) is not
an ancestor of `f22fd51fb` (#853's own merge of `develop`). Resolution, decided by Pat 2026-08-22:

| Phase | Owner | Disposition |
|---:|---|---|
| 142 | #823 storefront checkout UI (PR #844) | unchanged — prior reservation |
| 143 | #848 POS settings UI (PR #859) | unchanged — prior reservation |
| 144 | #824 accept/reject/refund | unchanged — prior reservation |
| 145 | MSME POS Online Order Queue Visibility | unchanged — already `completed`, no prior reservation existed for 145 at authoring time (only 143/144 were reserved) |
| 146 | POS Maintainability Closure | unchanged — backfilled above; #827's Phase 146 claim moves instead, since #827 has not shipped |
| 147 | PR #853 POS release batch rebuild | **moved from 142** |
| 148 | #825 balance settlement | **moved from 145** |
| 149 | #827 hardening + documentation closure | **moved from 146** |

No code changes accompany this renumber — PR #844 and PR #859 both keep their existing phase
numbers unchanged, so none of their in-code `Phase 142`/`Phase 143` comments needed edits.

**Addendum, 2026-08-22 (#826/Phase 151 planning session) — the above table's own "no prior
reservation existed for 145" claim was itself incomplete.** #826's issue title read
*"Phase 145: Customer-facing surfaces"* at authoring time, predating the collision resolved above,
and was never checked against it — the same class of miss the table itself exists to fix, one level
up. Caught while planning #826's implementation, not by a second collision landing in code (#826 had
shipped no PR yet). Resolution, decided by Pat 2026-08-22, same #578 precedent: **#826 → Phase 151**,
extending the table above:

| Phase | Owner | Disposition |
|---:|---|---|
| 151 | #826 customer-facing downpayment surfaces | **moved from 145** (own row, this addendum — not part of the #853 collision the table above resolves) |

150 was the ledger's highest entry at authoring time; 148/149 remain reserved (not yet implemented)
by #825/#827 per the table above, so 151 is the next free number. #827 keeps 149 rather than moving
again — its number now reads before the phase it closes (149 before 151), which is cosmetic
(sequence position is not itself a governed property) and cheaper than a third renumber of an
unshipped reservation.

---

## Phase 148 - Balance Settlement at Delivery/Pickup (Staff-Recorded)

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815 / #273). Issue #825.
- Release: `develop`, via PR (branch `feature/825-downpayment-balance-settlement`).
- Phase number 148 is the slot this issue was already reserved under by the 2026-08-22 renumber note
  above (#825 moved from its original "Phase 145" title under the #578 precedent). No new collision
  and nothing to reconcile — AGENTS.md's Continuous Phase Numbering rule 10 satisfied by using the
  existing reservation rather than appending a new highest number.

### Objective and Scope

- Close the middle of the downpayment flow. Phase 141 (#822) captures a downpayment online and
  leaves the order `partially_paid`; Phase 144 (#824) shows POS staff how much is still owed;
  Phase 151 (#826) shows the customer the same split. Nothing could *record* the balance actually
  being paid, so such an order could never reach `paid` and never complete.
- New use case + endpoint `POST /pos/orders/:id/record-payment`, extending — never loosening — the
  existing Collect Cash flow. `collect-cash` keeps both of its guards (`payment_status === 'unpaid'`,
  `cash_received >= total_amount`) untouched; the two endpoints' domains are disjoint by
  construction (`unpaid` vs. `partially_paid`).
- Settlement methods are ADR 0063 clause 4 `[binding]`'s merchant-owned V1 set — `cash`, `gcash`,
  `maya`, `card` (a store-owned terminal, never PayMongo card), `bank_transfer`. This **widens
  #825's own written scope**, which named only "cash + manually-recorded gcash"; decided by Pat
  2026-08-23 on the grounds that clauses 5 and 6 already govern all four digital methods
  identically, so nothing per-method had to be invented. Issue body updated to record the change.
- Writes `amount_paid`/`balance_due`, flips to `paid` at zero balance, and writes ledger row 2
  (`pos_order_payments.kind = 'balance'`) in the same transaction, linked to the Phase 141
  `downpayment` row via `related_pos_order_payment_id`.
- Both completion paths become balance-aware: `assertDeliveryCompletionReadiness` and the pickup
  branch of `buildUpdateOnlineOrderStatusUseCase` now require a zero balance, not merely
  `payment_status === 'paid'`.
- Terminal UI: a separate `Settle Balance` button and dialog beside the untouched Collect Cash pair,
  with the explicit merchant-owned confirmation ADR 0063 clause 6 requires.
- v1 settles the full remaining balance in one action; the ledger supports N rows, so instalments
  stay a later UI concern.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 137 (#819, the `partially_paid` vocabulary, `amount_paid`/`balance_due` columns,
  and the `pos_order_payments` table including its `'balance'` enum value) and Phase 141 (#822, the
  capture that produces a partially-paid order and writes ledger row 1). Both `completed`.
- **No ADR change.** Every decision was already written: ADR 0069 clause 2 `[binding]` (balance is
  staff-recorded, never a second automatic charge, and must carry its own single-use confirmation
  guard) and clause 4b `[default]` (ledger row shape), both carried forward verbatim by ADR 0070
  (`authoritative`) and cited through it; ADR 0063 clauses 4, 5, 6, and 12 `[binding]` (method set,
  what an attestation must persist and must never claim, explicit confirmation failing closed, and
  no PayMongo involvement). Classification: `within-existing-boundary`.
- **ADR 0069 clause 9 `[default]` — VAT/BIR/fiscal treatment of a balance-settlement event remains
  deferred.** Stated, not invented. A settlement produces no fiscal event.
- **ADR 0069 clause 10 `[default]` — platform fee unchanged**, still computed on the captured
  downpayment only; #817 tracks whether the balance leg should generate one separately.
- **Compliance impact declaration required and filed**:
  `docs/compliance/impact-declarations/2026-08-23-downpayment-balance-settlement.md`,
  classification `major`, surfaces `pos,terminal,payments`. The gate was confirmed to fail first
  with eleven sensitive files listed, then pass.
- **No migration.** First writer of an enum value and columns that have existed since Phase 137.

### Acceptance and Validation Evidence

- `apps/dgfy-api/tests/posOrderBalanceSettlement.usecase.test.js` (new) — cash settlement with
  change computed off `balance_due`; all four merchant-owned methods at exact amount; fail-closed
  without `manual_payment_received`; duplicate submit writes exactly one ledger row (#825's own
  verification condition); the ledger records the balance settled and never the cash tendered;
  `payment_provider` is `merchant_owned` and never `paymongo`; `unpaid` and `paid` orders rejected.
- `apps/dgfy-api/tests/posOnlineOrderCompletionBalanceGate.usecase.test.js` (new) — completion
  blocked at a nonzero balance on both paths with distinct reason codes; allowed at zero for both a
  cash and a merchant-owned settlement; **a plain COD delivery with `amount_paid: 0` still requires
  the original cash evidence** (the discriminator pin).
- `apps/dgfy-web/src/features/pos/__tests__/terminalBalanceSettlement.behavior.test.jsx` (new) —
  button mutual-exclusivity with Collect Cash, dialog based on `balance_due` not `total_amount`,
  fail-closed submit for merchant-owned methods, and the store-attested-not-DGFY-verified copy.
- Regression: `posPickupCashCollection`, `posDeliveryCashCollection`, and
  `posDeliveryCompletionGuard` pass unchanged — the evidence that the live COD path was not
  loosened. Full `apps/dgfy-web` POS suite green.
- `npm run build:pos` (real Vite build), `node --check` on every changed backend file,
  `npm run check:compliance` (failing then passing), `npm run check:architecture`,
  `npm run lint:docs`.

### Implementation Links

- Issue: #825. Epic: #815 / #273.
- ADRs: `docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md`
  (authoritative carrier for ADR 0069 clauses 2 and 4b),
  `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`
  (clauses 4, 5, 6, 12).
- Compliance: `docs/compliance/impact-declarations/2026-08-23-downpayment-balance-settlement.md`.
- Backend: `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`,
  `apps/dgfy-api/src/modules/pos/repositories/posRepository.js`,
  `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`,
  `apps/dgfy-api/src/modules/pos/index.js`, `apps/dgfy-api/src/controllers/posController.js`,
  `apps/dgfy-api/src/routes/pos.js`, `apps/dgfy-api/src/validators/posValidator.js`.
- Frontend: `apps/dgfy-web/src/features/pos/components/BalanceSettlementDialog.jsx` (new),
  `TerminalOperationsPanels.jsx`, `TerminalPageDialogLayer.jsx`, `pages/TerminalPage.jsx`,
  `services/posService.js`.
- Next eligible phase: **149** (#827, hardening + documentation closure — the epic's final phase,
  which depends on this one).

---

## Phase 149 - Hardening + Documentation Closure

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815 / #273). Issue #827. Final phase of
  the epic -- depends on all prior phases (136-144, 147, 148, 150, 151; 145-146 are unrelated
  already-completed POS work per the renumber note above).
- Release: `develop`, via PR (branch `feature/827-downpayment-hardening-closure`), cut from fresh
  `origin/develop` at `178255e95` (Phase 148's merge commit).
- Audit + documentation phase, not new feature code -- per
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract, required
  before any cross-boundary payment/checkout workflow is considered done.

### Objective and Scope

- **#827's own body was re-verified fresh, not trusted as written.** Its ledger-backfill checkbox
  (asking for entries for Phases 136-144/147-148) was already satisfied before this phase started --
  every one of those entries already existed, in detail, with governance notes and acceptance
  evidence. Not redone; stated as already-satisfied in the PR instead of silently reproduced.
- New governed feature doc `docs/features/DOWNPAYMENT.md` -- the one real documentation-closure gap
  (hardening item 10), since none existed. Summarizes the flow, the three payment modes and how
  `customer_choice` collapses to the other two (Phase 150), the ledger row shape, the full 10-item
  hardening-contract verdict table, residual risks, and references -- linking to each phase's own
  ledger entry rather than restating it.
- **#668 (QRPh voucher-redemption race), named in #827's own body as a residual risk, was found
  already closed** (2026-08-20, `COMPLETED`) during this phase's fresh verification -- not silently
  copied from the issue's stale framing. The race is accepted-as-is (not eliminated; reserving
  earlier was considered and rejected for lack of a session-expiry release mechanism) and made
  reconcilable via a `VOUCHER_REDEMPTION_UNAVAILABLE` finalization tag routed to the existing
  `paid_manual_resolution_required` operator queue. `DOWNPAYMENT.md` documents the corrected status.
- Two genuinely still-open residual risks carried into the new doc: the fiscal/BIR deferral (ADR
  0069 clause 9 `[default]`, carried by ADR 0070) and the platform-fee-on-balance-leg question
  (#817, open).
- Hardening items 7 (frontend negative proof) and 8 (rendered UI proof) were the two items with no
  recorded evidence anywhere in the epic. Item 7 was found already covered by an existing test
  (`terminalBalanceSettlement.behavior.test.jsx`'s first two cases, Phase 148) on closer reading --
  no new test needed, cited instead of duplicated. Item 8 was closed by a live walkthrough this
  phase (see Acceptance and Validation Evidence).
- **STAGING is not currently reachable for #827's literal "Verify -- end to end, on STAGING" ask.**
  `origin/staging` (`6a06a1e6`, 2026-08-20) is behind `develop` and does not yet carry Phases 148,
  150, or 151. Substituted the local-test Docker stack (`do-not-commit/local-test/`), rebuilt from
  this branch (== current `develop`), with the substitution disclosed rather than silently
  presented as a staging pass. A real staging E2E should be re-run on the next `develop -> staging`
  promotion.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on every prior downpayment phase (136-144, 147, 148, 150, 151), all `completed`.
- **No ADR change.** Nothing here revisits a Decision clause -- evidentiary closure of decisions
  already made. Classification: `within-existing-boundary`.
- **No compliance impact declaration.** Confirmed via `npm run check:compliance` ("No
  compliance-sensitive changes detected") -- this phase touches only `docs/features/`, not
  `apps/dgfy-api/src/modules/pos/`, `apps/dgfy-api/src/routes/pos.js`, or
  `apps/dgfy-web/src/features/pos/`.
- **No migration.** No schema or code change of any kind.

### Acceptance and Validation Evidence

- `npm run lint:docs` -- OK (28 governed docs validated, including the new `DOWNPAYMENT.md`).
- `npm run check:adr --strict` -- OK (77 ADRs validated).
- `npm run check:compliance` -- confirmed no sensitive-path match, as expected for a docs-only diff.
- Live walkthrough against the local-test Docker stack (`docker context ch`,
  `dgfy-pos.nicenature.space` / `dgfy-store.nicenature.space`), rebuilt (`--no-cache`) from this
  branch (== `develop` @ `178255e95` plus this phase's docs-only diff) -- **PASS**. Full detail in
  `DOWNPAYMENT.md` section 5; summary: a downpayment order (PHP 1200 total, PHP 1000 fixed
  downpayment) captured via a properly HMAC-signed simulated `payment.paid` webhook (not an
  unsigned bypass -- this stack runs `NODE_ENV=production`, which correctly refuses one), accepted,
  progressed to Out for Delivery, settled its PHP 212.00 balance in cash with the Settle Balance
  dialog (Collect Cash never rendered alongside it -- item 7's negative proof, live), and completed
  only once `balance_due` reached zero. Final state: two `pos_order_payments` rows, correctly
  linked and amounted. A second order was rejected instead, confirming the refund request scoped to
  exactly the PHP 1000.00 downpayment, never the untouched PHP 212.00 balance -- the automatic
  refund itself fell to manual review only because the simulated payment id has no real
  PayMongo-side counterpart, the designed fallback firing correctly. No console errors surfaced.
  Desktop-viewport coverage only -- a mobile-viewport pass was attempted but the browser resize
  didn't take effect in this environment; disclosed as an open gap rather than claimed.
- **#668, cited in #827's own body as a residual risk, was found already closed** (2026-08-20,
  `COMPLETED`) on fresh verification -- see Objective and Scope above and `DOWNPAYMENT.md` section
  6 for the corrected status.

### Implementation Links

- Issue: #827. Epic: #815 / #273.
- Docs: `docs/features/DOWNPAYMENT.md` (new).
- ADRs referenced (none amended): `docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md`,
  `docs/architecture/adr/0063-pos-split-tender-and-manual-walk-in-payment-recording.md`,
  `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (the #668 amendment, cited for the residual-risk correction).
- This is the epic's terminating phase -- no next eligible phase.

---

## Phase 150 - Downpayment Settings Clarity + The `customer_choice` Payment Mode

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issues #865 and #866, filed
  2026-08-22 from hands-on feedback on the Phase 143 (#848) POS Payments tab. Highest existing entry
  in this ledger at authoring time was 147; 148/149 are reserved (not yet implemented) by the #853
  renumber note immediately above, so 150 is the next free number.
- Release: single `develop`-targeted PR, cut from `origin/feature/848-downpayment-settings-ui`
  (PR #859's own branch, still open/unmerged at authoring time) rather than fresh `origin/develop`
  -- both new files this phase extends (`DownpaymentSettingsPanel.jsx`,
  `downpaymentSettingsForm.js`) exist only on that branch, not yet on `develop`. This PR's diff
  against `develop` will therefore shrink to its own true scope automatically once #859 merges and
  this PR's base is retargeted -- a deliberate, disclosed consequence of stacking, not an error.

### Objective and Scope

- **#865 — settings-form clarity.** The Minimum downpayment field was required in `fixed` type mode
  yet could only be a no-op or a silent override of the fixed amount the merchant just typed (both
  are constants, so the effective downpayment collapses to `max(fixed, min)` permanently). Resolved
  by scoping the requirement to `percentage` type only, both server-side
  (`downpaymentSettingsUseCases.js`'s effective-row validation) and client-side
  (`downpaymentSettingsForm.js`'s `validateDownpaymentForm`/`formToPayload`, which now zeroes the
  field for any non-percentage type rather than resubmitting a stale value). The panel hides the
  field entirely outside `percentage` mode and adds helper text to all three amount fields
  (Percentage, Fixed, Minimum) -- previously only Minimum had any.
- **#866 — build the reserved `customer_choice` payment mode.** Reserved since Phase 138 (#820,
  "Schema `customer_choice` now; server rejects it as unsupported in v1") and carried forward as an
  explicit deferral by ADR 0069 and ADR 0070's Consequences. Lifted via a dated `## Amendments`
  block on ADR 0070 (this PR, `[default]` tier per ADR 0039 -- the amended clause is an untagged
  Consequences item, not a `[binding]` Decision clause). A `customer_choice`-configured store now
  presents the customer, at checkout, with exactly two options: pay the full total online, or pay a
  downpayment online with the balance settled on delivery/pickup (COD) -- mirroring the fact,
  confirmed in code (`storeUseCases.js`), that a downpayment capture already forces the order's
  `payment_type` to `'cash'` (COD for the balance). Plain COD with no downpayment remains
  expressible as `full_payment` + a cash capability; `customer_choice` does not add a third option.
- **Key simplification: no new order semantics.** `resolveDownpaymentForTotal`
  (`downpaymentPolicy.js`) still returns only `full_payment` or `downpayment_required` -- never
  `customer_choice` itself. The customer's checkout-time election (`payment_election`, a new
  `'full'` | `'downpayment'` request field, default `'full'` -- under-collecting is the safer
  failure direction) collapses `customer_choice`'s settings-level value into whichever of the two
  existing shapes applies. Every downstream consumer (`capture_kind`, the order-placement gate,
  `serializePaymentSession`, `storefrontDownpaymentPresentation.js`'s `resolveDownpaymentDisplay`)
  needed **zero** changes, since all of them key off the *resolved* shape, which was already
  correct.
- **Storefront wiring, not just settings.** `payment_election` threads from a new pure model
  (`storefrontPaymentElection.js`) through `StorefrontApp.jsx`'s state (self-healing back to
  `'full'` the instant a store stops being `customer_choice`), the shared checkout-payload builder
  (`buildFnbCheckoutPayload.js`, used by all three modes' quote and real-checkout paths alike), and
  a new presentational control (`PaymentElectionSelector.jsx`) rendered only at a `customer_choice`
  store, in each of the three checkout page containers (Retail/F&B/Simple). An election change
  invalidates the quote via the same master effect that already reacts to cart/order-method/promo
  changes -- getting this wrong would show a stale split against the new election.
- Extended (not just widened) two existing guards to be election-aware rather than merely
  mode-aware: the `downpayment_zero_total` checkout-block reason (`checkoutRules.js`) and the
  `DOWNPAYMENT_POLICY_UNRESOLVED` fail-closed guard (`storeUseCases.js`) both now key on "did the
  customer actually elect a downpayment," not just "is this store `customer_choice`" -- an election
  of `'full'` at a `customer_choice` store must never trip either guard, since the quote correctly
  resolving to `full_payment` there is by design, not a malformed-row symptom.

### Status

- `completed`

### Dependencies and Governance Note

- Depends on Phase 138 (#820, the settings API) and Phase 143 (#848/PR #859, the POS settings panel
  this phase extends in place rather than duplicating).
- ADR 0070 amended (dated `## Amendments` block, `status: amended`) rather than superseded --
  `[default]` tier per ADR 0039, since the lifted clause is an untagged Consequences item.
- Compliance declaration: `docs/compliance/impact-declarations/
  2026-08-22-downpayment-choice-and-settings-clarity.md` (`major`, `pos,terminal,payments`).
  Storefront checkout code (`apps/dgfy-web/apps/store/`) is touched but is not a recognized
  compliance surface in `check-compliance-impact.js`'s current rule set -- named in the declaration
  for visibility, not silently omitted.
- No checkpoint triggers from `.agents/skills/implement/SKILL.md`'s table -- no migration
  (`customer_choice` was already a schema-authorized ENUM value), no compliance-declaration
  ambiguity, no `staging`/`main` base, no deploy dispatch, no force-push.
- Board: #865/#866 set `In progress` at branch time, `For Review` at PR-open time.

### Acceptance and Validation Evidence

- Backend: `downpaymentPolicy.unit.test.js` (21 passed, new `customer_choice` election matrix --
  splits/doesn't-split, defaults to `'full'` when absent or garbage, never returns
  `payment_mode: 'customer_choice'` itself, ignored for the other two modes),
  `downpaymentSettingsUseCases.unit.test.js` (16 passed, `customer_choice` accepted with the same
  effective-row rules as `downpayment_required`, `fixed`-type minimum no longer required),
  `downpaymentSettingsValidator.unit.test.js` (6 passed), `storeCheckoutDownpaymentResolution.unit.test.js`
  (23 passed, election threading through the quote and both checkout paths, plus the extended
  `DOWNPAYMENT_POLICY_UNRESOLVED` guard verified in both directions -- trips on election=
  `'downpayment'` against a malformed row, does NOT trip on election=`'full'` against the same row).
- Backend regression sweep: every other test file importing the touched functions
  (`downpaymentWebhookFinalization`, `storeCheckoutAffiliatePricing`,
  `storeCartQuotePreviewNoContactRequired`, `storeCheckoutInventoryReservation`,
  `storeCheckoutVoucherPromoStacking`, `storeCatalogPaymentMode`) -- all green. Two pre-existing,
  unrelated failures (`storeDirectGcash.usecase.test.js`, `storeUsecases.applicationResult.test.js`,
  a `DIRECT_PAYMENT_NOT_READY`/`DIRECT_PAYMENT_CONFIGURATION_INCOMPLETE` drift) confirmed identical
  on the unmodified baseline via `git stash` before/after -- not a regression.
- Frontend (POS): `downpaymentSettingsForm.test.js` (23 passed, was 18) and
  `downpaymentSettingsPanel.behavior.test.jsx` (11 passed, was 6) -- new coverage for the third
  radio option, the hidden Minimum field in fixed mode, and the relaxed fixed-mode save path.
- Frontend (storefront): full `apps/dgfy-web/apps/store/src/` suite, 723 passed across 136 files,
  including the pre-existing `retailCheckoutOnlinePayments`/`simpleCheckoutOnlinePayments`/
  `fnbStorefront` contract tests, which render the exact three checkout containers this phase wires
  the election control through end to end.
- `npm run build:pos` and `npm run build:store` -- real Vite builds, both succeeded. Full
  `dgfy-web` workspace: 2381 passed across 421 files. `npm run lint`: 0 problems on every
  new/changed file. `npm run check:architecture`: clean. `npm run check:compliance`: PASS (6
  sensitive files, correctly scoped to this phase's own changes in local-worktree mode).
- **Not verifiable this session, disclosed rather than glossed:** no live E2E of the storefront
  election control against a deployed `customer_choice`-configured tenant (unit/contract coverage
  only), and `POST /api/v1/compliance/preflight` not executed against a live environment -- same
  disclosure shape as #859's own declaration.

### Implementation Links

- `apps/dgfy-api/src/modules/downpayment/usecases/downpaymentSettingsUseCases.js`,
  `apps/dgfy-api/src/modules/shared/utils/downpaymentPolicy.js`,
  `apps/dgfy-api/src/validators/storeValidator.js`,
  `apps/dgfy-api/src/modules/store/usecases/storeUseCases.js`
- `apps/dgfy-web/src/features/pos/components/DownpaymentSettingsPanel.jsx`,
  `apps/dgfy-web/src/features/pos/utils/downpaymentSettingsForm.js`
- `apps/dgfy-web/apps/store/src/shared/model/storefrontPaymentElection.js` (new),
  `apps/dgfy-web/apps/store/src/shared/components/checkout/PaymentElectionSelector.jsx` (new),
  `apps/dgfy-web/apps/store/src/shared/model/storefrontDownpaymentPresentation.js`,
  `apps/dgfy-web/apps/store/src/shared/model/checkoutRules.js`,
  `apps/dgfy-web/apps/store/src/StorefrontApp.jsx`, and the three checkout route
  containers/props-hooks (Retail, F&B, Simple)
- `docs/architecture/adr/0070-downpayment-authorization-across-workflow-modes.md` (amended)
- `docs/compliance/impact-declarations/2026-08-22-downpayment-choice-and-settings-clarity.md` (new)
- Issues #865, #866

## Phase 151 - Customer-Facing Downpayment Surfaces

### Initiative and Release

- Initiative: Downpayment & partial payment checkout (epic #815). Issue #826, retitled from a
  collided "Phase 145" claim to Phase 151 — see the dated addendum on the #853/#578-precedent
  renumber note above.
- Release: single `develop`-targeted PR, cut from fresh `origin/develop`.

### Objective and Scope

- Order tracking and confirmation screens show the downpayment paid, not only the balance due.
  `serializeOrderBase` (Phase 142, #823) already returns `amount_paid`/`balance_due` on both the
  customer and public-tracking order payloads, and all three tracking payload models
  (Retail/F&B/Simple) already carry `amountPaid`/`balanceDue` into their view state — but every
  tracking UI rendered only `balanceDue`. `amountPaid` was parsed and carried and never displayed.
- Consolidate five hand-rolled inline copies of the same row (Retail/F&B active + completed views,
  Simple's route page) and two hand-rolled balance-label ternaries (Simple/F&B confirmation
  screens) onto `shared/model/storefrontDownpaymentPresentation.js` — the module every *checkout*
  surface already used, which the *tracking* surfaces had drifted away from.
- The order-confirmation email (#532) is explicitly descoped — greenfield work with no existing
  customer/order-facing email in `emailService.js`, large enough to be its own phase. #532 gained
  an acceptance line requiring the downpayment split when it's eventually built. #826 links with
  `Refs`, not `Closes`, and stays open for that reason.
- Deliberately out of scope, named rather than silently omitted: the tracked-orders drawer
  (`tracking/storage.js`'s `normalizeTrackedOrderEntry` persists no payment split, so its four
  `*TrackingDrawerTotals.jsx` consumers can't show one) and the downloadable receipt image
  (`shared/utils/storefrontTicketImage.js` prints raw `payment_status` with no amounts).
- Fiscal/BIR treatment of a downpayment or balance-settlement event stays deferred per ADR 0069
  clause 9 `[default]` — stated explicitly in the new shared component's own comment, not silently
  omitted.

### Status

- `completed`
- Completed 2026-08-22.

### Dependencies and Governance Note

- [ADR 0069](../architecture/adr/0069-retail-downpayment-multi-method-capture-and-refund-policy.md)
  clause 9 `[default]` (fiscal/BIR deferral), carried forward by ADR 0070 (`status: superseded` /
  `historical` on ADR 0069 itself — not cited as authority for any new decision here).
- Phase 142 (#823) — built the backend serialization and payload-model threading this phase
  displays; no backend change accompanies this phase.
- Phase 144 (#824) — the refund/forfeiture mechanism this epic's customer-facing side reports on.
- **No ADR amendment.** Presentation-only: displays fields the API already serializes, introduces
  no new decision. Classification `within-existing-boundary`.
- **No compliance declaration.** Confirmed against `scripts/check-compliance-impact.js`: its
  `dgfy-web` rules cover only `src/features/pos/`, `src/features/compliance/`,
  `src/pages/Settings`, and three named service files — `apps/dgfy-web/apps/store/**` matches none
  of them, and no `apps/dgfy-api/**` file is touched. `npm run check:compliance` confirmed
  "No compliance-sensitive changes detected" rather than assumed.
  [Post-merge note (#322, 2026-08-23): after this branch's frontend-split absorb, those rules read
  `packages/web-core/src/features/pos/`, `packages/web-core/src/features/compliance/`,
  `packages/web-core/src/pages/Settings`, and `apps/dgfy-ims/Pages/Settings.jsx`. The conclusion is
  unchanged — `apps/dgfy-storefront/**` still matches none of them.]

### Acceptance and Validation Evidence

- [x] `__tests__/storefrontDownpaymentPresentation.test.js` extended for the new
  `resolveTrackingDownpaymentDisplay` adapter — active split, inactive when `paymentStatus` isn't
  `partially_paid`, inactive when `amountPaid` is null, undefined input returns `NULL_DISPLAY`.
- [x] New `__tests__/downpaymentTrackingSummary.test.jsx` — both amounts render for a downpayment
  order, nothing renders for a fully-paid order or missing `trackingResult`, the balance label
  follows delivery vs. pickup.
- [x] `__tests__/simpleTrackingPresentation.test.js` — its three Phase 142 assertions
  string-matched the literal inline block being consolidated away; rewritten to assert each of the
  five tracking views imports and renders `DownpaymentTrackingSummary` (not deleted — the only
  guard that the split stays wired at all).
- [x] Full `apps/dgfy-web/apps/store/src` suite: 734 passed across 137 files (was 723/136 at Phase
  150's measurement).
- [x] `npm run build:store` — real Vite build, succeeded.
- [x] `npx eslint` on every new/changed file — 0 problems.
- [x] `npm run check:architecture` — OK, 50 modules/508 files.
- [x] `npm run check:compliance` — "No compliance-sensitive changes detected", confirming no
  declaration was required rather than assuming it.
- [x] `npm run lint:docs` (chains `check:adr --strict`) — OK, 28 governed docs / 77 ADRs.
- No order, payment, inventory, or database record was created, modified, migrated, or deleted —
  presentation-only diff.

### Implementation Links

- `apps/dgfy-web/apps/store/src/shared/model/storefrontDownpaymentPresentation.js`
  (`resolveTrackingDownpaymentDisplay`, new)
- `apps/dgfy-web/apps/store/src/shared/components/tracking/DownpaymentTrackingSummary.jsx` (new)
- `apps/dgfy-web/apps/store/src/modes/retail/tracking/components/RetailTrackingActiveView.jsx`,
  `RetailTrackingCompletedView.jsx`
- `apps/dgfy-web/apps/store/src/modes/fnb/tracking/components/FnbTrackingActiveView.jsx`,
  `FnbTrackingCompletedView.jsx`
- `apps/dgfy-web/apps/store/src/modes/simple/tracking/components/SimpleTrackingRoutePage.jsx`
- `apps/dgfy-web/apps/store/src/modes/simple/checkout/components/SimpleCheckoutSuccessStep.jsx`,
  `apps/dgfy-web/apps/store/src/modes/fnb/checkout/components/FnbCheckoutConfirmation.jsx`
- `apps/dgfy-web/apps/store/src/__tests__/downpaymentTrackingSummary.test.jsx` (new),
  `storefrontDownpaymentPresentation.test.js`, `simpleTrackingPresentation.test.js`
- Issue #826 (`Refs`, stays open for #532's descoped email work), Issue #532 (gained an acceptance
  line)

## Phase 152 - Frontend App Split (issue #322)

### Initiative and Release

- Initiative: split the single `apps/dgfy-web` frontend package into three
  independently deployable apps plus a shared package, per issue
  Sieitzz/dgfy-platform#322.
- Release: `refactor/322-frontend-app-split` targeting `develop`.

### Objective and Scope

- Extract the ~1,400-file shared trunk (`src/`, `Components/`, `Pages/`'s
  DGFY-auth pages, `sentryViteConfig.js`) into `packages/web-core`
  (`@sieitzz/web-core`) — no build step, no `node_modules`, no lockfile of
  its own.
- Split the three former `apps/dgfy-web/apps/{skupervisor,pos,store}` shells
  into standalone apps: `apps/dgfy-ims`, `apps/dgfy-pos` (with its Electron
  shell), `apps/dgfy-storefront` — each with its own `package.json`,
  lockfile, Vite config, and test config.
- Retire `apps/dgfy-web` entirely once the three apps and web-core cover its
  full contents.
- Fan out every consumer of the old single-package/single-image assumption:
  Docker (one image per app), Docker Compose, nginx upstreams, CI workflows
  (`shared-changed-paths`, `deploy-frontend`, `deployment-orchestrator`,
  `deploy`, `deploy-main`, `pr-checks`, `pr-quality-checks`), `deploy.sh` /
  `deploy-local.sh`, PM2 (`ecosystem.config.cjs`), root `package.json`
  scripts, the `scripts/` path-check sweep, and
  `security/audit-allowlist.json`.
- Document the decision (ADR 0071), sweep the docs and agent-surface files
  that described the old layout, and open the closing PR against `develop`.

### Status

- `completed`
- Completed on 2026-08-15. Absorbed `origin/develop` a second time on 2026-08-22 (442 commits,
  951 files since the prior absorb at `f8e56c71`) to keep this branch current ahead of merge;
  the acceptance evidence below is this phase's own frontend-split work and predates that second
  absorb, which is recorded separately in `docs/architecture/backend-absorption.md`.

### Dependencies and Governance Note

- ADR 0071 Frontend Split into Three Apps (`docs/architecture/adr/0071-frontend-split-into-three-apps.md`),
  `supersedes_in_part` ADR 0059 Frontend Relocation to `apps/dgfy-web`.
- `docs/architecture/frontend-split-sync.md` — the develop-merge absorption
  workflow used throughout this initiative
  (`scripts/frontend-split-path-map.json` +
  `scripts/report-frontend-split-sync.js`).
- No compliance impact declaration required: `npm run check:compliance`
  reports no compliance-sensitive changes for this diff.
- Absorbed `origin/develop`'s Phase 87 (ADR 0064, services handoff legs governance) and Phase 88
  (services handoff-leg schema) in the same merge that lands this phase. Phase 88 is `in_progress`
  as absorbed — its migration dry-run acceptance box is unchecked pending DB credentials — and
  stays that way; this phase does not complete it.

### Acceptance and Validation Evidence

- [x] `apps/dgfy-web` fully retired — `git ls-files apps/dgfy-web` empty;
  `node scripts/report-frontend-split-sync.js --post-merge --strict` reports
  clean (no tracked files under retired frontend-split paths).
- [x] All three apps build standalone: `npm run build:skupervisor`,
  `build:pos`, `build:store`.
- [x] `apps/dgfy-ims` vitest suite (which also runs `packages/web-core`'s
  suite, since web-core has no runner of its own): 232 test files, 1,356
  tests, all passing.
- [x] `apps/dgfy-storefront` vitest suite: 89 test files, 451 tests, all
  passing.
- [x] `scripts/` Node test suite: 164 tests, all passing.
- [x] All three Docker images build clean:
  `infrastructure/docker/dgfy-{ims,pos,storefront}/Dockerfile`.
- [x] `docker compose config --quiet` passes across all four compose
  combinations (base, +override, +local-ports, local-test).
- [x] `npm run check:adr` (72 ADRs), `npm run lint:docs` (27 governed docs),
  `npm run check:compliance`, `npm run check:agent-surfaces` (5 roles, 4
  shims), `npm run check:architecture` (47 modules / 467 files, 86
  controllers), `npm run check:frontend-budgets` all pass.
- [x] `origin/develop` fully absorbed (merge commit `1c9066a8`, absorbing
  `f8e56c71`; confirmed no further drift via `git fetch origin develop`
  before closeout).

### Implementation Links

- `packages/web-core/package.json`
- `apps/dgfy-ims/package.json`, `apps/dgfy-pos/package.json`,
  `apps/dgfy-storefront/package.json`
- `infrastructure/docker/dgfy-ims/Dockerfile`,
  `infrastructure/docker/dgfy-pos/Dockerfile`,
  `infrastructure/docker/dgfy-storefront/Dockerfile`
- `.github/workflows/deploy-frontend.yml`,
  `.github/workflows/deployment-orchestrator.yml`,
  `.github/workflows/deploy-main.yml`
- `scripts/deploy.sh`, `scripts/deploy-local.sh`, `ecosystem.config.cjs`
- `docs/architecture/adr/0071-frontend-split-into-three-apps.md`
- [Issue #322 - Split apps/dgfy-web into independently deployable apps](https://github.com/Sieitzz/dgfy-platform/issues/322)

### Completion Record (2026-08-15)

- Phase 152 is complete. Phase 153 is the next eligible repository phase and
  requires separate approval.

---

## Phase 153 - GHCR Container Image Naming Flattened (issue #928)

### Initiative and Release

- Initiative: flatten every GHCR container package name from
  `ghcr.io/sieitzz/dgfy-platform/<name>` to `ghcr.io/sieitzz/<name>`, per issue
  Sieitzz/dgfy-platform#928.
- Release: `chore/928-flatten-ghcr-image-names` targeting `develop`.

### Objective and Scope

- Reconcile the naming inconsistency between the backend split (PR #55:
  `dgfy-platform/api`, `dgfy-platform/migration-runner` — dropped the `dgfy-`
  prefix) and ADR 0071's frontend split (`dgfy-platform/dgfy-{ims,pos,
  storefront}` — kept a redundant `dgfy-` prefix under a namespace that
  already says `dgfy-platform`). GHCR's org package listing renders only the
  last path segment, so the old backend names displayed as a bare `api`,
  collision-prone once other Sieitzz repositories publish their own
  containers.
- One naming rule: `ghcr.io/sieitzz/<apps-directory-name>` — `dgfy-api`,
  `dgfy-migration-runner`, `dgfy-ims`, `dgfy-pos`, `dgfy-storefront`.
- Fan out every reference: the three build workflows' `IMAGE_NAME`
  (`deploy-api.yml`, `deploy-migration-runner.yml`, `deploy-frontend.yml`),
  `publish-platform.yml`'s staleness guard and its `scripts/deploy-local.sh`
  mirror, every compose file that pins an image tag
  (`infrastructure/docker/docker-compose.yml`,
  `infrastructure/docker/docker-compose.override.yml`,
  `infrastructure/docker/local-test/docker-compose.yml`, and the three
  hand-apply `infrastructure/docker/env/{dev,stage,prod}.compose-fragment.yml`
  + `prod.sops-cutover-fragment.yml`), the live-cutover runbook, setup docs,
  and the three frontend apps' READMEs.
- Document the decision (new ADR 0072, superseding-in-part ADR 0071 Decision
  3 and amending ADR 0032's Consequences), and open the closing PR against
  `develop`.
- Deliberately **not** in scope for this repo-only phase: the legacy
  monolith `ghcr.io/sieitzz/dgfy-platform/frontend` image (has no `apps/*`
  directory, already scheduled for retirement by the frontend-split
  cutover, not renamed); the three live servers' hand-maintained
  `docker-compose.yml` files (folded into that same already-scheduled
  cutover instead of a separate SSH pass); and GHCR package deletion
  (tracked as this issue's own follow-up, gated on the cutover baking).

### Status

- `completed` (repo half only — see Dependencies and Governance Note)
- Completed on 2026-08-24.

### Dependencies and Governance Note

- ADR 0072 GHCR Container Image Naming Convention
  (`docs/architecture/adr/0072-ghcr-container-image-naming.md`),
  `supersedes_in_part` ADR 0071 Decision 3's image-path clause.
- Dated `## Amendments` blocks added to ADR 0071 (`last_reviewed` refreshed)
  and ADR 0032 (`status: accepted` -> `amended`, `last_reviewed` refreshed).
- This phase covers the repository/CI half of issue #928 only. The PR uses
  `Refs #928`, not `Closes #928` — the issue stays open through the live
  per-environment cutover (folded into the frontend-split cutover runbook)
  and the GHCR package cleanup that follows it, neither of which is part of
  this phase's completion.
- No compliance impact declaration required: `npm run check:compliance`
  reports no compliance-sensitive changes for this diff (touches only
  `.github/workflows/**`, `infrastructure/**`, `scripts/**`, `docs/**`,
  `apps/*/README.md` — none of `check-compliance-impact.js`'s trigger
  paths).

### Acceptance and Validation Evidence

- [x] `docker compose -f infrastructure/docker/docker-compose.yml config
  --images` resolves the five flattened names.
- [x] `npm run check:adr` (79 ADRs) and `npm run lint:docs` (28 governed
  docs) pass with ADR 0072 and the ADR 0071/0032 amendments.
- [x] `npm run check:compliance` reports no compliance-sensitive changes.
- [x] YAML parse of the four edited workflows and shell syntax check
  (`bash -n scripts/deploy-local.sh`) pass.
- [x] Repo-wide sweep confirms no remaining `dgfy-platform/api`,
  `dgfy-platform/migration-runner`, or `dgfy-platform/dgfy-{ims,pos,
  storefront}` reference outside the deliberately-untouched historical
  docs (ADR 0059, `backend-absorption.md`, the 2026-07-20 cutover runbook,
  ops incident docs, compliance impact declarations,
  `.agents/skills/promoter/SKILL.md`).
- [ ] Per-environment live cutover verification (`docker compose config
  --images` on each server, `verify-deployment.yml` PASS) — deferred to the
  live cutover, folded into the frontend-split cutover runbook; not part of
  this phase's own completion.
- [ ] GHCR org inventory shows the superseded packages deleted — deferred
  to the follow-up cleanup pass; not part of this phase's own completion.

### Implementation Links

- `.github/workflows/deploy-api.yml`, `deploy-migration-runner.yml`,
  `deploy-frontend.yml`, `publish-platform.yml`
- `scripts/deploy-local.sh`
- `infrastructure/docker/docker-compose.yml`,
  `infrastructure/docker/env/{dev,stage,prod}.compose-fragment.yml`,
  `infrastructure/docker/env/prod.sops-cutover-fragment.yml`
- `docs/architecture/adr/0072-ghcr-container-image-naming.md`
- `docs/architecture/adr/0071-frontend-split-into-three-apps.md` (amended)
- `docs/architecture/adr/0032-standalone-dgfy-api-service.md` (amended)
- [Issue #928 - GHCR package naming convention is inconsistent](https://github.com/Sieitzz/dgfy-platform/issues/928)

### Completion Record (2026-08-24)

- Phase 153 is complete (repo half). Phase 154 is the next eligible
  repository phase and requires separate approval.

---

## Phase 154 - Shared Backend Image Tag Renamed Off `beta` (issue #913)

### Initiative and Release

- Initiative: rename the shared `dgfy-api`/`dgfy-migration-runner` GHCR image
  tag from `beta` to `latest`, per issue Sieitzz/dgfy-platform#913.
- Release: `chore/913-shared-backend-image-tag` targeting `develop`, riding
  the same `develop -> staging -> main` promotion train as the frontend-split
  cutover's PROD leg.

### Objective and Scope

- `beta` was a leftover from the retired beta/prod frontend split
  (#329/#895/#896) — a name that outlived its own meaning once
  `beta.dgfy.ph` was retired, and one that would have forced a prod-only
  `${FRONTEND_PROD_IMAGE_TAG:-latest}` special case into the frontend-split
  cutover's `prod.compose-fragment.yml` had it stayed.
- Repo-side only in this phase: `deploy-main.yml`'s `dgfy-api` and
  `dgfy-migration-runner` jobs' `image_tags` input, `"beta"` -> `"latest"`;
  the now-dead fallback paragraphs in `prod.compose-fragment.yml` and the
  frontend-split cutover runbook's "Prerequisite: issue #913" section,
  rewritten to reflect the rename as landed.
- Deliberately **not** in scope for this phase: the server-side `.env` edit
  (`IMAGE_TAG=beta` -> `latest`) and the `dgfy-api`/`dgfy-migration-runner`
  restart it requires. Landing that alone would be a second, avoidable prod
  downtime window; instead it's folded into the frontend-split cutover
  runbook's own PROD-leg step 3/7, so one server edit and one restart covers
  both changes. Issue #913 stays open until that server-side half lands.

### Status

- `completed` (repo half only — see Dependencies and Governance Note)
- Completed on 2026-08-25.

### Dependencies and Governance Note

- Depends on Phase 153 (#928 GHCR flatten) having already landed —
  `deploy-main.yml`'s image references are the flattened `sieitzz/<name>`
  paths this phase's tag rename applies to.
- Blocks the frontend-split cutover runbook's PROD leg (`docs/deployment/
  2026-08-23-frontend-split-cutover-runbook.md`) — that runbook's own
  `${IMAGE_TAG:-latest}` fragment for `dgfy-ims`/`dgfy-pos`/`dgfy-storefront`
  is only correct once this phase's `deploy-main.yml` change has shipped.
- The PR uses `Refs #913`, not `Closes #913` — the issue stays open through
  the server-side `.env` edit, which is part of the frontend-split cutover's
  own completion, not this phase's.
- No compliance impact declaration required: touches only
  `.github/workflows/deploy-main.yml`, `infrastructure/docker/env/
  prod.compose-fragment.yml`, and `docs/**` — none of
  `check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES` paths.

### Acceptance and Validation Evidence

- [x] `npm run lint:docs` (chains `check:adr`) passes with the runbook edit.
- [x] `npm run check:compliance` reports no compliance-sensitive changes.
- [x] Repo sweep confirms `image_tags: "beta"` no longer appears in
  `deploy-main.yml`.
- [ ] Server-side `.env` `IMAGE_TAG=latest` confirmed on `/opt/dgfy-platform`
  — deferred to the frontend-split cutover runbook's PROD-leg step 3/7; not
  part of this phase's own completion.

### Implementation Links

- `.github/workflows/deploy-main.yml`
- `infrastructure/docker/env/prod.compose-fragment.yml`
- `docs/deployment/2026-08-23-frontend-split-cutover-runbook.md`
- [Issue #913 - rename the shared backend image tag off IMAGE_TAG=beta](https://github.com/Sieitzz/dgfy-platform/issues/913)

## Phase 155 - Promo-to-Voucher Migration: Remove the Legacy Authoring Surface, Reconcile ADR 0066 (issue #695)

### Initiative and Release

- Initiative: Vouchers & promotions engine (epic #453), issue #695 ("Migrate legacy Promo Codes
  into the voucher entity and retire `storefront_promos`"). Partly a retroactive entry: the
  promo-to-voucher data-migration tooling itself shipped 2026-08-20 as PR #778, with no phase-ledger
  entry written at the time.
- Release: `fix/695-freeze-legacy-promo-card` targeting `develop`.

### Objective and Scope

- Retroactive coverage: `apps/dgfy-api/scripts/inventory-promo-to-voucher-migration.js` and
  `apps/dgfy-api/scripts/migrate-promos-to-vouchers.js` (PR #778, 2026-08-20) -- per-tenant,
  dry-run-by-default tooling that converts `system_settings.storefront_promo(s)` JSON into real
  `vouchers` rows and deletes the settings key on apply. Already exercised against a restored
  local-test snapshot (45 tenants, 3 real promos migrated); never run against staging or
  production.
- This phase went through three rounds before landing, all in the same PR:
  1. **Freeze, round 1** -- the singular editor ("Promo Card" in `apps/dgfy-ims/Pages/Settings.jsx`,
     writing `storefront_promo`) was reported as a live regression by Pat, 2026-08-24, since #776's
     freeze of the *plural* `storefront_promos` "Add Promo" button in
     `packages/web-core/.../TerminalOperationsWorkspace.jsx` never touched it. Fixed by disabling
     every input in that block.
  2. **Freeze, round 2** -- a PR #988 review (RF-1, blocker) correctly found round 1 incomplete:
     #776 had only frozen *creating* a new plural promo, not *editing* an existing one. Every
     remaining input/button in the plural editor was disabled too, and both legacy keys dropped
     from `handleStorefrontSave`'s payload.
  3. **Full removal (final scope)** -- while investigating why the migration tooling's own
     "not run against staging/production" note (PR #778) hadn't been resolved, a direct read-only
     check against production (`ssh dgfy`, all 45 tenant DBs) found exactly one real, live,
     un-migrated promo: `storefront_promo` on `sku_tenant_digistore_07dc0023`, code `STOREKO`, 5%
     off, active, valid until 2026-08-31. Per Pat's call, `digistore` is a test store and losing
     `STOREKO` on removal is acceptable. Given that, Pat asked to remove both legacy promo sections
     from the settings UI entirely (not just freeze them) and to file two follow-up tickets: #991
     (retire `commercialPromoPolicy.js` and the settings keys -- the backend half this phase does
     NOT do) and #992 (voucher quick-create macros for "Promo Code" and "List Price Voucher"). This
     phase's final diff deletes both settings sections' JSX, every handler/state/memo that existed
     solely to serve them, the module-level helpers they alone depended on, the now-dead validation
     loop in `handleStorefrontSave`, and the now-fully-orphaned `storefrontPromoSchedule.js` utility
     + its test (verified zero remaining consumers first). `posCommercialPromoConfig.js` and
     `commercialPromoPolicy.js` are untouched -- they're the live *redemption* path, a different
     concern from the *authoring* UI removed here, and are #991's scope.
- ADR 0066 Consequences item 4 amended to match what PR #778 actually shipped: migrated vouchers
  get `channels_mask = storefront|pos` and `is_publicly_listed = true`, derived from each promo's
  own (always-permissive, per #459) config -- not the storefront-only default the ADR text
  previously stated. The ADR amendment this issue's own body called for was never landed when #778
  merged; this phase closes that gap.
- Also corrected: #783 and #459 both carried a stale claim ("no live promo settings remain") that
  the production check above disproved -- corrected via comment on each, detail in #991's body.

### Status

- `in_progress` -- the backend retirement (`commercialPromoPolicy.js`, the settings keys) is now
  tracked by #991, not this phase. This phase's own scope (remove the authoring UI, reconcile ADR
  0066) is complete.

### Dependencies and Governance Note

- Depends on #712 (POS voucher redemption) and #713 (`is_publicly_listed` column), both closed
  2026-08-20/22 -- #695's own hard dependencies, now satisfied.
- Classification: `major`, `surfaces: settings,pos,terminal` -- both
  `apps/dgfy-ims/Pages/Settings.jsx` and `packages/web-core/src/features/pos/` trip
  `check-compliance-impact.js`'s exact-path/prefix floors regardless of diff content, per
  `docs/compliance/impact-declarations/2026-08-25-legacy-promo-card-frozen.md`.
- ADR 0066 Consequences item 4 amended 2026-08-25 (untagged, no strictness tier, same-PR amendment
  per ADR 0039 Decision 3 -- no new ADR, no tech-lead approval required).
- **Production risk from PR #778, now resolved by this phase's own investigation, not left open:**
  the #776/#777 storefront checkout UI (on `main`) routes every "Use" click through the voucher
  endpoint, and the migration script had only ever run against a local snapshot. Checked directly
  against production (this phase): exactly one real legacy promo remains (`STOREKO`, a confirmed
  test-store tenant), and Pat has accepted losing it. #991 tracks whether to bother migrating it
  before deleting the settings key, or just delete it outright.
- The PR uses `Refs #695`, not `Closes #695` -- #991 (backend retirement) is the issue that
  eventually closes out #695's remaining scope.

### Acceptance and Validation Evidence

- [x] `npm run build:skupervisor` and `npm run build:pos` -- real Vite production builds of both
  apps consuming `TerminalOperationsWorkspace.jsx`. Both bundles measurably shrank (Settings:
  229.45kB -> 226.20kB; TerminalOperationsWorkspace: 586.68kB -> 564.61kB), confirming real dead
  code removal.
- [x] `npm run check:compliance`, `npm run check:adr`, `npm run check:architecture` -- all PASS.
- [x] `apps/dgfy-ims/Pages/__tests__/legacyPromoCardFrozen.test.jsx` and
  `packages/web-core/src/features/pos/__tests__/legacyPromoAuthoringFrozen.contract.test.js` --
  both rewritten to assert absence (no rendered section, no supporting identifiers, no legacy keys
  in either save payload) rather than disabled-presence.
  `storefrontPromoEligibility.contract.test.js` deleted (asserted now-removed UI behavior).
- [x] `npm test` in `apps/dgfy-ims` (includes `packages/web-core/**`) -- 286 files / 1679 tests,
  all passing.
- [x] Rendered-UI proof (Architecture Governance item 8) -- done against Pat's real
  `do-not-commit/local-test/` restored-production stack (docker context `ch`) during the freeze
  rounds; both `dgfy-ims` and `dgfy-pos` rebuilt and recreated healthy, served-bundle verification
  confirmed the fix survived minification, both apps' entry screens render nonblank with zero
  console errors. No real tenant account was logged into.
- [ ] Inventory + apply run against staging/production for the one remaining test-store promo --
  now #991's own call, not blocking this phase.
- [ ] `storefront_promo(s)`/`commercialPromoPolicy.js` retirement -- tracked by #991.

### Implementation Links

- `apps/dgfy-api/scripts/inventory-promo-to-voucher-migration.js`,
  `apps/dgfy-api/scripts/migrate-promos-to-vouchers.js` (PR #778, retroactive coverage)
- `apps/dgfy-ims/Pages/Settings.jsx`
- `apps/dgfy-ims/Pages/__tests__/legacyPromoCardFrozen.test.jsx`
- `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`
- `packages/web-core/src/features/pos/__tests__/legacyPromoAuthoringFrozen.contract.test.js`
- `docs/architecture/adr/0066-voucher-sale-time-price-resolution.md` (2026-08-25 amendment)
- `docs/compliance/impact-declarations/2026-08-25-legacy-promo-card-frozen.md`
- [Issue #695 - Migrate legacy Promo Codes into the voucher entity and retire storefront_promos](https://github.com/Sieitzz/dgfy-platform/issues/695)
- [Issue #991 - Retire Legacy Promo Codes: commercialPromoPolicy.js and the storefront_promo(s) settings keys](https://github.com/Sieitzz/dgfy-platform/issues/991)
- [Issue #992 - Vouchers: quick-create macros for "Promo Code" and "List Price Voucher"](https://github.com/Sieitzz/dgfy-platform/issues/992)

### Completion Record (2026-08-25)

- Phase 155 is `in_progress`. Phase 156 is the next eligible repository phase and requires separate
  approval.

---

## Phase 156 - POS Cashier Attendance and Register Handoff Contract Freeze

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, contract and governance slice.

### Objective and Scope

- Separate employee attendance, employee breaks, register shifts, terminal operator sessions, and
  cash-custody handoffs at the architecture and product-contract level.
- Define the complete state transitions, actor permissions, server-authority rules, concurrency
  behavior, audit evidence, historical compatibility, and failure codes.
- Freeze one tenant/location-scoped, default-off rollout flag that prevents partial workflow
  exposure before Phase 162.
- Add a tech-lead-approved ADR that supersedes in part the affected binding handoff clauses in ADR
  0065, plus dated amendments to ADR 0031 and ADR 0044.
- Freeze the expected data for the 7:00 AM-10:00 PM target scenario and its negative-test matrix.
- Explicit exclusion: no migration, runtime code, API, UI, report, or production behavior change.

### Status

- `completed`
- Completion date: 2026-08-24.

### Dependencies

- Phase 153 completed.
- Architecture Governance ADR change process and tech-lead approval for affected binding clauses.

### Acceptance and Validation Evidence

- [x] New superseding-in-part ADR is `accepted` and records tech-lead approval.
- [x] ADR 0031 and ADR 0044 have dated amendments with no contradictory active rule remaining.
- [x] Every transition names its actor, preconditions, persisted event, error behavior, and audit
  evidence.
- [x] Entity names, statuses, uniqueness rules, authentication rules, compatibility semantics, and
  reporting invariants are frozen.
- [x] Target and negative scenarios have approved expected records.
- [x] `npm run check:adr` and `npm run lint:docs` pass.

### Progress Record (2026-08-24)

- [x] Phase 156 scope re-read and confirmed as governance-only; no migration,
  model, API, frontend, report, feature-flag, or runtime files changed.
- [x] ADR 0073 drafted with the attendance/operator-session/register/custody
  contract and the 7:00 AM-10:00 PM target scenario.
- [x] Dated ADR 0031 and ADR 0044 amendments recorded with current runtime
  behavior preserved until later implementation activation.
- [x] Tech-lead acceptance of ADR 0073 recorded in the ADR approval record.
- [x] Phase 156 acceptance gates complete and status moved to `completed`.

### Completion Record (2026-08-24)

- ADR 0073 is accepted and supersedes the affected ADR 0065 handoff binding
  clauses in part.
- ADR 0031 and ADR 0044 dated amendments are effective for the approved future
  implementation contract while preserving current runtime behavior.
- The exact Phase 157 persistence identifiers are frozen; no schema or runtime
  code was changed in Phase 156.
- Phase 157 became the implementation phase after approval, completed its additive
  persistence gates, and leaves Phase 158 as the next eligible phase.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/architecture/adr/0031-pos-terminal-pairing-and-shift-safe-navigation.md`
- `docs/architecture/adr/0044-pos-terminal-device-pairing.md`
- `docs/architecture/adr/0065-pos-shared-parked-sales-and-cashier-handoff.md`

---

## Phase 157 - POS Cashier Attendance and Register Handoff Persistence

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, additive persistence slice.

### Objective and Scope

- Add forward and rollback migrations, models, repositories, serializers, tenant-schema entries,
  database constraints, and indexes for the Phase 156-approved attendance, break, operator-session,
  handoff, and transaction-attribution records.
- Preserve historical transaction and shift data; do not fabricate historical attendance.
- Add compatibility handling for qualifying open register shifts only as approved in Phase 156.
- Explicit exclusion: no new endpoint, UI, takeover flow, authorization change, or report change.

### Status

- `completed`
- Completion date: 2026-08-24.

### Dependencies

- Phase 156 completed with accepted governance and frozen schema contract.

### Progress Record (2026-08-24)

- [x] Phase 157 started after Phase 156 completion.
- [x] Persistence identifiers and compatibility boundaries are frozen by ADR
  0073.
- [x] Additive migrations, models, repositories, serializers, schema
  registration, tenant bootstrap repair, and constraints implemented.
- [x] Fresh/populated migration, rollback, re-apply, parity, and repository
  evidence recorded.

### Acceptance and Validation Evidence

- [x] Fresh migration, production-shaped populated migration, rollback, and re-apply pass in the
  temporary MySQL smoke database; the database is removed after validation.
- [x] Database-enforced unique active-state indexes reject duplicate attendance, break, and
  terminal-operator records; the focused migration tests and MySQL constraint smoke pass.
- [x] Runtime schema registration and tenant schema parity checks cover every new object, generated
  active-state column, transaction link, and named index.
- [x] Existing shift, transaction, checkout, and X/Z tests pass without behavior changes.
- [x] Historical cashier and register-shift data remains attributable because the migration is
  additive, the operator link is nullable, and no historical backfill/update is issued.
- [x] Focused model/repository tests, architecture checks, compliance checks, docs checks, and
  tenant-schema coverage pass.

### Completion Record (2026-08-24)

- Added the idempotent forward/rollback migration
  `20260824000001-create-pos-cashier-attendance-operator-sessions.cjs` with generated active-state
  uniqueness and transaction operator attribution.
- Added tenant models/associations, named indexes, runtime schema requirements, tenant repair
  registry, and new-tenant bootstrap application of the same migration.
- Added the dormant repository/serializer foundation without adding routes, UI, authorization
  changes, checkout attribution, or reports.
- Validation evidence: focused Phase 157 tests (10 passing), existing POS shift/checkout/X/Z/readiness
  tests (78 passing), actual MySQL fresh/populated/constraint/rollback smoke, actual re-apply smoke,
  `npm run check:tenant-schema-coverage`, `npm run check:architecture`, `npm run check:compliance`,
  `npm run lint:docs`, `npm run check:adr -- --write-index`, ESLint, and `git diff --check`.
- At the time of this Phase 157 completion record, Phase 158 was complete and Phase 159 was the
  next eligible phase pending explicit approval. Phases 159 and 158 are now completed; the current
  next eligible phase is Phase 161.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`
- `apps/dgfy-migration-runner/migrations/20260824000001-create-pos-cashier-attendance-operator-sessions.cjs`
- `apps/dgfy-api/src/models/EmployeeAttendanceSession.js`
- `apps/dgfy-api/src/models/EmployeeBreakSegment.js`
- `apps/dgfy-api/src/models/PosTerminalOperatorSession.js`
- `apps/dgfy-api/src/models/PosDrawerHandoffEvent.js`
- `apps/dgfy-api/src/modules/pos/repositories/posCashierAttendanceRepository.js`
- `apps/dgfy-api/src/modules/pos/serializers/posCashierAttendanceSerializers.js`
- `apps/dgfy-api/tests/posCashierAttendanceOperatorSessions.migration.test.js`
- `apps/dgfy-api/tests/posCashierAttendanceRepository.test.js`
- `apps/dgfy-api/tests/posCashierAttendanceSchema.contract.test.js`

---

## Phase 158 - POS Attendance and Break Lifecycle

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, attendance slice.

### Objective and Scope

- Deliver Time In, Time Out, Start Break, End Break, Start Relief Duty, and End Relief Duty use
  cases, APIs, permissions, auditing, and minimal POS attendance UI behind the default-off rollout
  flag.
- Enforce server timestamps, valid transition order, one active attendance, one active break,
  location scope, idempotency, and manager correction audit history.
- Record Cashier B's 12:00-1:00 relief separately from B's 3:00-10:00 regular duty.
- Explicit exclusion: no PIN takeover, register-control change, transaction attribution, payroll,
  schedule optimizer, or final reporting module.

### Status

- `completed`
- Completion date: 2026-08-24.

### Dependencies

- Phase 157 completed with migration and persistence evidence.

### Acceptance and Validation Evidence

- [x] The target scenario creates exactly three attendance sessions and one break segment.
- [x] Duplicate Time In, attendance overlap, invalid break order, and invalid location access fail
  with stable codes and no partial record.
- [x] Refresh, retry, and duplicate clicks do not duplicate attendance or break records.
- [x] Permission, tenant isolation, concurrency, API, repository, and frontend lifecycle tests pass.
- [x] Existing terminal shift and checkout behavior remains unchanged.
- [x] Production build and applicable architecture/compliance/docs checks pass.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`
- `docs/compliance/impact-declarations/2026-08-24-pos-cashier-attendance-lifecycle.md`
- `apps/dgfy-api/src/modules/pos/usecases/posCashierAttendanceUseCases.js`
- `packages/web-core/src/features/pos/components/PosAttendancePanel.jsx`

### Progress Record (2026-08-24)

- [x] Phase 158 approved after Phase 157 completion and the authoritative contract re-read.
- [x] Scope fixed to attendance and break lifecycle only; register takeover, PIN
  authentication, checkout attribution, and reporting remain deferred to later phases.
- [x] Backend lifecycle, permission, audit, idempotency, and location-isolation implementation.
- [x] Gated POS attendance panel and frontend lifecycle tests.
- [x] Full Phase 158 acceptance and governance evidence.

### Completion Record (2026-08-24)

- Added tenant-local attendance/break lifecycle use cases, routes, validators, permissions, audit
  events, server timestamps, manager corrections, and retry idempotency behind the
  `pos_cashier_attendance_lifecycle_v1` location allowlist.
- Added the gated POS attendance panel and service bindings; register takeover, PIN, checkout
  attribution, and reporting remain deferred to Phase 159/160/161.
- Focused backend evidence: 66 tests passed across lifecycle, route, repository, migration,
  schema, runtime-audit, permission, and transport suites. Frontend evidence: 3 focused panel
  tests passed. POS production build passed.
- Database evidence: both attendance migrations applied to local MySQL; Phase 158 migration was
  rolled back and re-applied successfully, with both migrations reporting `up` afterward.
- Governance evidence: architecture guardrails, controller boundaries, tenant-schema coverage,
  compliance/API contracts, ADR lint, governed-doc lint, targeted ESLint, Node syntax checks, and
  `git diff --check` passed. The broad all-path POS sweep was stopped after an unrelated existing
  long-running test stalled; the targeted POS reconciliation and transport regressions passed.

Phase 158 through Phase 160 are complete. Phase 161 is the next eligible phase and requires
separate approval.

---

## Phase 159 - Secure POS Operator Takeover and Cash Custody

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, operator and custody slice.

### Objective and Scope

- Add dedicated cashier PIN enrollment/reset/verification with strong hashing, rate limiting,
  lockout, generic errors, and auditable security events.
- Add HttpOnly, CSRF-protected operator authority scoped to tenant, location, terminal, register
  shift, employee, and operator session.
- Deliver atomic Take Over Register, Return Register, End Operator Session, temporary shared-relief
  access, and counted cash-custody handoff use cases.
- Revoke operator authority on break, Time Out, terminal unpair, register close, account disable,
  or replacement takeover.
- Record lunch relief as uncounted shared-drawer access and the 3:00 PM custodian change as a
  counted, two-party-acknowledged handoff.
- Keep all new takeover behavior inaccessible while the default-off rollout flag is disabled; the
  legacy single-cashier path remains unchanged.
- Explicit exclusion: no checkout UI integration, broad transaction-flow changes, final reports,
  or production rollout.

### Status

- `completed`
- Completion date: 2026-08-24.

### Dependencies

- Phase 158 completed with correct attendance and break eligibility state.

### Acceptance and Validation Evidence

- [x] Concurrent takeover state is serialized by the open-shift/operator locks and the active
  operator uniqueness constraint; replacement and end events are audited in one transaction.
- [x] Invalid, expired, replayed, locked, off-duty, on-break, cross-tenant, cross-location, and
  cross-terminal attempts fail closed through server-owned scope, PIN verification, JWT claims,
  persisted token hashes, active-attendance checks, and feature gating.
- [x] Takeover never opens or closes a register shift and never changes the opening float.
- [x] Counted handoff expected cash, actual cash, variance, and two-party acknowledgements persist
  atomically with the operator replacement.
- [x] Cookie, CSRF, rate-limit, lockout, revocation, permission, and isolation contracts pass in
  `posOperatorAuthority.security.contract.test.js` and the focused attendance/transport suites.
- [x] Existing checkout behavior remains unchanged; checkout attribution is explicitly deferred to
  Phase 160.

### Phase 159 Completion Record

- Database: `20260824000003-add-pos-cashier-pin-and-operator-authority.cjs` was applied, rolled
  back, reapplied, and confirmed `up` together with the Phase 157/158 migrations.
- Implementation: dedicated bcrypt cashier PIN state; revocable, tenant/location/terminal/shift/
  employee/session-scoped HttpOnly authority; atomic takeover, return, shared-relief, counted
  custody, explicit end, and revocation hooks for breaks, Time Out, unpair, close, disable, and
  removal.
- Tests: Phase 159 migration/use-case/security suites (21 tests), attendance/persistence/route
  suites (20 tests), and permissions/handler/device transport suites (35 tests) passed.
- Governance and quality: architecture guardrails, controller boundaries, tenant-schema coverage,
  compliance/API contracts, governed-doc and ADR lint, ESLint (0 errors; seven pre-existing
  warnings), backend build, POS production build, Node syntax checks, and `git diff --check`
  passed.
- Links: `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`,
  `docs/compliance/impact-declarations/2026-08-24-pos-cashier-operator-authority.md`,
  `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js`, and
  `apps/dgfy-api/tests/posOperatorAuthority.security.contract.test.js`.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/architecture/adr/0026-browser-session-cookie-authority.md`
- Phase 156's accepted ADR and amendments.

---

## Phase 160 - POS Checkout and Cashier Workflow Integration

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, POS integration slice.

### Objective and Scope

- Add the current-cashier banner, locked-terminal state, PIN takeover, return, break handoff,
  shared-relief disclosure, and counted-handoff UI behind the default-off rollout flag.
- Make the active operator authoritative for checkout, payments, refunds, voids, protected
  discounts/overrides, no-sale/drawer-open, parked-sale resume, and online cash collection.
- Derive transaction cashier and operator-session attribution on the server; retain the one register
  shift for X/Z and cash reconciliation.
- Block incompatible break, Time Out, takeover, handoff, and close operations while payment or
  drawer mutation is in flight, with deterministic retry/recovery.
- Explicit exclusion: no new reporting module, payroll engine, scheduling, biometrics, or
  multi-drawer redesign.

### Status

- `completed`
- Completion date: 2026-08-25.

### Dependencies

- Phase 159 completed with secure operator and custody behavior.

### Acceptance and Validation Evidence

- [x] `posCheckout.db.integration.test.js` proves target sales are attributed A, B, A, B under
  one unchanged register shift.
- [x] `posOperatorMutationAttribution.contract.test.js` proves client-supplied cashier data cannot
  override the server-selected operator.
- [x] Parked-sale, split-payment, refund, void, online-cash, and drawer authorization suites prove
  the original context is retained while the actual operator is recorded.
- [x] In-flight payment, authority refresh/retry, duplicate takeover, revocation, and terminal-unpair
  tests pass without partial operator transitions.
- [x] `PosAttendancePanel.behavior.test.jsx` and the POS responsive contracts verify named controls,
  status/alert semantics, duplicate-submit protection, and responsive terminal integration.
- [x] Focused backend suites (121 tests), the fresh-schema database integration suite (11 tests),
  focused operator tests (11 tests), focused POS UI/contract tests (30 tests), architecture,
  tenant-schema,
  compliance, docs, lint, syntax, and all three production builds pass.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`
- Phase 156's accepted ADR and amendments.

---

## Phase 161 - Cashier, Attendance, Register, and Handoff Reporting

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, reporting and reconciliation slice.

### Objective and Scope

- Add separate attendance output, cashier sales summary, register X/Z views, and operator/handoff
  audit timeline.
- Report regular duty, relief duty, breaks, worked minutes, actual transaction operator, shared
  drawer access, counted custody changes, expected/actual cash, and variance.
- Reconcile cashier subtotals to register transaction totals and handoff snapshots to final Z close.
- Clearly label historical data that lacks operator-session detail; do not fabricate precision.
- Explicit exclusion: no workflow behavior changes, payroll, schedule enforcement, or unrelated
  analytics.

### Status

- `completed`
- Started and completed: 2026-08-25.

### Dependencies

- Phase 160 completed with authoritative transaction and operator attribution.

### Acceptance and Validation Evidence

- [x] Cashier subtotals reconcile to register totals for identical filters and documented exclusions.
- [x] Handoff snapshots and tender movements remain register-scoped and disclose counted versus shared access.
- [x] The target scenario fixture reports correct attendance, break, sales, operator, shared-access,
  custody, and register records for A and B.
- [x] Historical rows remain readable and clearly disclose missing operator detail.
- [x] Permission, isolation, Manila business-date, bounded pagination/range, export, and budget gates pass.
- [x] Reporting regressions, all three production builds, architecture, compliance, and docs checks pass.

### Completion Evidence (2026-08-25)

- Backend: `posReports.repository.test.js`, `posReports.usecase.test.js`, and
  `posValidator.reportsOverviewQuery.test.js` passed (25 tests total after the lifecycle scenario).
- Frontend: `posReportsAnalyticsWorkspace.contract.test.js` passed (5 tests); POS, Skupervisor,
  and Storefront production builds passed; frontend route budgets passed.
- Governance: architecture guardrails, controller boundaries, compliance checks, docs lint, and
  strict ADR validation passed.
- Implementation: POS report overview/export now exposes separate attendance, cashier sales,
  register reconciliation, operator sessions, and handoff records. Shared-drawer access never
  fabricates individual variance, and transactions without operator-session detail are labeled
  `legacy_cashier_snapshot`.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- Phase 156's accepted reporting contract.

---

## Phase 162 - POS Cashier Handoff End-to-End Hardening and Rollout

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, release-hardening and rollout slice.

### Objective and Scope

- Prove the complete target scenario through deterministic E2E and database assertions.
- Run security, tenant/location isolation, concurrency, replay, offline/recovery, accessibility,
  responsive, performance, migration, rollback, build, and full regression gates.
- Preserve legacy behavior behind a tenant/location feature flag, then canary and verify the new
  behavior through a documented reversible rollout.
- Add operational metrics and alerts for failed takeover, session-constraint, PIN lockout,
  unreconciled handoff, and report-mismatch signals.
- Explicit exclusion: no new product scope; discoveries are routed into a new planned phase.

### Status

- `completed`
- Started: 2026-08-25 after Phase 161 completed.
- Completion date: 2026-08-25.

### Dependencies

- Phase 161 completed with reconciled reports.
- Non-production environment and representative migration dataset available.

### Acceptance and Validation Evidence

- [x] Repeated deterministic target scenario proves exact attendance, break, operator, transaction, handoff,
  and register records from 7:00 AM through 10:00 PM.
- [x] Security, architecture, compliance, migration, rollback, focused feature regression, production builds,
  Playwright, accessibility, and performance gates pass.
- [x] No critical/high defect, data mismatch, unresolved exception, or unchecked required gate
  remains.
- [x] Feature-disabled legacy behavior and feature-enabled behavior both pass compatibility tests.
- [x] Canary activation and rollback are proven outside production before production approval is
  requested.
- [x] Ledger evidence links test output, migration rehearsal, monitoring, and
  rollout proof.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/ops/POS_CASHIER_ATTENDANCE_ROLLOUT.md`
- Focused backend lifecycle, authority, report, route, security, attribution, and metrics suites:
  49 passing tests; additive migration/schema safe-rerun and rollback suites: 13 passing tests.
- Real MySQL isolated-database checkout proof applied the complete migration chain and persisted
  A/B/A/B operator attribution under one register shift.
- POS Playwright responsive/accessibility proof passed at 1024x600, 1280x720, 1366x768, and
  390x844 with no runtime crash or viewport overflow; frontend component/contract suites passed
  25 tests, and all three production builds plus frontend budget checks passed.
- Local non-production canary at location 1 verified zero active shift/attendance/break/operator
  blockers, enabled only location 1, and restored the original absent setting row; production was
  not changed.
- `npm run check:architecture`, `npm run check:tenant-schema-coverage`,
  `npm run check:compliance`, and governed documentation checks passed.

---

## Phase 163 - Tenant-Admin Cashier Attendance Configuration

### Initiative and Release

- Initiative: POS Cashier Attendance and Register Handoff.
- Release: Release 1, tenant-admin configuration slice.

### Objective and Scope

- Add a dedicated POS attendance-configuration API for the existing tenant/location-scoped
  `pos_cashier_attendance_lifecycle_v1` setting.
- Add a separate Cashier Attendance & Breaks card under Settings > POS Setup with enable/disable
  control, active-location selection, workflow warnings, and an independent save boundary.
- Keep configuration server-authoritative: validate tenant locations, reject unsafe changes while
  affected shifts/attendance/breaks/operator sessions are active, and write an immutable audit event.
- Refresh the active POS attendance surface after a successful change without requiring direct
  database editing or an application restart.
- Explicit exclusion: no new attendance state, payroll, scheduling, reporting behavior, automatic
  lifecycle closure, or cashier permission to change rollout configuration.

### Status

- `completed`
- Started: 2026-08-25 after Phase 162 completed.
- Completion date: 2026-08-25.

### Dependencies

- Phase 162 completed with controlled canary activation and rollback proof.
- Existing tenant location, settings RBAC, POS Settings PIN, attendance, operator-session, and audit
  contracts remain available.

### Acceptance and Validation Evidence

- [x] Authorized tenant settings administrators can enable one or more active tenant locations;
  unauthorized users and cashiers receive a stable denial.
- [x] Invalid, duplicate, inactive, and cross-tenant location IDs fail without a partial write.
- [x] Enabling without a selected location fails validation; missing or malformed persisted state
  remains disabled.
- [x] Activation, deactivation, and location removal fail closed while affected register shifts,
  attendance sessions, breaks, or operator sessions are active.
- [x] Configuration writes record actor, request, before/after value, and affected locations.
- [x] Unrelated POS Setup saves cannot alter the attendance configuration.
- [x] The attendance panel refreshes immediately after a successful configuration save.
- [x] Backend route/use-case/repository, permission, tenant-isolation, concurrency, audit, frontend
  behavior, accessibility, desktop/tablet/mobile, production builds, architecture, compliance, and
  docs gates pass.

### Planning and Implementation Links

- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`
- `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`
- API and policy: `apps/dgfy-api/src/modules/pos/repositories/posCashierAttendanceConfigRepository.js`,
  `apps/dgfy-api/src/modules/pos/usecases/posCashierAttendanceConfigUseCases.js`,
  `apps/dgfy-api/src/routes/pos.js`, and `apps/dgfy-api/src/validators/posValidator.js`.
- UI and refresh: `packages/web-core/src/features/pos/components/PosCashierAttendanceSettingsCard.jsx`,
  `packages/web-core/src/features/pos/components/PosAttendancePanel.jsx`, and
  `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`.
- Focused configuration repository/use-case/route suites passed 11 tests; the complete cashier
  attendance/authority/report/migration/metrics regression passed 92 tests; frontend configuration,
  attendance, reporting, tablet, and responsive suites passed 31 tests after the refresh assertion.
- POS, SKUpervisor, and Storefront production builds passed. Frontend route budgets passed with the
  existing large-chunk warnings. Architecture, controller boundaries, tenant schema coverage,
  compliance/API contracts, governed docs/ADR lint, targeted ESLint, and local API health passed.
- Unauthenticated live requests to the dedicated endpoint returned `401`; the protected local POS
  booted without browser console errors. The signed-in configuration surface is covered by component
  behavior/accessibility tests because no credentials were supplied to the temporary browser session.

## Phase 164 - Automatic Cashier Attendance Lifecycle

### Initiative and release

POS cashier attendance and register handoff hardening, post-Phase-161 UX and
legacy-account repair.

### Objective and scope

- Make opening a shift automatically create regular attendance and the active
  operator session when attendance is enabled for the terminal location.
- Make `Break & Lock` record the break and revoke operator authority before the
  client locks; same-cashier authentication ends the break and resumes the
  existing shift.
- Make shift close end attendance and operator authority in the same transaction
  as register close.
- Remove normal-cashier Time In, Start Break, End Break, and Time Out controls
  from the POS surface while retaining manager correction and relief handoff
  controls in their governed surfaces.
- Add missing attendance permissions to existing cashier accounts additively and
  prevent raw 403 attendance banners for users without view permission.

### Status

- `completed`
- Started: 2026-08-25 after Phase 163 completed.
- Completed: 2026-08-25 after signed-in cashier browser and failure-path gates passed.

### Dependencies

- Phases 156-163 completed.
- ADR 0073 and ADR 0031 amended on 2026-08-25.
- Existing attendance, operator-session, shift, parked-sale, and payment leases.

### Acceptance and validation evidence

- [x] Legacy cashier permission backfill now includes `cashier` and remains
  additive/idempotent.
- [x] Open-shift and close-shift lifecycle hooks are transaction-scoped.
- [x] Break & Lock and same-cashier resume endpoints are wired.
- [x] Compact POS attendance status hides manual normal-cashier attendance
  controls and avoids fetching attendance without view permission.
- [x] Backend syntax, attendance lifecycle, operator authority, route, replay,
  and shift use-case regression suites pass.
- [x] Signed-in legacy-cashier browser E2E passes on an enabled location.
- [x] POS, IMS, and Storefront production builds pass after the shared web-core
  changes.
- [x] Tablet viewport contract and utility verification pass.
- [x] Signed-in failure/rollback verification passes on an enabled location.

Signed-in local verification on 2026-08-25 used the legacy cashier account on
`http://localhost:5174/` after the additive permission backfill: opening shift
138 created attendance session 2 and operator session 1; the POS showed
`Working since` and `Break & Lock`; Break & Lock created break segment 2 and
ended operator authority; offline resume was rejected with the reconnect guard;
online resume closed break segment 2 and restored authority; final close ended
shift 138, attendance session 2, break segment 2, and operator session 2 with
the expected PHP 1,000 cash count. Browser dev logs contained no error-level
entries. The prior permission failure was reproduced before backfill and
resolved after the targeted role-permission repair. A clean rerun with the
post-open stock alert dismissed confirmed the single-click Break & Lock path
on shift 140; that shift, attendance session 4, break segment 4, and its
operator session were also closed cleanly at the expected PHP 1,000 count.

### Implementation links

- `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js`
- `apps/dgfy-api/tests/posCashierLifecycle.usecases.test.js`
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/controllers/posHandlers.js`
- `apps/dgfy-api/src/routes/pos.js`
- `apps/dgfy-api/scripts/backfill-role-permissions.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/PosAttendancePanel.jsx`
- `packages/web-core/src/features/pos/services/posService.js`

### Next eligible phase

Phase 165 is now eligible; Phase 164 signed-in cashier E2E and
failure/rollback acceptance gates passed on 2026-08-25.

## Phase 165 - Locked-Terminal Cashier Takeover Entry Point

### Initiative and release

POS cashier attendance and register handoff hardening, terminal takeover UX.

### Objective and scope

- Add a direct **Another cashier taking over?** entry point to the locked-terminal
  Resume Shift dialog.
- Keep same-cashier Resume Shift owner-only and unchanged.
- Authenticate the incoming cashier through a DGFY POS tenant session, then
  authorize the existing server-side operator takeover with the incoming
  cashier's dedicated POS PIN.
- Keep the continuous register shift, opening float, and drawer lifecycle
  unchanged; this UI performs an uncounted relief takeover only.
- State the server-enforced precondition that the incoming cashier must have
  active attendance and no active break. Counted custody transfer remains a
  separate handoff action.

### Status

- `completed`
- Started: 2026-08-25 after Phase 164 completed.
- Completed: 2026-08-25 after focused, full-suite, build, and architecture gates passed.

### Dependencies

- Phase 164 completed.
- ADR 0073 operator sessions, scoped cashier PIN, and fail-closed attendance
  invariants.
- Existing `/pos/terminal/operator/takeover` route and HttpOnly operator
  authority cookie transport.

### Acceptance and validation evidence

- [x] Locked terminal keeps owner-only Resume Shift and exposes the separate
  incoming-cashier takeover path.
- [x] Takeover requires incoming cashier DGFY authentication and a 4-12 digit
  POS PIN; duplicate submits are disabled while the request is in flight.
- [x] Takeover uses the existing server-side operator authority route and does
  not create a register shift, opening float, or counted custody event.
- [x] UI clearly reports the active-attendance/no-active-break precondition and
  preserves server-side fail-closed validation.
- [x] POS shared-web-core contract and attendance behavior tests pass (16/16).
- [x] Full shared-web-core/IMS Vitest suite passes (1,724/1,724 tests).
- [x] Attendance rollout ordering, compact End Break reachability, and active-break lock
  fallback are covered by regression tests.
- [x] Existing operator-authority, cashier-attendance, and cashier-lifecycle API suites pass
  (28/28 tests across the focused suites).
- [x] POS, IMS, and Storefront production builds pass.
- [x] Architecture guardrails and controller-boundary checks pass.

### Implementation links

- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalPairing.contract.test.js`
- `packages/web-core/src/features/pos/services/posService.js`
- `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js`
- `apps/dgfy-api/src/routes/pos.js`

### Residual verification note

The local in-app browser successfully authenticated both supplied cashier test
accounts and verified temporary shift cleanup. A successful takeover submission
was not completed because the fallback test terminal's location was not enabled
in the tenant attendance rollout and no separate POS cashier PIN was supplied.
No sale or payment was created. The takeover modal is covered by the shared
web-core contract suite, server authority behavior remains fail-closed, and a
successful two-cashier takeover remains the next operational verification after
the target location is enabled and a POS PIN is enrolled.

---

## Phase 166 - Automatic Attendance on Cashier Takeover

### Initiative and release

POS cashier attendance and register handoff hardening, automatic incoming-cashier lifecycle.

### Objective and scope

- Remove the dead-end where a cashier is required to be timed in before takeover
  even though the occupied register prevents that cashier from opening a shift.
- Start a regular attendance session automatically for the incoming cashier
  during takeover when attendance is enabled for the register location.
- Reuse same-location attendance, reject an active attendance session at another
  location, and preserve the existing POS PIN, no-active-break, authorization,
  operator-session, drawer, and register-shift controls.

### Status

- `completed`
- Started: 2026-08-25 after the Phase 165 Masu browser test exposed the attendance dead-end.
- Completed: 2026-08-25 after focused API/frontend tests and production builds passed.

### Dependencies

- Phase 165 completed.
- ADR 0073 automatic cashier lifecycle and operator-session contract.
- Existing `/pos/terminal/operator/takeover` route and tenant attendance rollout.

### Acceptance and validation evidence

- [x] A takeover with no active attendance creates one regular attendance session
  and the replacement operator session in the same transaction.
- [x] A same-location active attendance session is reused; a different-location
  active session fails closed without creating a duplicate.
- [x] Existing PIN, no-active-break, location-grant, in-flight-operation, and
  idempotency guards remain enforced.
- [x] The takeover dialog explains that attendance starts automatically.
- [x] Focused operator-authority and lifecycle API tests pass (25/25 across the
  focused suites).
- [x] Shared POS contract and behavior tests pass; the full IMS suite remains
  green (1,724/1,724).
- [x] POS and IMS production builds, architecture guardrails, and controller
  boundary checks pass.

### Implementation links

- `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js`
- `apps/dgfy-api/src/modules/pos/index.js`
- `apps/dgfy-api/tests/posCashierLifecycle.usecases.test.js`
- `apps/dgfy-api/tests/posOperatorAuthority.usecases.test.js`
- `packages/web-core/src/features/pos/components/TerminalPageDialogLayer.jsx`
- `packages/web-core/src/features/pos/__tests__/terminalPairing.contract.test.js`

### Residual verification note

The Masu browser test reproduced the original failure and confirmed the takeover
entry point. The automatic-attendance fix is covered by the API use-case tests;
the final live success path still requires a valid, separately enrolled POS PIN
for the incoming cashier. No sale, payment, shift close, or drawer mutation is
part of this phase.

---

## Phase 167 - Verified AI/Model PR Attribution (#1024)

### Initiative and release

Developer-experience attribution contract for AI-assisted pull requests and review comments.

### Objective and scope

- Provide verified, tool-neutral runtime/model attribution for Claude Code, Codex, Antigravity,
  OpenCode, and Cursor.
- Keep session evidence local, ephemeral, worktree-bound, and fail-closed when it cannot be proven.
- Standardize `Opened by`, `Review`, and `Addressed` tags in the PR template and canonical roles.

### Status

- `completed`
- Started and completed: 2026-08-25.

### Dependencies

- Phase 166 completed.
- `docs/ai/PR.md`, canonical role definitions, and the PR template.
- No ADR change: this is an AI tooling/documentation contract with no application architecture impact.

### Acceptance and validation evidence

- [x] Runtime payload extraction covers Claude Code, Codex, and OpenCode plus best-effort
  Antigravity/Cursor adapters; mapped/unmapped models, blank rejection, expired/stale evidence,
  and Cursor initialization ambiguity are covered.
- [x] Versioned records are atomically stored only under Git metadata, scoped by runtime/session/
  worktree and rejected unless current worktree validation succeeds.
- [x] PR/template and Worker, Reviewer, and Promoter instructions omit attribution when validation
  produces no proof.
- [x] Node syntax checks, attribution unit tests, documentation lint, architecture, and compliance
  gates pass (2026-08-25).

### Implementation links

- `scripts/ai-attribution.js`
- `scripts/ai-attribution.test.js`
- `docs/ai/AI_MODEL_ATTRIBUTION.md`
- `.opencode/plugins/dgfy-ai-attribution.js`
- `.claude/settings.json`

### Next eligible phase

Phase 168 is eligible after this completion.

---

## Phase 168 - POS Discount Self-Approval and Operator-Authority Remediation (#1033)

### Initiative and release

POS employee-discount hardening follow-up for PR #1033.

### Objective and scope

- Restore fail-closed cashier self-approval protection for Senior, PWD, Promo, and Other item discounts in both direct-PIN and trusted split-payment completion paths.
- Preserve tenant-controlled self-approval exclusively for Employee Directory discounts.
- Remove the unapproved DGFY-session/operator-authority identity binding so scoped cashier authority remains independent of DGFY browser identity, as required by ADR 0073.
- Defer the employee-discount storage migration/API-performance follow-up items outside this blocker remediation.

### Status

- `completed`
- Started and completed: 2026-08-25.

### Dependencies

- Phase 167 completed.
- ADR 0033, ADR 0039, and ADR 0073.
- PR #1033 / issue #1020.

### Acceptance and validation evidence

- [x] Direct PIN and trusted split-payment manual item self-approval return `DISCOUNT_SELF_APPROVAL_BLOCKED` (focused checkout contracts, 2026-08-25).
- [x] Employee-discount self-approval enabled/disabled coverage remains green (`posDiscountApprovalPolicy.unit.test.js`, 2026-08-25).
- [x] A valid correctly scoped operator-authority cookie remains usable when the DGFY session identity differs; expired and scope-mismatch rejection coverage remains green (`posOperatorAuthority.usecases.test.js`, 2026-08-25).
- [x] Focused POS policy/use-case and shared frontend suites, POS/SKUpervisor/Storefront builds, architecture/compliance/docs checks, and diff safety pass (2026-08-25).

### Implementation links

- PR #1033
- `apps/dgfy-api/src/modules/pos/usecases/posUseCases.js`
- `apps/dgfy-api/src/modules/pos/usecases/posOperatorAuthorityUseCases.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `docs/architecture/adr/0033-commercial-promo-and-statutory-pos-discount-boundaries.md`
- `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`

---

## Phase 169 - Production POS Cashier Authority Recovery (#1045)

### Initiative and release

Production hotfix for POS operator-authority recovery on `main`.

### Objective and scope

- Restore a missing operator session only when the authenticated cashier is the exact owner of the open register shift and still has active attendance at that location.
- Bind manual resume/takeover mutations to the separately verified cashier session without replacing the active DGFY browser identity.
- Preserve fail-closed takeover, terminal, location, shift, attendance, permission, and scoped HttpOnly operator-authority checks.

### Status

- `completed`
- Started and completed: 2026-08-25.

### Dependencies

- Phase 168 completed.
- ADR 0026, ADR 0031, and ADR 0073.
- Incident issue #1045.

### Acceptance and validation evidence

- [x] Missing operator recovery succeeds for the authenticated shift owner with active attendance.
- [x] A different cashier cannot claim a missing operator session through resume.
- [x] Manual resume/takeover request configuration uses the verified cashier access/company tokens, disables auth refresh, and does not install the cashier session as DGFY browser identity.
- [x] Backend lifecycle/operator suites: 3 suites, 28 tests passed.
- [x] Shared POS decision/contract suites: 2 files, 79 tests passed.
- [x] API syntax, architecture guardrails, and POS/SKUpervisor/Storefront production builds passed.

### Implementation links

- Issue #1045
- `apps/dgfy-api/src/modules/pos/usecases/posCashierLifecycleUseCases.js`
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js`
- `docs/compliance/impact-declarations/2026-08-25-pos-employee-discount-and-operator-hardening.md`

### Next eligible phase

Phase 170 is eligible after this completion.

---

## Phase 170 - POS Operator Authority Version-Skew Compatibility (#1045)

### Initiative and release

Rolling-version compatibility and reason-code unification for POS operator authority, building on
Phase 169's production hotfix back-port.

### Objective and scope

- Preserve legacy shift-owner selling only when operator authority is explicitly feature-disabled
  (`POS_OPERATOR_FEATURE_DISABLED` or `POS_ATTENDANCE_FEATURE_DISABLED`) or the exact
  current-operator route is absent during a mixed-version local/deployment window.
- Unify the client's operator-unavailable classification behind a single call-site helper
  (`isPosOperatorAuthorityUnavailableError`) that composes the existing feature-disabled
  reason-code set rather than re-deriving it.
- Keep arbitrary authorization, permission, domain, terminal, location, shift, attendance, and
  unrelated route failures fail-closed.

### Status

- `completed`
- Started and completed: 2026-08-26.

### Dependencies

- Phase 169 completed.
- ADR 0026, ADR 0031, and ADR 0073.
- Incident issue #1045; production hotfix PR #1046; PR #1053 review finding RF-1.

### Acceptance and validation evidence

- [x] Feature-disabled and exact route-missing current-operator responses enter legacy mode
  without issuing a second doomed resume request; unrelated 404, permission, and operator-domain
  failures remain fail-closed.
- [x] `POS_ATTENDANCE_FEATURE_DISABLED` is recognized by the same call-site classifier used for
  `POS_OPERATOR_FEATURE_DISABLED`, closing the promotion-conflict gap flagged on PR #1053.
- [x] Shared POS decision/contract suites pass, including the added attendance-disabled and
  route-skew cases.
- [x] API syntax, architecture/controller guardrails, compliance/docs checks, diff safety, and
  POS/SKUpervisor/Storefront production builds passed.

### Implementation links

- Issue #1045 / PR #1053 / production hotfix PR #1046 / PR #1054 (back-ported as Phase 169 via
  PR #1057)
- `packages/web-core/src/features/pos/pages/TerminalPage.jsx`
- `packages/web-core/src/features/pos/utils/terminalShiftEntryDecision.js`
- `docs/compliance/impact-declarations/2026-08-25-pos-employee-discount-and-operator-hardening.md`

### Next eligible phase

Phase 171 is eligible after this completion.

### Residual validation note

The optional frontend budget gate remains red on the existing SKUpervisor `TerminalPage` chunk:
the untouched `develop` baseline is 133.89 KB against a 128 KB budget, while this branch is
134.97 KB. The 1.08 KB delta is the scoped compatibility classifier and tests do not mask the
pre-existing 5.89 KB baseline overage; budget remediation remains outside issue #1045.

---

## Phase 171 - Standalone POS Operator Sign-In Contract (#1052)

### Initiative and release

Standalone POS cashier/operator switching refactor contract.

### Objective and scope

- Freeze a capability-based operator sign-in flow in which the existing DGFY browser session
  establishes company/terminal context and an eligible operator uses a personal POS PIN.
- Preserve one continuous register shift, opening float, drawer ledger, and server-attributed
  operator history across routine resume/takeover transitions.
- Exclude IMS product behavior while retaining a conditional IMS regression build only if a later
  runtime phase changes shared `packages/web-core` files.
- Define security, concurrency, cart, protected-operation, custody, version-skew, QA, and rollout
  boundaries for separately approved delivery phases.

### Status

- `completed`
- Started and completed: 2026-08-26.

### Dependencies

- Phase 170 completed on `develop`.
- Issue #1052 and ADR 0026, ADR 0031, ADR 0044, ADR 0065, and ADR 0073.

### Acceptance and validation evidence

- [x] ADR 0073 records personal-PIN, capability-based operator switching without replacing DGFY
  browser identity or weakening its binding authorization and cash-custody clauses.
- [x] The authoritative terminal flow distinguishes initial DGFY sign-in from the planned routine
  operator sign-in and does not claim the target flow is already deployed.
- [x] Owners/admins with `pos:transact`, `pos:attendance:operate`, location, attendance, and PIN
  eligibility can operate; a hard-coded `role === cashier` gate is not part of the target contract.
- [x] Cart, protected operation, concurrency, idempotency, lockout, generic error, shared-drawer,
  counted-custody, and mixed-version risks have required mitigations.
- [x] IMS is excluded from product scope; conditional shared-code regression validation is not an
  IMS feature commitment.
- [x] Documentation, ADR, architecture, compliance, and diff-safety checks passed.

### Implementation links

- Issue #1052; follows the completed compatibility work in PR #1053
- `docs/architecture/adr/0073-pos-cashier-attendance-breaks-and-register-operator-sessions.md`
- `docs/features/POS_CASHIER_TERMINAL_FLOW.md`
- `docs/features/POS_CASHIER_BREAK_AND_REGISTER_HANDOFF_PLAN.md`

### Next eligible phase

Phase 172 is eligible for separate approval after Phase 171 reaches `develop`.

---

## Phase 172 - POS Operator Eligibility and PIN Authority

### Objective and scope

Implement one server-authoritative resume/takeover policy that validates active membership,
`pos:transact`, `pos:attendance:operate`, location, attendance/break state, terminal/shift scope,
and personal PIN before issuing operator authority without changing DGFY browser identity. Preserve
authenticated self-enrollment and administrator reset paths that do not require an already-active
operator session.

### Status

- `planned`

### Dependencies

- Phase 171 completed and merged to `develop`; explicit implementation approval.

### Acceptance and validation evidence

- [ ] Atomic same-operator resume and different-operator takeover use the same eligibility policy.
- [ ] Rate limiting, lockout, generic failures, audit evidence, idempotency, and one-current-operator
  concurrency invariants pass focused backend tests.
- [ ] A first eligible operator can enroll a personal PIN under `pos:attendance:operate`, and an
  authorized administrator can reset one under `users:manage`, without circular operator authority.
- [ ] Cross-tenant, cross-location, inactive membership, missing permission, invalid attendance,
  invalid PIN, and stale terminal/shift requests fail closed.

### Next eligible phase

Phase 173 becomes eligible after Phase 172 completes.

---

## Phase 173 - Standalone POS Operator-Switch UI

### Objective and scope

Replace the repeated target DGFY credential and role-string gate with an eligible-operator picker
and personal-PIN sign-in flow in standalone POS while preserving initial DGFY company/terminal
authentication.

### Status

- `planned`

### Dependencies

- Phase 172 completed; explicit implementation approval.

### Acceptance and validation evidence

- [ ] Current operator can resume and a different eligible operator can take over without closing
  the register or changing DGFY browser identity.
- [ ] Non-empty carts require park/cancel and protected operations visibly block switching.
- [ ] Loading, offline, error, lockout, accessibility, responsive, and duplicate-submit states pass
  focused standalone POS tests.
- [ ] IMS receives no operator-switch UI or product behavior; if shared runtime files change, its
  build passes only as a regression gate.

### Next eligible phase

Phase 174 becomes eligible after Phase 173 completes.

---

## Phase 174 - Operator-Switch Security, Concurrency, and Compatibility Hardening

### Objective and scope

Prove replay, rapid double-submit, stale eligibility, concurrent devices, protected operations,
cart handling, PIN lockout, audit evidence, and bounded mixed-version behavior across the Phase
172-173 contract.

### Status

- `planned`

### Dependencies

- Phases 172-173 completed; explicit implementation approval.

### Acceptance and validation evidence

- [ ] Exactly one operator remains current after concurrent resume/takeover attempts.
- [ ] No failed transition changes the register, opening float, drawer ledger, cart, attendance,
  DGFY identity, or operator authority partially.
- [ ] Compatibility telemetry and a dated fallback-removal condition are documented and tested.

### Next eligible phase

Phase 175 becomes eligible after Phase 174 completes.

---

## Phase 175 - Standalone POS Operator-Switch End-to-End Proof and Rollout

### Objective and scope

Verify and release the two-operator standalone POS workflow with transaction attribution,
shared-drawer disclosure, counted-custody separation, restore/rollback, accessibility, monitoring,
and production proof.

### Status

- `planned`

### Dependencies

- Phase 174 completed; explicit rollout approval and normal release policy.

### Acceptance and validation evidence

- [ ] A deterministic owner/admin/cashier capability matrix and two-operator selling scenario pass
  through the standalone POS with server/database attribution proof.
- [ ] Regression, security, accessibility, performance, rollback, monitoring, and deployment gates
  pass without adding IMS product behavior.
- [ ] Production verification proves the deployed commit and records removal readiness for any
  temporary version-skew fallback.

### Next eligible phase

The next repository phase is allocated from the authoritative ledger after Phase 175 completes.

---

### Planning Record (2026-08-26)

- Phase 156 through Phase 171 are `completed`. Phases 172-175 are `planned`, and Phase 172 is the
  next eligible phase after explicit approval and Phase 171 merge.
- Phase 157 evidence includes the actual temporary-MySQL migration/constraint/
  rollback/re-apply rehearsals, focused persistence tests, existing POS
  regression tests, and architecture/compliance/docs/schema gates.
- A phase becomes `completed` only after all of its required acceptance evidence is checked and
  linked; planning alone is not evidence of functional completion.
---

**Dated note, 2026-08-22 — Phase-number collision between this branch and `develop`, resolved per
the `#578` precedent ("the prior reservation wins; the side that grabbed a number without checking
renumbers"):**

This branch's own Phase entry for the frontend split (issue #322) originally claimed **Phase 89**,
assigned during the prior absorb cycle (`f8e56c71`, 2026-08-16) against `develop`'s state at that
time. Since then `develop` independently landed its own, different **Phase 89** (*POS Items
Gallery and IMS CSV Import Foundation*) and continued on through **Phase 150**. Neither side had
the other's Phase 89 as an ancestor when each claimed the number, so this is a genuine collision,
not a missed rebase — resolved by absorbing `develop` (the larger, already-merged body of work)
verbatim and renumbering this branch's unmerged entry, and moving it to the end of the ledger
(after develop's own Phase 150) rather than leaving it spliced between develop's Phase 88 and 89:

| Phase | Owner | Disposition |
|---:|---|---|
| 89 | `develop`'s POS Items Gallery / IMS CSV Import Foundation | unchanged — prior reservation, already merged to `develop` |
| 151 | This branch's Frontend App Split (issue #322) | **moved from 89**, then moved again — see the 2026-08-23 addendum below |

No code changes accompany this renumber — the phase's own implementation was already complete and
merge-independent; only the ledger heading, its own "Completion Record" trailer, and the ADR 0071
cross-reference above needed edits. The three `// ... Phase 89` source comments in
`apps/dgfy-api/**` (`fulfillmentProfiles.contract.test.js`, `ServiceBookingStatusEvent.js`,
`serviceUseCases.js`) refer to `develop`'s Phase 89 and are correct as absorbed — left untouched.

**Addendum, 2026-08-23 — the same collision fired a second time, same day, on the number this note
itself just assigned.** `develop` independently claimed `## Phase 151 - Customer-Facing Downpayment
Surfaces` (#826, commit `6519e39c`, 2026-08-22 21:11) about 1.5 hours after this branch's own
renumber above (commit `18e11cb6`, 19:37) — so this branch was chronologically first, but by the
time of the next absorb cycle (2026-08-23) develop's Phase 151 was already merged and externally
cited (its own issue, PR, and compliance declaration all reference "Phase 151"). Neither side was
careless: each checked against the highest number visible in the ledger it could see, and this
branch's own reservation is invisible to `develop`'s authors by construction — it lives on an
unmerged branch. Resolved the same way as the first collision: the unmerged absorbing branch
renumbers again.

| Phase | Owner | Disposition |
|---:|---|---|
| 151 | `develop`'s Customer-Facing Downpayment Surfaces (#826) | unchanged — already merged to `develop` |
| 152 | This branch's Frontend App Split (issue #322) | **moved from 151, which was itself moved from 89** |

This is the fourth ADR/phase-number collision across two absorb cycles (see
`docs/architecture/backend-absorption.md:300` for the earlier ADR-number precedent this pattern
follows). The root cause is structural, not a process gap on either side: as long as this branch's
own ledger entry stays unmerged, every `develop` author choosing "the next free phase number" is
choosing against a ledger that doesn't yet contain this branch's reservation. It will keep recurring
each absorb cycle until PR #513 merges.
`docs/architecture/backend-absorption.md`'s 2026-08-16 dated log entry, which narrates this
branch's *prior* renumber decision (Phase 87 → 89 at that time), is a historical record of what was
true then and is preserved verbatim per `AGENTS.md`'s "never renumber completed phases" rule — it
is not a live reference and is not updated by this note.

---

**Dated note, 2026-08-28 — phase numbers reserved from a `main`-based branch, not `develop`.**
This initiative's PRs intentionally target `main` directly (Pat's explicit direction, #360 —
production secrets need to be ready to execute live, not queued behind `develop`'s normal flow;
see the initiative's own PR/issue trail for the authorization). At the time Phase 180 below was
reserved, `develop`'s own copy of this ledger was already at Phase 179 (`main`'s was only at 175,
since `develop` runs 100+ commits ahead) — reserving from 176 would have collided. Checked
`develop`'s actual highest number directly rather than trusting `main`'s stale view, per this
file's own established collision-resolution convention (see the 2026-08-16/2026-08-23 notes
above). This is the same structural gap those notes describe: this reservation is invisible to
`develop`'s authors until this branch's ledger edit is absorbed there. Reconcile at that point
using the standard renumber procedure if `develop` has independently claimed 180+ by then.

## Phase 180 - SOPS+age Production Secrets Cutover: Pre-Work

### Initiative and release

DevOps Initiative 1 — secrets management, replace dotenv (#360). Fixes the crash-loop defect in
the originally drafted cutover artifacts (dropping `env_file: .env` from `dgfy-api` without
replacing the ~69 non-secret vars it supplied) before any of it reaches the production server.

### Objective and scope

- Regenerate the SOPS cutover fragment (`infrastructure/docker/env/prod.sops-cutover-fragment.yml`)
  and runbook (`docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md`) against a fresh 2026-08-28 server
  capture, replacing the stale 2026-08-13 baseline (retired `frontend`/`frontend-beta`, the #1014
  `start_period` fix, the corrected A/B/C bucket split).
- Commit `deploy-sops.sh` (the SOPS decrypt/export loop) and a real pre-flight gate that runs
  `apps/dgfy-api/src/config/productionEnvValidation.cjs`'s `validateProductionEnv()` **inside the
  dgfy-api image itself**, not against a host-side copy — `/opt/dgfy-platform` is not a git
  checkout, so a hand-copied validator would silently drift from the image.
- Amend ADR 0060 Decision 2: three buckets, not two — non-secret config becomes literal values in
  `docker-compose.yml` (git-auditable), not a thinner `.env`.
- Fix a path-resolution bug in `deploy-sops.sh` found by `pr-reviewer` (RF-2 on PR #1135): the
  script's `cd` logic assumed the repo-checkout math (`dirname/../../..`) was a no-op once deployed
  to `/opt/dgfy-platform/deploy-sops.sh` — it isn't; that resolves to `/`, not the project root.
  Now detects the deployed-vs-checkout layout instead of assuming one.

### Status

- `completed`
- Started and completed: 2026-08-28. PR #1135 merged to `main` (merge commit `2b5b7158`).

### Dependencies

- ADR 0060 (`docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md`), `status: amended`.
- Runbook Phase 1 (sops/age install, server age keypair) — already done 2026-08-13, unaffected by
  this phase.
- None on a prior repository phase — this is this initiative's first ledger entry.

### Acceptance and validation evidence

- [x] `node --check`/`bash -n` on all new/changed scripts; `npm run lint:docs` (29 governed docs,
  81 ADRs) clean on every doc/ADR commit.
- [x] `actionlint` clean on the (held) CI change, PR #1136.
- [x] In-image pre-flight gate verified functionally against a real built `dgfy-api` image
  (`dgfy-secrets-poc` Lima VM): fails on an empty env with the correct missing-key list, fails on
  short/placeholder `JWT_SECRET`/`REFRESH_TOKEN_SECRET` values, passes on a complete valid set.
- [x] `pr-reviewer` review on PR #1135: RF-2 (the `cd` path bug) fixed and independently re-verified
  (both the deployed-layout and repo-checkout-layout resolution branches tested directly). RF-1
  (base-branch choice) addressed via PR comment — Pat's explicit authorization for a `main`-based
  branch on this initiative, not a code change.
- [x] Names-only extraction from the live production `.env` (100 unique variable names, zero values
  read — ADR 0060 Decision 7 governs values, not names) reconciled against the code-derived
  classification; all 14 `BASE_REQUIRED_KEYS` traced to bucket A or B.

### Implementation links

- PR #1135 (merged), PR #1132 (closed, superseded by #1135)
- `infrastructure/docker/env/prod.sops-cutover-fragment.yml`
- `infrastructure/docker/env/prod.env-var-classification.md`
- `infrastructure/docker/scripts/deploy-sops.sh`
- `infrastructure/docker/scripts/check-assembled-env.cjs`
- `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md`
- `docs/architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md` (2026-08-28 amendment)

### Next eligible phase

Phase 181 (local rehearsal) — already completed alongside this phase; see below.

---

## Phase 181 - SOPS+age Cutover: Local Rehearsal (Mechanism and Migration Proof)

### Initiative and release

DevOps Initiative 1 — secrets management (#360). Simulates the full production cutover — including
rollback — against a disposable local stack before Phase 182/183 touch the real server, per Pat's
explicit direction that this be rehearsed first.

### Objective and scope

- Rehearse the actual migration of a *running* `env_file:`-based stack to the SOPS+age split — not
  a greenfield build, which is what the original 2026-08-13 POC did and is why it likely never
  exercised the crash-loop defect Phase 180 fixed.
- Prove the in-image pre-flight gate catches a bad assembled environment before any container is
  touched, and that `TENANT_SCHEMA_MUTATION_APPROVED` survives the bucket split (its absence in
  `entrypoint.sh` is silent, not a crash — the exact regression class this cutover risks).
- Rehearse the rollback leg, not just the forward cutover.

### Status

- `completed`
- Started and completed: 2026-08-28. `dgfy-secrets-poc` Lima VM (bumped 4GiB -> 8GiB RAM),
  driving `do-not-commit/local-test`'s existing 7-service `env_file:`-based replica.

### Dependencies

- Phase 180 completed (the artifacts under rehearsal).
- `do-not-commit/local-test` stack and the `dgfy-secrets-poc` Lima VM (pre-existing from the
  2026-08-13 POC, repurposed here).

### Acceptance and validation evidence

- [x] All 5 service images built successfully inside the poc VM against the real Dockerfiles.
- [x] Fixture secrets only (rehearsal-only age keypair, generated and used solely inside the VM;
  never a real production value, per ADR 0060 Decision 7) encrypted correctly with SOPS — ciphertext
  at rest, keys cleartext, ADR 0060 Decision 6's literal-`$`-in-bcrypt-hash corruption class
  deliberately included in the fixture and confirmed not to reproduce.
- [x] Dry-run config render: zero empty interpolations on the touched services (`dgfy-api`,
  `dgfy-migration-runner`); pre-existing unrelated Sentry/PostHog frontend build-arg defaults
  correctly excluded from that check.
- [x] Pre-flight gate caught a real defect in the rehearsal's own fixture (`ADMIN_ACCOUNTS_JSON`
  wrong shape, undersized bcrypt hash) *before* any container was touched — exactly the failure
  class this gate exists to convert from a crash loop into a pre-flight check. Passed after the
  fixture was corrected.
- [x] Targeted `up -d` (never `down`) recreated only `dgfy-migration-runner`/`dgfy-api`; `dgfy-api`
  reached `healthy`, `/api/v1/health` reported all subsystems healthy.
- [x] `[TenantSchemaSync] completed total=45 ok=45 failed=0` in the container log — confirms
  `TENANT_SCHEMA_MUTATION_APPROVED` (bucket B) survived the `env_file` removal.
- [x] Rollback rehearsed: restored the pre-sops `docker-compose.yml`, Compose correctly recreated
  both containers, `dgfy-api` returned to `healthy` with the original `env_file`-sourced config.
- [x] Two real mistakes surfaced and corrected during the rehearsal, not silently reproduced going
  forward: reading a dev-only `.env.compose` file for structure and finding it held real
  credential-shaped values (corrected to names-only extraction for the remainder of this and any
  future session); two `dgfy-api` container-creation attempts that silently failed network
  attachment (a stale port conflict from the superseded 2026-08-13 POC container, and running a
  `docker compose up` invocation outside the decrypt-loop wrapper) — both caught via direct
  network/health inspection rather than assumed success.
- [x] All rehearsal scratch state (fixture secrets, scratch scripts, `.pre-sops-rehearsal` backups)
  removed afterward; `do-not-commit/local-test/docker-compose.yml` confirmed byte-identical to its
  pre-rehearsal state; the `ch` docker context's working stack restored to healthy.

### Implementation links

- `do-not-commit/local-test/` (not committed to the repo — a local working stack)
- `dgfy-secrets-poc` Lima VM (`~/.lima/dgfy-secrets-poc`)
- Phase 180's artifacts (the object of this rehearsal)

### Next eligible phase

Phase 182, after Pat completes the age-key escrow verification (issue #1137) — the one step whose
failure mode is permanent, per ADR 0060 Decision 3 (`binding`), and so gates everything after it.

---

## Phase 182 - SOPS+age Cutover: Backup and Rollback Prerequisites (Production Server)

### Initiative and release

DevOps Initiative 1 — secrets management (#360). Scoped to epic #492's #493/#494/#495 plus the
age-key/ciphertext-repo backup gap (#1137) — only what this specific cutover needs before it
executes against production, not the full epic.

### Objective and scope

- Verify the production age key's Bitwarden escrow copy actually decrypts (ADR 0060 Decision 3,
  `binding` — a missing escrow copy is unrecoverable secret loss with no exceptions). Pat-only.
- Config backup on the real server (`.env`, `docker-compose.yml`, `nginx/` -> `.pre-sops` copies)
  and image-digest pinning (PROD runs `:latest`; if the tag moves before a rollback is needed, a
  file-only restore recovers the file, not the behavior that was running).
- A fresh production DB dump before cutover — closes the #494 gap (no pre-deploy backup on the live
  container deploy path) this cutover would otherwise walk past.

### Status

- `blocked`
- Blocked on: Pat (sudo access, ADR 0060 Decision 7 boundary on Phase 2's real secret values,
  physical server access — `/opt/dgfy-platform` is not a git checkout).

### Dependencies

- Phase 181 completed (rehearsal must pass before this touches the real server).
- Issue #1137 (age key escrow + ciphertext repo backup/recovery story), filed under epic #492.

### Acceptance and validation evidence

- [ ] Bitwarden escrow copy round-trip confirmed to actually decrypt.
- [ ] `secrets/`, `Sieitzz/dgfy-secrets` repo created/populated (Pat runs Runbook Phase 2 personally
  — AI may not extract/transcribe a real production secret value, ADR 0060 Decision 7, `binding`).
- [ ] Config backup and image digests captured and reviewed on the real server.
- [ ] A fresh production DB dump taken.

### Implementation links

- Issue #1137
- `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` ("Backup and rollback, before this cutover runs")
- ADR 0060 Decisions 3 and 7

### Next eligible phase

Phase 183, after this phase's acceptance evidence is checked.

---

## Phase 183 - SOPS+age Cutover: Production Execution

### Initiative and release

DevOps Initiative 1 — secrets management (#360). The actual server-side cutover — Runbook Phases
2-5, and the low-disruption targeted `up -d` sequence (`dgfy-api`/`dgfy-migration-runner` only;
`mysql`/`redis`/`nginx`/the three frontends/`certbot` untouched).

### Objective and scope

- Split and encrypt the live `.env` (Runbook Phase 2, Pat personally).
- Reconcile the live `docker-compose.yml` against the fragment (Runbook Phase 3).
- Dry-run gate (Runbook Phase 4) then the actual cutover (Runbook Phase 5) in its own deploy window,
  separate from PR #1130's application-code promotion, so a post-cutover problem is diagnosable
  against a known-good baseline.

### Status

- `blocked`
- Blocked on: Phase 182 completion; PR #1130 merged and independently verified healthy first
  (its own, separate promotion — not part of this initiative, but a stated sequencing dependency).

### Dependencies

- Phase 180, 181, 182 completed.
- PR #1130 (`release/2026-08-28` -> `main`) merged and verified.

### Acceptance and validation evidence

- [ ] Dry-run gate (Runbook Phase 4): clean `sops decrypt`, zero empty interpolations, in-image
  pre-flight gate passes against the real assembled environment.
- [ ] `docker compose ps` all healthy post-cutover (`dgfy-api` needs up to ~104s — do not call it
  failed early).
- [ ] `curl -fsS https://dgfy.ph/api/v1/health` (not `beta.dgfy.ph`, which 301-redirects).
- [ ] `[entrypoint] Tenant schema sync: all active tenants OK.` in the production logs.
- [ ] Manual smoke test on the live domain.
- [ ] `verify-deployment.yml` dispatched for PROD (read-only).

### Implementation links

- `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` (Phases 2-5, "Rollback")
- Phase 180's artifacts

### Next eligible phase

Phase 184, after this phase's acceptance evidence is checked.

---

## Phase 184 - SOPS+age Cutover: CI Cutover (`publish-platform.yml`)

### Initiative and release

DevOps Initiative 1 — secrets management (#360). Flips the PROD deploy path in CI to the SOPS-aware
script, closing out the initiative.

### Objective and scope

- Merge PR #1136 (`publish-platform.yml`'s PROD-only `deploy-sops.sh` branch) — held, not merged,
  until Phase 183 has passed. DEV/STAGING are unaffected by this change.
- Confirm a real `deploy-main.yml` run through the edited workflow succeeds.

### Status

- `blocked`
- Blocked on: Phase 183 completion. PR #1136 is open (`main`, `mergeStateStatus: CLEAN`) and ready,
  deliberately unmerged.

### Dependencies

- Phase 183 completed and verified.

### Acceptance and validation evidence

- [ ] PR #1136 merged.
- [ ] A real `deploy-main.yml` PROD run through the edited workflow succeeds.
- [ ] `.env.pre-sops` and the stale plaintext `.env*` dumps (Runbook Phase 7) shredded — gated on
  this phase passing *and* one further independent CI deploy also succeeding.
- [ ] This initiative's changes back-ported to `develop` (fresh issue via `pm`, per
  `docs/ops/RELEASE_CANDIDATE_POLICY.md`'s hotfix/back-port procedure — a closed/merged `main` PR
  cannot itself `Refs` into a `For QA` transition).

### Implementation links

- PR #1136
- `.github/workflows/publish-platform.yml`

### Next eligible phase

The next repository phase is allocated from the authoritative ledger after Phase 184 completes.
This initiative (#360) is done at that point.
