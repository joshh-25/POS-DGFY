# Requirements: DGFY Standalone Refactor

**Defined:** 2026-07-10
**Core Value:** DGFY can become a standalone multi-tenant POS and Storefront system without breaking the existing live platform during migration.

## User Stories

- As a DGFY operator, I can run schema, data, verify, status, and rollback-support commands from one migration image so migrations are explicit deployment actions instead of hidden API startup side effects.
- As a DGFY developer, I can build Accounts, Businesses, and Tenancy APIs against stable `dgfy_*` database contracts instead of inferring behavior from IMS-shaped legacy tables.
- As a DGFY operator, I can rehearse old-to-new data migration with dry-run, checkpoint, retry, and verification reports before any cutover decision.
- As an existing DGFY vendor or consumer, I continue using the current POS and Storefront while the new database/backend foundation is built beside legacy.
- As a DGFY business owner, I can manage my Product catalog, take POS sales through checkout, and run shifts against the new `dgfy-api`, without depending on the legacy IMS-shared `items` schema.
- As a DGFY consumer, I can browse, order, and track fulfillment of a purchase through the new storefront ordering API, as a guest or a logged-in account.

## Acceptance Criteria

- The migration runner has explicit commands, documented environment contracts, DB-backed execution metadata, and deployment wiring as a one-shot container.
- New DGFY landlord and tenant schema foundations are created beside legacy schemas and verified without requiring legacy schema mutation.
- Old-to-new migration scripts provide dry-run and apply modes with durable checkpoints, deterministic source-to-target ID maps, skipped/conflict reports, and retry proof.
- Backend Accounts, Businesses, and Tenancy APIs are implemented only after the database contract is stable and follow repository-owned Sequelize access.
- Compatibility seams are narrow, documented, temporary, and covered by tests that prove current behavior remains available.

## Definition of Done

- Architecture impact is classified and ADR impact is resolved before cross-boundary work starts.
- `npm run check:architecture` and relevant backend tests pass for implementation phases.
- Migration commands emit machine-readable reports and human-readable summaries.
- Data migration rehearsal proves idempotency, kill/retry behavior, and verification against realistic legacy-shaped data.
- Account, business, tenancy, and migration flows satisfy the hardening requirements in `docs/architecture/ARCHITECTURE_GOVERNANCE.md`.
- Production cutover is not attempted until a separate rehearsal-backed runbook defines abort thresholds and rollback/reopen-on-legacy steps.

## v1 Requirements

Requirements for the initial database-first refactor milestone. Each maps to roadmap phases.

### Migration Runner

- [x] **RUN-01**: Operator can build and run a dedicated migration runner container separately from long-running backend/API containers.
- [x] **RUN-02**: Operator can execute explicit runner commands for schema migration, data migration dry-run, data migration apply, verification, status/reporting, and rollback-plan support.
- [x] **RUN-03**: Runner validates required environment variables, target database names, runtime mode, and destructive-operation flags before connecting to any database.
- [x] **RUN-04**: Runner stores schema/data migration execution metadata in database-backed tables, not local files inside the container.
- [x] **RUN-05**: Runner produces machine-readable report files and concise human-readable summaries for every command.

### Database Foundation

- [x] **DBF-01**: New DGFY landlord schema is created beside legacy/current databases without mutating legacy schemas by default.
- [x] **DBF-02**: DGFY landlord schema contains Accounts, Businesses, Branches, Tenancy registry, tenant database pointers, and migration metadata needed by the first backend scope.
- [x] **DBF-03**: New DGFY tenant schema foundation contains Staff Accounts, Assignments, Terminal identity, and tenant-local ownership metadata needed by the first backend scope.
- [x] **DBF-04**: Schema migrations are additive, repeatable, and tracked by migration metadata with no reliance on `sync({ alter: true })` as the production migration strategy.
- [x] **DBF-05**: Schema verification proves expected tables, columns, indexes, constraints, migration records, and tenant coverage for all targeted `dgfy_*` schemas.

### Data Migration

- [x] **MIG-01**: Source-to-target mapping documentation defines how legacy/current account, tenant, staff, branch/location, and terminal-like records map into DGFY-owned schemas.
- [x] **MIG-02**: Data migration dry-run reports planned inserts, updates, skips, conflicts, orphan records, and tenant coverage without mutating `dgfy_*` data.
- [x] **MIG-03**: Data migration apply mode writes transformed data into `dgfy_*` schemas using durable checkpoints and deterministic legacy-to-DGFY ID maps.
- [x] **MIG-04**: Data migration can be interrupted and safely retried without duplicate records, inconsistent references, or manual cleanup.
- [x] **MIG-05**: Data verification reports compare source and target counts, required relationships, skipped/conflict records, and unresolved data-quality issues.

### Backend Foundation

- [x] **API-01**: Backend exposes Accounts APIs for DGFY account registration/login basics, profile/session lifecycle, and account lookup against the new DGFY schema.
- [x] **API-02**: Backend exposes Businesses APIs for business creation, business selection, branch registry basics, and owner/manager scope using the new DGFY schema. (operator activation mechanism (activate-tenant) built in 04-09; end-to-end DB-backed proof confirmed via human UAT against real MySQL, see 04-UAT.md)
- [x] **API-03**: Backend exposes Tenancy APIs for tenant registry lookup, tenant provisioning metadata, tenant context selection, and tenant session creation. (operator activation mechanism (activate-tenant) built in 04-09; end-to-end DB-backed proof confirmed via human UAT against real MySQL, see 04-UAT.md)
- [x] **API-04**: Tenant session creation requires explicit landlord membership plus tenant-local assignment or authorized scope evidence before tenant-local access is granted.
- [x] **API-05**: Backend modules follow `routes -> controllers -> usecases -> repositories -> models`; controllers stay transport-only and repositories own Sequelize access.
- [x] **API-06**: Account, business, tenancy, and session flows include tests for success, validation failure, duplicate/conflict paths, replay/reuse rejection where applicable, logout/session cleanup, and durable persistence side effects.

### Compatibility And Safety

- [x] **CMP-01**: Existing POS and Storefront behavior remains available while the new database/backend foundation is built beside legacy.
- [x] **CMP-02**: Any legacy code touch is limited to an approved compatibility seam with documented rationale, tests, rollback notes, and removal criteria.
- [x] **CMP-03**: Compatibility adapters, if required, live at API boundaries and do not define canonical DGFY domain contracts.
- [x] **CMP-04**: Release evidence includes architecture checks, migration verification, tenant drift checks, and targeted smoke/contract checks for touched compatibility seams.
- [ ] **CMP-05**: Cutover planning captures rehearsal runtime, realistic data-volume evidence, backup/restore proof, abort thresholds, and reopen-on-legacy steps before production cutover is scheduled.

## v2 Requirements

Committed scope for the v2.0 Commerce Domain milestone. Backend API only (`apps/dgfy-api`), built beside legacy on `dgfy_business_*` schemas — no new frontends, no production data-cutover migration. Each maps to roadmap phases.

### Product Catalog

- [x] **PRD-01**: Business owner can create a Product in Food, Service, or Retail category — category lives on the Product, not the Store, and a Store can mix categories freely.
- [x] **PRD-02**: Business owner can choose Basic Inventory (vendor-set stock count) or non-stock per Product; whether a given sale line decrements stock is decided per sale line (`stock_effect_type`), not fixed on the Product.
- [x] **PRD-03**: Business owner can group Products into folders (e.g., menu categories) for organization.
- [x] **PRD-04**: Every stock-count change (sale, restock, loss, adjustment) is recorded as an append-only Inventory Movement row, never mutated after insert.
- [x] **PRD-05**: New Product and Inventory Movement tables live in `dgfy_business_*` as genuinely new schema — never reusing or foreign-keying into the legacy IMS-shared `items`/`PosTransactionLine` tables.

### Booking

- [x] **BOK-01**: Business owner can mark a Service Product as bookable, with a slot duration and branch-level concurrent capacity.
- [x] **BOK-02**: Consumer or staff can create a Booking against a bookable Service Product; the system blocks a Booking once branch-level capacity for that slot is reached — no individual staff calendar required.
- [x] **BOK-03**: A fulfilled Booking links to the Availment that completes it.

### POS Checkout And Payment

- [x] **CHK-01**: Staff can add Products to an Availment, adjust line-item quantities, and remove lines before finalizing a sale.
- [x] **CHK-02**: The system computes order totals AND cash change server-side (`change_due = cash_received − total`); the client cannot submit an arbitrary total or `change_amount`.
- [x] **CHK-03**: Staff can apply a discount code or a permission-gated manual discount to an Availment, recorded with the applying staff ID and a reason.
- [x] **CHK-04**: Staff can select a payment method (Cash, GCash, Credit Card) per Availment; the system records the method and amount, not a live gateway charge.
- [x] **CHK-05**: A completed Availment produces a receipt reflecting every applied discount and tax, gated by fiscal/compliance state.
- [x] **CHK-06**: An Availment cannot be recorded without an open shift for the cashier and terminal.

### Shift And Cash Drawer

- [x] **SFT-01**: Staff can open a shift with a declared starting cash float; the system enforces one open shift per cashier+terminal at a time (DB-level constraint).
- [x] **SFT-02**: Staff can close a shift; the system computes Expected cash (from sales/refunds/pay-ins/pay-outs) against a cashier-entered Actual count, with a signed Difference.
- [x] **SFT-03**: Every cash-drawer event, including a no-sale drawer pop, is logged.

### Fiscal And Compliance

- [x] **FSC-01**: A tenant/branch has a compliance-mode state reflecting whether required fiscal paperwork is present and verified.
- [ ] **FSC-02**: Checkout, shift opening, and receipt issuance are all gated through one shared compliance policy-engine check, not duplicated per surface. (gaps found 2026-07-12 — compliant_active gate fails open on 5 of 7 evidence signals when omitted, see 08-VERIFICATION.md)
- [x] **FSC-03**: Senior Citizen / PWD discounts are computed server-side per BIR rules (VAT-exclusive base, 20% discount, MEMC group-meal rule) and produce the correct separate receipt lines. (MEMC group-meal rule deferred per 09-CONTEXT.md D-07 — not implemented in Phase 9, tracked separately)

### Storefront Discovery And Online Ordering

- [x] **STF-01**: Consumer can browse and search DGFY stores and Products via the map-based storefront discovery surface.
- [x] **STF-02**: Consumer can view a store's storefront page and add its Products to a cart.
- [x] **STF-03**: Consumer can complete a purchase as a guest (with durable contact info) or as a logged-in DGFY Account, without forced account creation.
- [x] **STF-04**: Consumer can choose pickup or delivery, immediate or scheduled, and a payment method (cash on pickup/delivery, or GCash/Credit Card via PayMongo where available) at checkout.
- [x] **STF-05**: A storefront order is durably recorded on the Landlord side and finalized into the correct tenant's Availment idempotently, safe against an interrupted cross-database write.

### Order Fulfillment And Delivery Coordination

- [x] **FUL-01**: Business staff can view and process incoming online orders.
- [x] **FUL-02**: Staff can progress an order's fulfillment status through a shared core pipeline (placed → confirmed → preparing → ready/out-for-delivery → completed), with handoff steps specific to pickup, delivery, and dine-in.
- [x] **FUL-03**: Staff can manually assign a courier/delivery partner to an order and track courier payout through to fulfillment completion.

## v2.1 Requirements

Committed scope for the v2.1 Legacy Data Migration milestone. Migration-runner-only work (`apps/dgfy-migration-runner`) plus a schema-only touch on `apps/dgfy-api`'s `dgfy_business_*` schema — no new API surface, no new frontend. Closes the empirically-confirmed gap where the existing Accounts/Businesses/Tenancy migration leaves every tenant with zero products, availments, and inventory movements. Each maps to roadmap phases.

### Legacy Migration Scope & Schema Extension

- [x] **LDM-01**: ADR 0029 is amended to remove `items`/`item_folders`/`stock_movements`/`pos_transactions` from `OUT_OF_SCOPE_LEGACY_TABLES`, unblocking every new mapper.
- [x] **LDM-02**: `products` schema is extended with 6 typed columns (`sku_code`, `cost_per_unit`, `vat_type`, `senior_pwd_discount_eligible`, `description`, `unit_of_measure`) plus one `attributes` JSON column, with the 1:1-vs-1:many satellite-table folding design (including `product_composition`/BOM) documented before mapper code is written.
- [x] **LDM-03**: A new `product_embeddings` table exists (one row per product) for carry-over vector storage.
- [x] **LDM-04**: `inventory_movements` gains a natural-key unique index (`business_id`, `reference_type`, `reference_id`) so retries are idempotency-safe.
- [ ] **LDM-05**: `availments` gains an additive `source_system` column, sequenced with the Sales History phase.

### Product & Inventory Migration

- [x] **PIM-01**: `item_folders` → `product_folders` mapper migrates legacy folders before item migration begins.
- [x] **PIM-02**: `items` → `products` mapper migrates the 6 promoted fields plus all 8 satellite tables (including `product_composition`/BOM) folded into `attributes` JSON, with `attributes.barcodes` as an array for the 1:many `ItemBarcode` table.
- [x] **PIM-03**: A documented, reviewed 8-legacy-type → 5-target-type `stock_movements.movement_type` category-remapping decision exists, with `findings` raised for any lossy collapse.
- [x] **PIM-04**: `stock_movements` → `inventory_movements` mapper is idempotency-safe against the append-only target table (skip-if-mapped, never re-insert).
- [x] **PIM-05**: Legacy per-location stock sums into the single `products.stock_count` scalar; `item_location_stocks` migrates as an opening-balance `inventory_movements` row per product, not a direct `stock_count` write.
- [x] **PIM-06**: `item_embeddings` → `product_embeddings` mapper carries vectors over as-is (same model/format, no re-embedding).

### Sales History Migration

- [x] **SHM-01**: `pos_transactions` → `availments` mapper runs after Product/Inventory migration, tagging every migrated row `source_system='legacy_migration'` and carrying the legacy transaction reference.
- [x] **SHM-02**: `pos_transaction_lines` → `availment_items` mapper migrates line-item detail, not just header totals.
- [x] **SHM-03**: Voided/cancelled `pos_transactions` (`status='voided'`) migrate into `availments` with their void status preserved.
- [x] **SHM-04**: Provenance (`source_system`/legacy reference) is tagged at the `inventory_movements`/`availment_items` line level, not just the `availments` header.

### Migration Verification & Validation

- [x] **VER-01**: Dry-run/apply/idempotency-retry/verify wiring covers every new entity type (`product_folder`, `product`, `inventory_movement`, `product_embedding`, `availment`, `availment_item`), reusing the existing checkpoint and `legacy_id_map` mechanisms.
- [x] **VER-02**: Extended per-tenant verification checks record counts *and* sum-by-type totals (not just row counts) for products, inventory movements, embeddings, and availments.
- [ ] **VER-03**: Re-rehearsal against a disposable production-parity environment, against real legacy data volume, proves the migration end-to-end.

### Staff Authentication Model Correction

- [x] **STAFF-01**: Tenant-local staff authentication remains supported in the DGFY tenant schema. A staff user must be able to authenticate to one business without requiring a global DGFY account.
- [x] **STAFF-02**: Linking a tenant-local staff profile to a global DGFY account is optional. When linked, the DGFY account can support unified identity/company switching; when unlinked, tenant-local staff login still works.
- [x] **STAFF-03**: Legacy tenant `users.password_hash`, invitation/setup state, and POS PIN implications have an explicit migration target or intentionally documented reset/reinvite flow; they are not silently discarded.
- [x] **STAFF-04**: ADR 0028, `docs/database/dgfy-foundation.md`, the migration map, schema contracts, and verification gates are amended to replace the current DGFY-only staff invitation assumption with the tenant-local-staff-first model.

## v3 Requirements

Deferred beyond the v2.0 Commerce Domain milestone. Tracked but not in current roadmap.

### Frontend Migration

- **FE-01**: Storefront/POS/Business frontend migration into new dedicated app surfaces (`dgfy-storefront`, `dgfy-pos`, `dgfy-business`) proceeds only after the Commerce Domain backend and compatibility seams prove stable.

### Cutover And Decommissioning

- **CUT-01**: Full production cutover runbook is executed only after repeated realistic rehearsals meet the downtime target and abort threshold — must cover Product/Availment data migration, not just Accounts/Businesses/Tenancy (Phase 7 paused pending this).
- **CUT-02**: Legacy code moves to `.archive` only after parity evidence proves no active runtime depends on it.
- **CUT-03**: Optional SKUpervisor/IMS integration contract (Comprehensive Inventory tier) is defined after DGFY owns its core Commerce schema.

### Payments And Fulfillment

- **PAY-01**: Live payment gateway capture/settlement (full PayMongo integration with webhooks and chargebacks) beyond method-and-amount recording.
- **PAY-02**: 2-way split-tender payments (e.g., cash + GCash) recorded as two Payment rows against one Availment.
- **FUL-04**: Real courier/delivery API integration (Grab, Lalamove, etc.) replacing manual assignment.

### Shift And Cash Drawer (v2.x)

- **SFT-04**: Blind-count shift closing mode (hides Expected cash from the cashier during count).
- **SFT-05**: Automated over/short alerting and cash-variance analytics on top of shift reconciliation data.

### Booking (v3+)

- **BOK-04**: Staff-level appointment calendars (per-staff time slots, skill matching, resource booking) beyond branch-level capacity.

### Legacy Data Migration (v2.x)

- **RPT-01**: Human-readable, plain-language per-tenant migration summary report (e.g. "347 of 350 transactions migrated; 3 skipped: reason X"), extending the existing JSON+summary report pattern. Deferred from v2.1 — not required for fidelity, high trust-building value, add if support/audit workflows show it's needed.
- **EMB-01**: Embedding-model metadata (name/version/timestamp) tagged on carried-over `product_embeddings` vectors. Deferred from v2.1 — doesn't block this migration's fidelity goal, but cheap to add now and expensive to reconstruct later once a second embedding-model generation exists.

### Other

- **LOY-01**: Loyalty points / rewards program.
- **OMC-01**: Multi-channel order routing across external channels (delivery marketplaces, phone orders, kiosk) beyond DGFY's own storefront.
- **BIZ-01**: Co-ownership feature exposure (data model already supports it from Phase 1, feature itself not exposed).

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New frontend apps in v2.0 | Backend/Commerce Domain foundation must stabilize first; current POS and Storefront stay live against the old backend. |
| Product/Availment data-cutover migration in v2.0 | Downstream of this milestone; the real production migration must move Product/Availment data too, not just Accounts/Businesses/Tenancy — Phase 7 stays paused until this domain is proven. |
| N-way arbitrary split-tender payments | Even mature platforms (Square) have real API limits here; disproportionate effort for a sub-100-user base. At most 2-way split is a v2.x candidate. |
| Live courier/delivery API integration (Grab, Lalamove) | Requires per-courier API contracts, webhooks, and payout reconciliation disproportionate to current fulfillment volume; manual assignment matches legacy's own "outbound links" capability. |
| Full staff-level appointment calendars | Materially larger scope than branch-level capacity; ship branch-level first and let usage justify staff-level granularity. |
| Real-time payment gateway processing (actual charge capture at checkout) | Recording payment method/amount is the v2.0 deliverable (matches legacy); live capture/settlement/webhooks/chargebacks is its own project-sized effort. |
| Loyalty points / rewards program | No legacy precedent, no current scope; competes for effort against Commerce Domain parity. |
| Automated cash-variance analytics/alerting | Instrumentation for a scale of cash-handling risk DGFY doesn't have yet at <100 active users. |
| Full multi-channel order routing (delivery marketplaces, kiosk, phone) | DGFY's own storefront is the only order-intake channel in scope; no second channel exists yet to route from. |
| Comprehensive Inventory / external IMS integration | Contract with SKUpervisor/IMS not yet defined technically. |
| Raw-copying legacy schemas | Preserves the IMS coupling this project is intended to remove. |
| Broad legacy cleanup | Risks regressions and merge conflicts while legacy remains the live fallback. |
| Big-bang cutover | Conflicts with Strangler Fig/ADR 0003 migration strategy and lacks rehearsal evidence. |
| Automatic production cutover | Requires a separate rehearsal-backed runbook with abort and rollback proof. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-01 | Phase 1 | Complete |
| RUN-02 | Phase 1 | Complete |
| RUN-03 | Phase 1 | Complete |
| RUN-04 | Phase 1 | Complete |
| RUN-05 | Phase 1 | Complete |
| DBF-01 | Phase 2 | Complete |
| DBF-02 | Phase 2 | Complete |
| DBF-03 | Phase 2 | Complete |
| DBF-04 | Phase 2 | Complete |
| DBF-05 | Phase 2 | Complete |
| MIG-01 | Phase 3 | Complete |
| MIG-02 | Phase 3 | Complete |
| MIG-03 | Phase 3 | Complete |
| MIG-04 | Phase 3 | Complete |
| MIG-05 | Phase 3 | Complete |
| API-01 | Phase 4 | Complete |
| API-02 | Phase 4 | Complete (human UAT confirmed against real MySQL — 04-UAT.md) |
| API-03 | Phase 4 | Complete (human UAT confirmed against real MySQL — 04-UAT.md) |
| API-04 | Phase 4 | Complete |
| API-05 | Phase 4 | Complete |
| API-06 | Phase 4 | Complete |
| CMP-01 | Phase 5 | Complete |
| CMP-02 | Phase 5 | Complete |
| CMP-03 | Phase 5 | Complete |
| CMP-04 | Phase 6 | Complete |
| CMP-05 | Phase 7 | Pending |
| PRD-01 | Phase 8 | Complete |
| PRD-02 | Phase 8 | Complete |
| PRD-03 | Phase 8 | Complete |
| PRD-04 | Phase 8 | Complete |
| PRD-05 | Phase 8 | Complete |
| BOK-01 | Phase 8 | Complete |
| BOK-02 | Phase 8 | Complete |
| BOK-03 | Phase 8 | Complete |
| SFT-01 | Phase 8 | Complete |
| SFT-02 | Phase 8 | Complete |
| SFT-03 | Phase 8 | Complete |
| FSC-01 | Phase 8 | Complete |
| FSC-02 | Phase 8 | Gaps found |
| CHK-01 | Phase 9 | Complete |
| CHK-02 | Phase 9 | Complete |
| CHK-03 | Phase 9 | Complete |
| CHK-04 | Phase 9 | Complete |
| CHK-05 | Phase 9 | Complete |
| CHK-06 | Phase 9 | Complete |
| FSC-03 | Phase 9 | Complete |
| STF-01 | Phase 10 | Complete |
| STF-02 | Phase 10 | Complete |
| STF-03 | Phase 10 | Complete |
| STF-04 | Phase 10 | Complete |
| STF-05 | Phase 10 | Complete |
| FUL-01 | Phase 11 | Complete |
| FUL-02 | Phase 11 | Complete |
| FUL-03 | Phase 11 | Complete |
| LDM-01 | Phase 12 | Complete |
| LDM-02 | Phase 12 | Complete |
| LDM-03 | Phase 12 | Complete |
| LDM-04 | Phase 12 | Complete |
| PIM-01 | Phase 13 | Complete |
| PIM-02 | Phase 13 | Complete |
| PIM-03 | Phase 13 | Complete |
| PIM-04 | Phase 13 | Complete |
| PIM-05 | Phase 13 | Complete |
| PIM-06 | Phase 13 | Complete |
| LDM-05 | Phase 14 | Pending (sequenced with Sales History per its own requirement text, not Phase 12) |
| SHM-01 | Phase 14 | Complete |
| SHM-02 | Phase 14 | Complete |
| SHM-03 | Phase 14 | Complete |
| SHM-04 | Phase 14 | Complete |
| VER-01 | Phase 14 | Pending (spans all 6 entity types incl. availment/availment_item — only fully true once Phase 14 lands) |
| VER-02 | Phase 14 | Pending (spans product- and availment-side sum-by-type checks — only fully true once Phase 14 lands) |
| VER-03 | Phase 14 | Pending (milestone-wide final re-rehearsal proof) |
| STAFF-01 | Phase 13.5 | Complete |
| STAFF-02 | Phase 13.5 | Complete |
| STAFF-03 | Phase 13.5 | Complete |
| STAFF-04 | Phase 13.5 | Complete |

**Coverage:**

- v1 requirements: 26 total — mapped to phases: 26 — unmapped: 0
- v2 requirements: 28 total — mapped to phases: 28 — unmapped: 0
- v2.1 requirements: 22 total — mapped to phases: 22 — unmapped: 0

---
*Requirements defined: 2026-07-10*
*Last updated: 2026-07-14 after inserting Phase 13.5 staff authentication model correction*
