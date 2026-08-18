---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-13
review_by: 2027-02-13
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
  against the ledger, folder-descendant scope resolution, and the reversal path) is the next eligible
  phase for the voucher initiative — renumbered from this entry's originally-planned 104 because
  Phase 104 (below) was concurrently claimed by an unrelated Storefront PayMongo initiative that
  merged into `develop` first; per this ledger's continuous-numbering rule, 105 is the next unclaimed
  number, not 104.

## Phase 104 - Storefront Active PayMongo E-wallet Routing

### Initiative and Release

- Initiative: Storefront payment-method capability expansion.
- Release: Storefront Hosted Checkout active e-wallet/card method selection.

### Objective and Scope

- Show active server-resolved Card, GCash, Maya, GrabPay, ShopeePay, and QR Ph
  choices in Storefront checkout.
- Route the selected method as the single PayMongo Hosted Checkout method; a
  GCash selection must create a session restricted to `gcash`.
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
- [ ] Maya, GrabPay, ShopeePay, Card, and QR Ph selections preserve their exact
  method identifiers through the same payment-session endpoint.
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

### Completion Record

- Phase 104 remains in progress until the acceptance gates and live-capability
  verification pass. Phase 105 is the next eligible phase after completion.
