# Architecture Research: Commerce Domain Integration

**Domain:** Product Catalog, POS Checkout & Payment, Shift/Cash-Drawer, Fiscal/Compliance, Storefront Online Ordering, Order Fulfillment/Delivery Coordination — integrated into DGFY's existing Landlord+Tenant, layered backend
**Researched:** 2026-07-12
**Confidence:** HIGH (grounded directly in the live codebase — `apps/dgfy-api/src`, `apps/dgfy-migration-runner/src/schemaContracts`, `backend/src/modules/{pos,compliance,stockMovements}`, ADRs 0003/0024/0029/0034 — not external ecosystem research)

**Supersedes:** the prior v1.0 database-first-refactor ARCHITECTURE.md that lived at this path — that research covered the migration-runner/landlord-tenant foundation, which is now built (Phases 1-6, see PROJECT.md). This document is scoped to the v2.0 Commerce Domain milestone: how new commerce modules integrate with the now-stable foundation.

## Standard Architecture

### System Overview

The v2.0 Commerce Domain is new module code inside **`apps/dgfy-api`** (not `backend/`). Phases 1-6 already proved this pattern for Accounts/Businesses/Tenancy; Commerce Domain extends the same shape rather than inventing a new one.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ apps/dgfy-api (Express)                                                    │
│  routes -> controllers -> usecases -> repositories -> models               │
├───────────────────────────────────────────────────────────────────────────┤
│ EXISTING MODULES (Phase 4/5)          │ NEW COMMERCE MODULES (v2.0)        │
│  modules/accounts        (Landlord)   │  modules/products      (Tenant)    │
│  modules/businesses       (Landlord+  │  modules/inventory     (Tenant)    │
│                             Tenant    │  modules/booking       (Tenant)    │
│                             writes    │  modules/shifts        (Tenant)    │
│                             via       │  modules/compliance    (Tenant)    │
│                             TenantCon-│  modules/availment      (Tenant,   │
│                             nector)   │    checkout+fulfillment core)      │
│  modules/dgfyAuth (LEGACY COMPAT      │  modules/storefrontOrdering        │
│    PROXY — points at legacy           │    (Landlord Account +             │
│    sku_inventory_manager,             │     Tenant Availment/Booking)      │
│    slated for removal)                │  modules/fulfillment/delivery      │
├───────────────────────────────────────────────────────────────────────────┤
│ infra/tenantConnector.js — per-tenant Sequelize connection + model cache    │
│ middleware/tenantContextResolver.js — resolves req.tenantContext/Models    │
│   (built Wave 4, UNMOUNTED — Storefront Ordering is its first real caller)│
├───────────────────────────────────────────────────────────────────────────┤
│ dgfy_core (Landlord)                  │ dgfy_business_* (one per Tenant)   │
│  accounts, businesses,                │  locations, staff_accounts,        │
│  business_memberships,                │  account_staff_assignments,        │
│  business_database_registry,          │  terminal_identities,              │
│  storefront_discovery_index           │  + NEW: products, availments,      │
│                                        │    availment_items,                │
│                                        │    availment_stage_events,         │
│                                        │    inventory_movements, bookings,  │
│                                        │    shifts, cash_drawer_events,     │
│                                        │    compliance_mode_state           │
└───────────────────────────────────────────────────────────────────────────┘
        (separate, untouched)  backend/ (legacy Express, sku_inventory_manager,
                                Item/PosTransaction/StockMovement/PosTerminalShift/
                                compliancePolicyEngine — reference precedent only,
                                current live POS/Storefront frontends still call this)
```

**Two live backends, one direction of travel.** `backend/` is the legacy modular monolith still serving the current POS/Storefront frontends against `sku_inventory_manager` — Commerce Domain does not touch it, per PROJECT.md's "no legacy edits except approved seams." `apps/dgfy-api` is the new, IMS-schema-free backend built against `dgfy_core`/`dgfy_business_*`. Commerce Domain v2.0 is new module code inside `apps/dgfy-api`, following the exact folder shape `modules/accounts`, `modules/businesses`, and `modules/dgfyAuth` already established: `modules/<name>/{controllers,entities,repositories,routes.js,usecases,index.js}`.

**Critical existing-codebase fact that changes the "customer_account_id" answer:** `apps/dgfy-api/src/modules/dgfyAuth` (`DgfyAccount` model, table `dgfy_accounts`) is a **legacy compatibility proxy** pointed at `sku_inventory_manager`, explicitly commented in `apps/dgfy-api/src/config/db.js` as "slated for removal in Phase 5." The canonical, forward DGFY Account for Commerce Domain purposes is `apps/dgfy-api/src/models/Landlord/Account.js` (`dgfy_core.accounts`), exposed through `modules/accounts`. Any `customer_account_id` on AVAILMENT/BOOKING must resolve against **this** Account, not `dgfyAuth`'s proxy model.

### Component Responsibilities

| Component | Responsibility | Existing / New |
|-----------|----------------|-----------------|
| `modules/products` | Product identity, category (Food/Service/Retail), stock-vs-non-stock setting, folders/grouping, availability toggle | New |
| `modules/inventory` | Owns `INVENTORY_MOVEMENT` ledger writes (sale/restock/loss/adjustment); only module allowed to write stock balance effects | New |
| `modules/booking` | `BOOKING` entity, slot capacity check against Product's `slot_duration_minutes`/`concurrent_capacity` | New |
| `modules/shifts` | Shift open/close, cash-drawer event log, close-time reconciliation; one-open-shift-per-terminal invariant | New |
| `modules/compliance` | Compliance-mode state machine + a narrow gate port called by other modules' usecases | New (fresh build, not a port of `backend/src/modules/compliance` — see Pattern 1) |
| `modules/availment` | `AVAILMENT`/`AVAILMENT_ITEM`/`AVAILMENT_STAGE_EVENT`; POS checkout usecases; requests (not performs) stock effects from `modules/inventory` | New |
| `modules/storefrontOrdering` | Cart, guest-or-account checkout, cross-DB Account resolution, writes into tenant Availment/Booking | New — first module to legitimately touch both Landlord and Tenant repositories in one usecase |
| `modules/fulfillment` (or folded into `modules/availment`) | Order status updates, `AVAILMENT_STAGE_EVENT` full lifecycle, manual delivery/courier assignment, payout tracking | New |
| `infra/tenantConnector.js` | Per-tenant Sequelize connection cache + tenant model registry (`getModels(databaseName)`) | Existing — extend `getModels()`'s `modelDefiners` map with every new Tenant model |
| `middleware/tenantContextResolver.js` | Resolves `req.tenantContext`/`req.tenantModels` from `x-business-id` header + membership check | Existing, built but **unmounted** — Commerce Domain (specifically Storefront Ordering and any tenant-scoped POS route) is its first real caller |
| `modules/accounts/repositories/accountRepository.js` | Landlord Account lookup/validation | Existing — gains a new external caller (`storefrontOrdering` usecase), not modified internally |
| `apps/dgfy-migration-runner/src/schemaContracts/dgfyBusinessContract.js` | Authoritative tenant-schema contract the runner verifies against | Existing — extend with every new tenant table |

## Recommended Project Structure

```
apps/dgfy-api/src/
├── models/
│   ├── Landlord/                  # unchanged this milestone (Account, Business, ...)
│   └── Tenant/
│       ├── Product.js             # NEW
│       ├── Availment.js           # NEW
│       ├── AvailmentItem.js       # NEW
│       ├── AvailmentStageEvent.js # NEW — insert-only (see Pattern 2)
│       ├── InventoryMovement.js   # NEW — insert-only (see Pattern 2)
│       ├── Booking.js             # NEW
│       ├── Shift.js               # NEW
│       ├── CashDrawerEvent.js     # NEW — insert-only
│       └── ComplianceModeState.js # NEW
├── modules/
│   ├── products/{controllers,entities,repositories,routes.js,usecases,index.js}
│   ├── inventory/{...}            # owns InventoryMovement writes only
│   ├── booking/{...}
│   ├── shifts/{...}
│   ├── compliance/{...}           # exposes the compliance gate PORT, see Pattern 1
│   ├── availment/{...}            # checkout usecases call compliance + inventory ports
│   ├── storefrontOrdering/{...}   # calls modules/accounts (Landlord) + tenant Availment/Booking
│   └── fulfillment/{...}
├── infra/tenantConnector.js       # extend getModels()'s modelDefiners map
└── middleware/tenantContextResolver.js  # mount on all Commerce routes needing tenant DB access
```

### Structure Rationale

- **One module per bounded concern, mirroring `modules/accounts`/`modules/businesses` exactly** — not one giant `modules/commerce` — so ADR-0029-style ownership boundaries (below) are enforced by *which module's repository* is allowed to write a table, not by convention alone.
- **`modules/inventory` and `modules/compliance` are deliberately separate from `modules/availment`/`modules/products`**, even though they'll be called constantly by checkout — this is what makes rule (a) below ("gate without scattering") and rule (b) below (single writer of the stock ledger) enforceable rather than aspirational.

## Architectural Patterns

### Pattern 1: Fiscal/Compliance gating sits in the use-case layer, behind a narrow injected port — not middleware, not scattered per-call checks

**What:** A `modules/compliance` module exposes one stable function, e.g. `assertComplianceGate({ businessId, operation })` where `operation` is a small closed enum (`checkout`, `receipt_render`, `shift_open`, `shift_close`). Every gated usecase (`availment` checkout usecase, receipt-render usecase, `shifts` open/close usecases) takes this as an injected dependency (constructor/factory param) and calls it as the first line of the usecase body, inside the same function that will go on to touch repositories — never in a controller, never as global route middleware.

**Why this exact placement, not the two obvious alternatives:**
- *Not route middleware*, because the gate's meaning is operation-specific (`shift_close` allows different states than `checkout`), and middleware would either (a) need per-route configuration that duplicates the usecase's own knowledge of what it's about to do, or (b) become one giant "is this business compliant" gate blind to which operation is being attempted — exactly the "scattered cross-cutting concern" the question warns about, just moved one layer up instead of solved.
- *Not scattered ad hoc checks per line of business logic*, because that's what the question is worried about, and it's also what would happen if every module independently imported `compliancePolicyEngine`-equivalent logic.
- *Use-case layer, behind a port*, because `ARCHITECTURE_BOUNDARIES.md` already assigns "business logic belongs in use-cases" — a gate is business logic (it can change checkout's *outcome*, not just observe it) — and because this exactly matches the **existing, working precedent**: `backend/src/modules/pos/usecases/posUseCases.js` already calls into compliance-readiness logic from inside its own usecase functions (`resolvePosScanBlockedReason`, `complianceError` handling), not from middleware. Commerce Domain should keep that placement, just make the port an injected dependency instead of a direct import, so `modules/availment`/`modules/shifts` never import `modules/compliance` internals directly (mirrors the Dependency Inversion pattern already used by `buildTenantContextResolver`/`accountAuthMiddleware`).

**Trade-offs:** Every gated usecase needs the port wired at construction time (one extra constructor arg) — slightly more boilerplate than a blanket middleware, but it keeps the gate testable in isolation (inject a stub) and keeps `modules/compliance` as the single place the state machine and reason codes live, satisfying "without becoming a scattered cross-cutting concern."

**Example:**
```typescript
// modules/compliance/index.js
export const buildComplianceGate = ({ complianceStateRepository }) => ({
  async assertComplianceGate({ businessId, operation }) {
    const state = await complianceStateRepository.findByBusinessId(businessId);
    const decision = evaluateComplianceDecision(state, operation); // pure policy fn
    if (decision.blocked) {
      throw new ComplianceGateError(decision.reasonCode, decision.message);
    }
  }
});

// modules/availment/usecases/checkoutUseCase.js
export const buildCheckoutUseCase = ({ availmentRepository, inventoryPort, complianceGate }) =>
  async function checkout(input) {
    await complianceGate.assertComplianceGate({ businessId: input.businessId, operation: 'checkout' });
    // ...proceed to compute totals, write Availment, request stock effects
  };
```

### Pattern 2: Append-only event history — dedicated insert-only Sequelize models per event type, not a generic event table

**What:** `AVAILMENT_STAGE_EVENT` and `INVENTORY_MOVEMENT` are each their own strongly-typed Sequelize model, owned by the module responsible for that ledger (`modules/availment` for stage events, `modules/inventory` for movements). Each model:
1. Declares `timestamps: true, updatedAt: false` — the exact technique already proven in `backend/src/models/StockMovement.js` (line 85: `updatedAt: false`) for the equivalent legacy pattern.
2. Adds a `beforeUpdate`/`beforeBulkUpdate` hook that throws, as defense-in-depth — omitting `updatedAt` stops Sequelize from auto-touching a column, but it does not, by itself, block an explicit `.update()` call; Sequelize's own hook system (`beforeUpdate`, `beforeBulkUpdate`) is the documented mechanism for intercepting and rejecting lifecycle events (confirmed against current Sequelize v6 docs — this repo pins `sequelize@^6.37.8`).
3. Is exposed through its module's repository with **only** `create`/`bulkCreate`/`findAll`/`findOne` methods — no `update`, no `destroy` — so the "repository owns Sequelize access" rule itself becomes the enforcement point: nothing outside that repository can reach the model to mutate a row, by construction.
4. Writes its insert **in the same DB transaction** as the denormalized "current state" cache on its parent row (`AVAILMENT.status`/`fulfillment_stage`; a derived stock balance) — so cache and ledger cannot drift, exactly matching the domain doc's "cache of this table, not a parallel source of truth."

**Why not a generic `entity_type + payload JSON` event table:** it would (a) lose column-level typing/validation Sequelize gives per-model, (b) force every reader to know the JSON shape per `entity_type` rather than relying on the ORM, (c) fight the "data access belongs in repositories" rule by making one repository serve every event kind, and (d) contradicts the two tables' actually-different column sets already fixed in the domain doc (`AVAILMENT_STAGE_EVENT` has `status`/`fulfillment_stage`/`changed_by`/`reason`; `INVENTORY_MOVEMENT` has `movement_type`/`quantity_delta`/`value_per_unit`/`currency` — genuinely different shapes, not the same event dressed differently).

**Trade-offs:** Two extra models/migrations instead of one generic table — a small amount of duplication in "define an insert-only Sequelize model" boilerplate, worth extracting into a tiny shared model-factory helper (`defineInsertOnlyModel(sequelize, name, attrs, opts)`) once a third insert-only table shows up (cash-drawer events).

**Example:**
```typescript
// models/Tenant/InventoryMovement.js
export default (sequelize) => {
  const InventoryMovement = sequelize.define('InventoryMovement', { /* columns */ }, {
    tableName: 'inventory_movements',
    underscored: true,
    timestamps: true,
    updatedAt: false,       // matches backend/src/models/StockMovement.js precedent
    hooks: {
      beforeUpdate: () => { throw new Error('InventoryMovement rows are insert-only.'); },
      beforeBulkUpdate: () => { throw new Error('InventoryMovement rows are insert-only.'); }
    }
  });
  return InventoryMovement;
};
```

### Pattern 3: Storefront order crosses Landlord/Tenant with application-level resolution, never a DB-level FK — mirrors `customer_account_id`, no 2PC

**What:** `customer_account_id` on AVAILMENT/BOOKING is a plain UUID column in the tenant `dgfy_business_*` schema with **no** database foreign-key constraint (MySQL cannot enforce a cross-database FK across `dgfy_core` and `dgfy_business_*` even if co-located on one server, and tenant databases must stay independently provisionable/droppable). Referential integrity is enforced entirely at the application layer, in one specific place: the `storefrontOrdering` checkout usecase, which is the **first** usecase in the whole codebase to legitimately call both a Landlord repository (`modules/accounts/repositories/accountRepository.findById`) and a Tenant repository (`modules/availment`'s Availment/Booking repository, resolved through `tenantConnector`) in a single call.

**Sequence:**
1. Resolve landlord identity — either an authenticated DGFY Account (`req.account`, from the *canonical* `modules/accounts`, not `dgfyAuth`'s legacy proxy) or explicit guest checkout (no account).
2. If an account is present, validate it exists/is active via `accountRepository` (Landlord DB read) *before* touching the tenant DB.
3. Resolve `tenantContext`/tenant DB connection via `tenantContextResolver` middleware (already built in Wave 4, currently unmounted — this is its first real caller) keyed off the Business being ordered from (e.g. from the storefront page's business id).
4. Write the Availment/Booking row into the tenant DB with `customer_account_id` set from the validated (or null, for guest) landlord id.
5. No distributed transaction across the two databases — accept the same eventual-consistency/orphan-reference posture the domain doc already flags as a known, accepted limitation ("resolving and validating it needs an application-level lookup rather than a DB constraint"). This mirrors the legacy system's own proven precedent: ADR 0024 already ships a nullable `dgfy_account_id` on tenant-local `store_customers` with app-level linkage plus email fallback, not a DB constraint — same posture DGFY should reuse deliberately.

**Guest checkout implication:** BOOKING's domain doc explicitly says `customer_account_id` "isn't optional the way it can be elsewhere" (need a way to reach the customer) — but Reconciliation §2 confirms the legacy system's guest checkout genuinely works with zero DGFY Account. Resolve this by adding guest-contact snapshot columns (`guest_name`/`guest_phone`/`guest_email`) alongside a **nullable** `customer_account_id` on BOOKING, so a booking can always reach its customer even without an account — do not make `customer_account_id` non-null on BOOKING; that would silently break guest checkout parity, a Validated requirement.

**Trade-offs:** No cross-database transactional guarantee — a landlord Account soft-delete after an order was placed leaves a (deliberately accepted) orphaned reference in tenant data, same as production legacy behavior today. Do not attempt cross-database FKs, database links, or 2PC — that complexity is not justified at this system's scale and actively works against the Landlord/Tenant database-independence property the platform is built on (ADR/Part 1 §9).

### Pattern 4: Ownership boundaries inside Commerce Domain — mirror ADR 0029's "request effects vs. record effects" rule internally

**What:** ADR 0029 (legacy, `backend/`) already establishes the correct shape for exactly this problem — "POS and Storefront may request stock effects. Only Inventory records stock effects." Commerce Domain should adopt the identical rule as an internal contract between its own new modules, not just as legacy precedent to read about: `modules/availment` (checkout) and `modules/storefrontOrdering` and `modules/booking` must never write `INVENTORY_MOVEMENT` rows directly — they call a narrow `modules/inventory` usecase (`recordSaleEffect`, `recordLoss`, etc.) that is the only writer. Same pattern for `AVAILMENT_STAGE_EVENT`: `modules/fulfillment`/delivery-coordination usecases request a stage transition; `modules/availment`'s own repository is the only writer of that ledger.

**Why:** this is the same shape as Pattern 1 (compliance) and Pattern 2 (ledgers) applied consistently — one clear owner per mutable/append-only resource, everyone else calls a port. It also directly prevents re-introducing the "DGFY and SKUpervisor share schema" failure mode (Reconciliation §1) inside the *new* system: if every module could reach into every table, Commerce Domain would just reinvent the coupling problem this whole refactor exists to remove.

**Trade-off:** more usecase-to-usecase calls across module boundaries than a naive "one module, one big usecase file" design — acceptable, and it's exactly the shape `modules/businesses`'s Wave-based build already used successfully (locationUseCases calling into businessDatabaseRegistryRepository, tenantSessionUseCases calling into tenantRegistryUseCases, etc.).

## Data Flow

### POS Checkout Request Flow

```
POS terminal request (has open Shift, per Pattern 4's Shift precedent)
    ↓
routes/availment.js -> checkoutController (transport only)
    ↓
availment/usecases/checkoutUseCase (injected: complianceGate, inventoryPort, shiftPort)
    ↓ 1. complianceGate.assertComplianceGate({ operation: 'checkout' })   [Pattern 1]
    ↓ 2. shiftPort.assertOpenShift(terminalId)
    ↓ 3. compute totals server-side (never trust client change_amount — Reconciliation §6)
    ↓ 4. availmentRepository.create(Availment + AvailmentItem rows, one DB transaction)
    ↓ 5. inventoryPort.recordSaleEffect(...) for each stock_effect_type='inventory_issue' line [Pattern 4]
    ↓ 6. availmentRepository writes first AVAILMENT_STAGE_EVENT row in the same transaction [Pattern 2]
    ↓
Response (receipt) ← receiptUseCase also calls complianceGate({ operation: 'receipt_render' })
```

### Storefront Order Request Flow (Landlord/Tenant crossing)

```
DGFY Account (or guest) browses a Business's storefront page
    ↓
authenticateDgfyAccount-equivalent (canonical modules/accounts, NOT dgfyAuth proxy) -> req.account (optional)
    ↓
tenantContextResolver({ required: true }) keyed by business_id from the storefront URL  [first real mount]
    ↓ resolves req.tenantContext.databaseName via BusinessDatabaseRegistry (Landlord read)
    ↓ resolves req.tenantModels via tenantConnector.getModels(databaseName)              [Pattern 3]
    ↓
storefrontOrdering/usecases/placeOrderUseCase
    ↓ 1. if req.account present: accountRepository.findById (Landlord read, validate active)
    ↓ 2. else: guest path, capture guest contact snapshot                                [Pattern 3]
    ↓ 3. availment/booking repository (Tenant write) with customer_account_id set/null
    ↓ 4. same downstream chain as POS checkout (inventory effects, stage events)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| MVP / beta (<100 businesses) | Current per-request `tenantContextResolver` + `tenantConnector` connection cache is sufficient; no eviction/pooling changes needed (matches the deliberate "no periodic idle-eviction timers" decision already documented in `tenantConnector.js`). |
| Growth (hundreds of tenants, higher order volume) | `INVENTORY_MOVEMENT`/`AVAILMENT_STAGE_EVENT` are append-only and will grow fastest — add the domain doc's already-flagged future optimization (materialized daily-summary tables) only once real query latency is observed, not ahead of need. `tenantConnector`'s per-database connection cache will need the idle-eviction logic the legacy `TenantConnector` already has (explicitly deferred) once concurrent open tenant connections becomes real pressure. |
| Storefront-heavy traffic | `storefront_discovery_index` (Landlord) already exists as a read-optimized projection for browse/search — Commerce Domain's Product catalog should feed this index the same way, rather than the Storefront browse path querying tenant databases directly per request. |

## Anti-Patterns

### Anti-Pattern 1: Building Product against (or borrowing identity from) legacy `items`

**What people do:** Reach for the legacy `Item`/`items` table as a shortcut ("it already has cost price, senior/PWD eligibility, category") since Reconciliation §2 shows those fields already exist there.
**Why it's wrong:** Reconciliation §1 is explicit — `items` is IMS-shared schema, the exact coupling this whole refactor exists to remove. Any FK or read dependency from a new `dgfy_business_*.products` table into legacy `items` reintroduces the "DGFY was grown inside SKUpervisor's schema" problem inside the *new* system.
**Do this instead:** Build `products` fresh in `dgfy_business_*`, informed by (not backed by) the legacy fields' proven shape — copy the *field list* (cost price, senior/PWD eligibility), not the table.

### Anti-Pattern 2: Trusting client-declared payment/change data

**What people do:** Accept `change_amount`/`payment_status` as sent by the POS client, matching legacy's confirmed behavior (Reconciliation §6: "Change calculation is entirely client-side, with no server-side check"; "`payment_status` is client-declared for non-QR-Ph payments").
**Why it's wrong:** This is a documented, real correctness/security gap in the current system, not a pattern to preserve.
**Do this instead:** New `availment` checkout usecase computes `change_amount` server-side from `cash_received - total_amount` and treats non-gateway payment confirmation as a distinct, explicitly-recorded event rather than an unverified client flag.

### Anti-Pattern 3: A single generic "Payment" concept name colliding with tenant billing

**What people do:** Name a new entity `Payment`.
**Why it's wrong:** Reconciliation §6 flags that a `Payment` model already exists and means *tenant subscription billing*, not order payment — a real naming collision risk carried over from the legacy system's Business/Tenant billing block.
**Do this instead:** Name Commerce Domain's payment concept something unambiguous (`AvailmentPayment`, `CheckoutPayment`) — never bare `Payment` anywhere in `apps/dgfy-api`.

### Anti-Pattern 4: Mounting `tenantContextResolver` loosely / duplicating tenant-resolution logic

**What people do:** Each new Commerce module writes its own "resolve business_id header, look up registry, get tenant connection" logic inline, since `tenantContextResolver` has never had a real caller yet.
**Why it's wrong:** Recreates per-module tenant-resolution drift and bypasses the membership/registry checks already centralized in the resolver.
**Do this instead:** Every new tenant-scoped Commerce route mounts the existing `tenantContextResolver({ required: true })` middleware and reads `req.tenantContext`/`req.tenantModels` — this is precisely the infrastructure Wave 4 built ahead of need for this milestone.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `modules/availment` (checkout) ↔ `modules/inventory` | Injected usecase port (`inventoryPort.recordSaleEffect`) | Never direct repository access — Pattern 4 |
| `modules/availment`/`modules/shifts`/`modules/fulfillment` ↔ `modules/compliance` | Injected usecase port (`complianceGate.assertComplianceGate`) | Pattern 1 |
| `modules/storefrontOrdering` ↔ `modules/accounts` (Landlord) | Direct repository call, read-only (`accountRepository.findById`) — Landlord data stays read-only from a Tenant-writing usecase | Pattern 3 |
| `modules/storefrontOrdering`/POS routes ↔ `middleware/tenantContextResolver` | Express middleware, mounted per-route | First real mount of Wave-4-built infra |
| `modules/products`/`modules/booking`/`modules/availment` ↔ `infra/tenantConnector.js` | `tenantConnector.getModels(databaseName)` model registry | Extend existing `modelDefiners` map, don't build a parallel connector |
| Commerce Domain (`apps/dgfy-api`) ↔ legacy `backend/` | **None** this milestone | Existing frontends keep calling `backend/`; no compat seam needed unless a specific narrow read is later justified under ADR 0003 |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| PayMongo (storefront QR Ph payments) | Out of this research's depth — legacy precedent exists (`backend/`, ADR 0027) for gateway split-settlement; PROJECT.md scopes "payment method selection... PayMongo where available" as v2.0 target, not yet designed here | Flag for phase-specific research when the payment phase is planned |

## Suggested Build Order (dependency-driven)

```
1. Product Catalog + Basic Inventory ledger  ─┐  (nothing else has a product_id to reference)
                                                │
2. Shift & Cash Drawer  ──(parallel with 1)───┤  (only needs existing Business/Location/StaffAccount/
                                                │   TerminalIdentity — no Product dependency)
3. Booking  ──(after 1, parallel with 2)──────┤  (needs bookable-Service Products)
                                                │
4. Fiscal/Compliance policy engine + gate port ┤  (no data dependency; build the port contract
   ──(parallel with 1-3)──────────────────────┘   before Checkout usecases are written, not after)
            ↓
5. POS Checkout & Payment (Availment/AvailmentItem)  — depends on 1 (Product), 2 (Shift, for
   terminal/cashier attach + gating precondition), 4 (compliance gate)
            ↓
6. Storefront Discovery & Online Ordering — depends on 1 (catalog to browse), 5 (Availment shape
   to write into); FIRST real Landlord↔Tenant crossing — budget extra risk/time (Pattern 3)
            ↓
7. Order Fulfillment & Delivery Coordination — depends on 5 (and mainly 6, since online orders
   are its primary source, though POS-originated delivery/pickup also applies) — full
   AVAILMENT_STAGE_EVENT lifecycle + manual delivery/courier assignment (ADR 0034 precedent)
```

**Why Fiscal/Compliance is sequenced 4th, not last:** its policy engine and state machine have zero data dependency on Product/Availment — but its *gate port contract* (Pattern 1) needs to exist and be stable before Checkout(5)/Shift(2)-close usecases are written against it, so build it in parallel with 1-3 and have it ready by the time 5 starts, rather than retrofitting gating into already-built checkout logic.

**Why Storefront Ordering is its own phase, not folded into Checkout:** it's the only place in the new system that legitimately crosses Landlord and Tenant databases in one usecase (Pattern 3) — genuinely new risk surface (first mount of `tenantContextResolver`, first cross-DB application-level resolution), not just "checkout with a different UI."

## Open Decisions This Research Surfaces (not resolved here — flag for roadmap/phase planning)

1. **Fulfillment status shape:** domain doc's two-field `status`+`fulfillment_stage` (with `AVAILMENT_STAGE_EVENT` as source of truth) vs. legacy's proven single-field `fulfillment_status` state machine (Reconciliation §4). This research assumes the two-field/event-sourced design (it directly satisfies the milestone's explicit AVAILMENT_STAGE_EVENT requirement) but this is a real design decision the roadmap should confirm, not assume.
2. **Stock effect placement:** per-sale-line `stock_effect_type` (domain doc, matches legacy reality per Reconciliation §4) — already effectively decided by both documents agreeing; low risk.
3. **Compliance-mode state ownership:** legacy compliance state lives on the Business/Tenant billing-adjacent block (Reconciliation §3, not yet in `dgfy_core`'s `Business` model). Confirm whether v2.0's `ComplianceModeState` is Landlord-scoped (on `dgfy_core.businesses`) or Tenant-scoped (`dgfy_business_*`) before building `modules/compliance` — this research assumes Tenant-scoped (compliance gates tenant-local operations: checkout, shift, receipts) but the state itself may need to live wherever `Business` billing state ends up.

## Sources

- `apps/dgfy-api/src/infra/tenantConnector.js`, `apps/dgfy-api/src/middleware/tenantContextResolver.js`, `apps/dgfy-api/src/models/Landlord/Account.js`, `apps/dgfy-api/src/modules/dgfyAuth/models/DgfyAccount.js`, `apps/dgfy-api/src/config/db.js` — current dgfy-api implementation (HIGH confidence, primary source)
- `backend/src/models/StockMovement.js`, `backend/src/modules/compliance/usecases/complianceUseCases.js`, `backend/src/modules/pos/usecases/posUseCases.js`, `backend/src/models/PosTerminalShift.js` — legacy proven patterns used as precedent, not integration targets (HIGH confidence, primary source)
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/adr/0003-migration-facade-strategy.md`, `docs/architecture/adr/0029-catalog-inventory-pos-storefront-ownership-boundaries.md`, `docs/architecture/adr/0034-manual-delivery-job-foundation.md`, `docs/architecture/adr/0024-front-facing-dgfy-customer-account.md` — authoritative governance and precedent ADRs (HIGH confidence, primary source)
- `refactor-do-not-commit/DGFY_Domain_02_Product.md` §9-10 — target ER shape (HIGH confidence, project-provided)
- `refactor-do-not-commit/DGFY_Plan_vs_Reality_Reconciliation.md` §1-6 — plan-vs-reality gap findings (HIGH confidence, project-provided)
- `.planning/PROJECT.md` — milestone scope, constraints, phase history (HIGH confidence, project-provided)
- Sequelize v6 official docs (Context7 `/sequelize/website`) — hooks (`beforeUpdate`/`beforeBulkUpdate`) as the correct mechanism for blocking updates on insert-only models (HIGH confidence, official docs; repo pins `sequelize@^6.37.8`)

---
*Architecture research for: DGFY Commerce Domain (v2.0 milestone)*
*Researched: 2026-07-12*
