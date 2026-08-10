---
status: authoritative
authority_level: authoritative
owner: product
last_reviewed: 2026-08-09
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

Phase 22 is complete. The Adds F&B Specific initiative now has a continuous completed record from Phase 14 through Phase 22. No later phase is scheduled.
