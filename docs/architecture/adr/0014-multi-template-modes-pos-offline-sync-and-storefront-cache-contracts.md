---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-04-27
last_reviewed: 2026-10-26
review_by: 2026-10-27
applies_to: architecture_decision
topic: multi_template_modes_pos_offline_sync_and_storefront_cache_contracts
---

# ADR 0014: Multi-Template Modes, POS Offline Replay Hardening, and Storefront Cache Contracts

## Status
Accepted (2026-04-27)

## Context
The platform now targets expanded operational templates across business types while preserving existing manufacturing/MSME route-gating behavior and non-destructive tenant upgrades.

Three contract gaps were identified:
1. Workflow modes were expanded, but item/product wizard defaults and POS runtime defaults were not yet template-driven from one registry.
2. POS terminal offline replay relied on local browser storage and lacked deterministic replay states, retry governance, and manual resolution tooling.
3. Storefront discovery/catalog high-read paths lacked explicit HTTP cache contracts and Redis cache-aside acceleration for read-heavy queries.

These concerns span frontend UI/UX contracts, backend API behavior, and operational performance controls.

## Decision
Adopt a cross-layer hardening contract in three parts:

1. Business mode templates
- Keep backward-compatible family semantics (`manufacturing` vs `msme`) for legacy gates.
- Add a centralized template registry for the expanded mode set (`retail`, `services`, `manufacturing`, `food_manufacturing`, `fnb`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`, `msme`).
- Drive item/product wizard defaults and POS defaults from the template registry while keeping tenant assignment policy manual.

2. POS offline replay hardening
- Replace fragile local-only queue behavior with durable IndexedDB queue storage and localStorage fallback compatibility.
- Standardize client replay statuses:
  - `queued`
  - `replaying`
  - `replayed`
  - `failed_manual_resolution_required`
- Enforce deterministic retry/backoff policy with max retry attempts and manual-resolution transition for unrecoverable failures.
- Add operator-visible Sync Queue console for filtering, replay, retry-now, and mark-resolved actions.
- Add Service Worker background sync hook (`sync` tag: `pos-terminal-operation-replay`) with graceful fallback to connectivity events.

3. Storefront read-path cache contracts
- Set explicit HTTP `Cache-Control` headers for public discovery/catalog read routes.
- Enforce `no-store` on checkout/order and authenticated mutation routes.
- Add Redis cache-aside for discovery list/profile read responses using tenant/filter/geo-bucket-aware keys with short TTL.

## Consequences
1. Expanded business templates become configuration-driven without destructive migration to legacy route logic.
2. POS offline replay becomes production-strong with durable queue state, explicit operator workflow, and deterministic retry behavior.
3. Discovery and catalog read performance improve under load with bounded cache staleness and explicit cache semantics.
4. Additional maintenance is required for queue schema evolution and template registry updates.

## Offline Checkout Experience Addendum (2026-07-10)

- Offline selling is allowed only after a terminal has been authenticated online and has a scoped local catalog snapshot for that terminal, location, and user. Offline login is not supported.
- The local snapshot is limited to catalog and receipt identity data. Reports, settings, item maintenance, account credentials, and remote payment operations remain online-only.
- Offline checkout is limited to cash and non-governed discounts. Each queued sale creates an immediate provisional `Pending Sync` order preview and cannot be printed as a final fiscal receipt until replay succeeds.
- The terminal reserves cached stock immediately for stock-bearing items. The server remains authoritative during replay and handles idempotency/conflicts using the existing checkout idempotency key.
- Replay is operator-controlled: no reconnect, page-load, retry, or service-worker event may submit queued records. The terminal's `Sync All Pending Records` action is the only replay path, replays checkout and operational records together, and is limited to two presses per terminal/user local day.
- Offline reports are read-only cached estimates keyed by terminal scope and report filters. Offline item creation is restricted to data-only drafts; uploads and final server validation happen during the manual sync. Because the item API has no idempotency contract, an uncertain item-create result must stop in manual resolution rather than retry automatically.

## Guardrails
1. Existing family-gated behavior (`manufacturing` vs `msme`) remains source-of-truth for route visibility.
2. Payment portal implementation remains out of scope; only non-payment order lifecycle hardening is included.
3. Checkout/mutation endpoints must remain non-cacheable (`no-store`).
4. Idempotency conflict and blocked replay behavior must remain deterministic across POS mutation endpoints.
5. New or promoted workflow modes must prove tenant provisioning before readiness. Every tenant-local model/table and tenant-local foreign key introduced by a mode must be included in the tenant model clone graph, covered by tenant model factory tests, and verified with a disposable tenant schema sync across all `WORKFLOW_MODE_VALUES`.
6. Approval and auto-approval provisioning failures must restore a valid retryable landlord lifecycle state. Mode work must not introduce invalid transient tenant statuses or leave failed approvals stuck outside the documented approval/rejection flow.

## Rollback Notes
1. UI rollback can hide Sync Queue surfaces while preserving queued records.
2. Runtime rollback can disable Service Worker sync and rely on online/offline replay fallback.
3. Discovery/profile Redis cache-aside can be disabled by Redis unavailability without API contract break.
4. Template registry rollback can fall back to family defaults (`manufacturing`/`msme`) without data loss.

## Mode-Aware Item Taxonomy And UOM Addendum (2026-05-06)

Item and UOM defaults are now governed by a corrected-mode taxonomy instead of a binary MSME/non-MSME branch.

- Corrected item-taxonomy modes are `food_manufacturing` (including legacy `manufacturing` alias), `msme`, `services`, and `fnb`.
- New Business Mode selectors must hide the legacy `manufacturing` alias to avoid presenting two Food Manufacturing choices. Existing `manufacturing` rows, CSV markers, and integrations continue to normalize to `food_manufacturing`; a distinct future Manufacturing mode requires a new governed mode pass before it can become selectable.
- Placeholder modes (`retail`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, `education_institutions`) keep conservative template defaults until each mode receives its own governed purpose, item taxonomy, UOM contract, RBAC, and POS/Storefront behavior.
- The shared canonical `items.category` values remain `raw_material`, `packaging`, `product`, `supplies`, and `service`. Mode-specific UI labels such as `Menu Item`, `Ingredient`, or `Service` map to those canonical categories instead of expanding the enum.
- UOMs are split into convertible groups (`weight`, `volume`, `count`) and valid non-convertible business groups (`packaging`, `presentation`, `time`). Automatic conversion is allowed only inside convertible groups. Units such as `serving`, `portion`, `service`, `session`, `ticket`, `booking`, `pack`, `case`, `carton`, `bottle`, and `can` are valid but must not be converted into weight/volume/count without an explicit item-specific conversion contract.
- Mode presets must enforce their explicit allowed UOM list. UOM groups describe classification and fallback metadata; they must not open every unit in the group unless the preset intentionally omits an explicit allowed-unit list.
- Corrected-mode rows may persist `items.mode_item_preset` as the mode-native preset key. This is additive and nullable: new corrected-mode creates should persist it, while existing rows without the field remain readable through category/product/UOM inference.
- New non-draft item creation and draft finalization are strict for corrected modes. Existing legacy rows remain editable unless the operator changes category, product type, UOM, or publishes the row into an invalid corrected-mode combination.
- CSV templates are mode-aware for corrected modes and signed/marked templates must match the tenant workflow mode. Legacy manufacturing markers normalize to `food_manufacturing`. Preview and confirm paths must validate each row against the same corrected-mode taxonomy used by item create/update/finalize, including optimized bulk-import rows.
- Item CSV export now uses the same mode-aware import template definitions for corrected modes. Unless an old caller explicitly requests legacy `type=items`, `type=products`, or `type=master`, exports for `food_manufacturing`, `msme`, `services`, and `fnb` must emit the matching import-template headers, marker columns, `mode_item_preset`, `default_sale_price`, and row values in header order so the file can be imported back without column drift.
- First-login onboarding starter-item creation must use the same taxonomy. Corrected modes must expose only their governed onboarding presets, persist `mode_item_preset` on created rows, require a positive `default_sale_price`, keep image/cost/stock optional unless the mode contract says otherwise, pass the saved primary `location_id` for optional initial stock, avoid retry duplicates for already-created rows, and return row-level validation for partial bulk saves.

## Future Mode Financial Readiness Addendum (2026-05-07)

Future placeholder modes must not be promoted into corrected item taxonomy by only adding labels or UOM defaults. Each mode promotion must define the item financial policy used by IMS, POS, Storefront, sales/dispatch, stock movements, and reports.

- Every new corrected-mode preset must declare cost visibility, selling-price visibility, cost requirement, selling-price requirement, stock-bearing status, FIFO behavior, and reporting treatment.
- Customer-facing sale amount must come from an explicit positive selling price. POS, Storefront, Dispatch Order, and future sale surfaces must not substitute `cost_per_unit` as the customer price.
- Public Storefront catalog and checkout behavior must remain customer-safe: selling price may be exposed, price-less sellable rows must be suppressed or rejected, and internal cost fields must not be exposed publicly.
- Stock movements, FIFO depletion, valuation, COGS, and profitability reports must continue to use cost snapshots/internal cost data only for internal accounting, not as a customer price fallback.
- Placeholder modes remain conservative until their governed mode pass updates the ADR, mode development playbook, shared taxonomy, backend validators, frontend display policy, POS/Storefront readiness paths, reports, imports, and tests together.
- Future mode promotion must also define onboarding starter-item choices, customer-facing completion presets, default hidden fields, financial rules, stock behavior, duplicate/idempotency behavior, completion readiness, and tests before the mode can be called production-ready.

## Future Mode Provisioning Addendum (2026-05-07)

Future placeholder modes must not be promoted by only adding mode-specific tables, labels, or UI routes. The implementation plan must include tenant provisioning as an immediate workstream:

- list each tenant-local table/model the mode adds or extends;
- map every new foreign key to the referenced cloned tenant model;
- keep landlord-only models excluded from tenant database cloning;
- run tenant model factory tests for missing references;
- run a disposable tenant schema sync against the complete graph;
- verify approval/auto-approval cleanup keeps the registration retryable after schema, seed, email, or storefront-bootstrap failure.

## Hosted POS Image Delivery And Navigation Addendum (2026-07-23)

Hosted POS performance uses browser and HTTP caching as the primary image-delivery contract instead of placing unbounded uploaded media into Service Worker Cache Storage.

- Generated item image variants live under unique, content-versioned upload folders. Optimized `thumb`, `medium`, and `large` files under those folders are immutable and receive `Cache-Control: public, max-age=31536000, immutable`.
- Legacy raster uploads without a versioned folder remain revalidatable with a five-minute freshness window and one-day `stale-while-revalidate`. Other upload paths remain `no-cache`.
- POS and Storefront Service Workers continue to bypass `/uploads/`. The browser or CDN honors the backend HTTP cache contract, while Service Worker runtime caches stay bounded and reserved for application-shell assets.
- POS catalog cards request the thumbnail variant. Above-the-fold cards are eager/high-priority; remaining cards are lazy/async. Only the next catalog page is prefetched at low priority during idle time.
- Catalog refreshes preserve the last rendered catalog and expose an in-place refreshing state. A network refresh must not blank the product grid or reset the current route.
- Lazy checkout and operations workspaces are preloaded after terminal unlock during idle time and on navigation intent (pointer hover or keyboard focus). This is a performance hint only; authorization and route guards still run when the destination is selected.
- Checkout, payment, order, authentication, inventory mutation, and other authoritative API responses remain outside this image cache policy and retain their existing `no-store` or revalidation requirements.

Rollback is non-destructive: the upload cache policy can be removed without changing stored URLs, and image/chunk prefetch hints can be disabled without changing POS data or navigation semantics.

## Tenant-Scoped Offline Persistence And Deterministic App Shell Addendum (2026-07-23)

This addendum strengthens and supersedes any earlier language in this ADR that permits automatic or background replay of POS mutations.

- Every catalog/report snapshot, manual-sync allowance, and queued terminal operation is scoped by tenant/company, terminal, location, and signed-in user. A missing scope blocks new offline persistence. Legacy records without the complete scope are quarantined and must never be guessed, displayed in another tenant, or replayed automatically.
- IndexedDB writes are successful only after their read-write transaction completes. If IndexedDB is unavailable or aborts, the queue falls back to localStorage. A sale must remain in the cart unless one of those durable writes succeeds.
- Queue history limits apply only to completed/replayed history. Pending, replaying, and manual-resolution records must not be evicted to satisfy a display or storage-history limit.
- Opening a shift requires a live server confirmation. Offline selling is available only when the current scoped terminal already has a server-confirmed open shift. Incoming online-order refresh, payment collection, receipt hydration, and fulfillment mutations are online-only and disabled while offline.
- Service Worker installation reads the build-generated `precache-manifest.json` and atomically caches the POS HTML shell, web manifest, JavaScript, CSS, and font build assets. Installation fails if the required manifest or any critical asset cannot be cached, preventing a partially installed worker from claiming offline readiness.
- Service Worker caches remain read-only delivery caches. They do not cache `/api/` or `/uploads/`, do not submit queued records, and do not change authorization, stock, payment, or receipt-finalization authority.
- Manual sync allowance is consumed only when the active scope has at least one replay candidate. Reconnect, reload, Service Worker events, and empty Sync presses do not replay records or consume the daily allowance.

Rollback is non-destructive: the versioned snapshot and sync-policy keys can be abandoned without reading another tenant's data; the versioned Service Worker caches can be deleted on activation; and quarantined legacy queue records remain untouched for explicit support-led recovery.

## Amendment: Native Mobile Financial Replay (2026-08-27)

ADR 0075 supersedes this ADR only for the native cashier app's Phase 3
financial ledger. The native app may automatically retry its durable,
idempotent checkout and void outbox after connectivity returns. Cash checkout
is locally complete; non-cash checkout and offline voids remain explicitly
provisional until server acknowledgement. This amendment does not change the
web POS rule that replay is operator-controlled, and it does not permit fiscal
issuance or server-authoritative account and permission decisions offline.

## Addendum: Inventory-Owned Offline Terminal Allocation (2026-10-10, Phase 490)

The web POS offline checkout rules above continue to apply: replay remains operator-controlled,
and a local cached-stock decrement is only a client estimate. An Inventory-owned terminal
allocation is the server-confirmed stock guarantee that makes that local selling limit safe across
terminals and Storefront.

- Offline checkout may use only the remaining allocation bound to the current tenant, location,
  terminal, app attachment, and operator authority. It may not create grants, top up, return stock,
  or expand quantities while offline.
- A previously authenticated operator has at most a 24-hour offline authorization window. After
  expiry, the client stops accepting new local operations and keeps all pending records intact for
  explicit online replay or manual resolution. Expiry does not release or delete the server-side
  allocation.
- Replay remains behind the operator's explicit `Sync All Pending Records` action and its existing
  daily limit. The server revalidates current authority and the allocation; matching allocated
  effects are consumed once with the Inventory goods-issue command. An allocation overrun fails
  deterministically into manual resolution. No reconnect, page-load, retry, or service-worker event
  may submit a queued operation.
- Recipe and modifier-derived ingredient quantities are part of the allocation. `stock_exempt`
  lines remain outside Inventory allocation and movement.
- Pending allocations held by disconnected, expired, or lost terminals remain unavailable to other
  terminals and Storefront. They can be returned only through explicit online reconciliation or
  audited administrator recovery. Storefront output still follows ADR 0017's public inventory
  display policy.

This addendum defines the offline/replay side of the contract. ADR 0029 and
`docs/features/PER_TERMINAL_STOCK_ALLOCATION.md` define ownership, available-to-sell, and the
Inventory enforcement boundary. It records design only and authorizes no runtime or schema change.

## Amendments

### 2026-10-10 — Tier-aware POS replay policy and client-authoritative sale amount

- Clause amended: Offline Checkout Experience Addendum replay bullet; Tenant-Scoped Offline
  Persistence and Deterministic App Shell Addendum opening sentence and manual-sync allowance bullet;
  Phase 490 Addendum replay paragraph (`default`).
- Change: For web POS, replay policy is resolved per tenant/store from server-provided settings. A
  `manual` policy retains operator-only replay. An `auto` policy permits scheduled replay and
  connectivity-restored opportunistic replay when enabled, while preserving the operator's
  `Sync All Pending Records` action. The conceptual settings are `sync_mode` (`auto` or `manual`),
  `sync_schedule` (daily windows, default two), and `opportunistic_on_reconnect` (default enabled
  in `auto` mode); these names are illustrative, and the server supplies the values through
  settings bootstrap. The main admin can return a premium-eligible tenant to `manual` at
  any time. Once #999 ships, premium-eligible tenants default to `auto`; free-tier tenants remain
  `manual` and cannot enable `auto`. This amendment authorizes the policy only: web POS remains
  manual until #999 implements it. Client enforcement remains advisory; this amendment does not
  claim server-side web round enforcement exists.

  A sync round is one leased outbox drain identified by a stable `client_sync_run_id`. Empty drains
  with no replay candidate consume no round. The free tier allows two successful rounds per local
  day; failed validation, authorization, server, and network attempts do not consume a round.
  Premium has no round cap. These round semantics align with the shared accounting model; native
  and partner entitlement and enforcement details remain governed by ADR 0043 and their own
  contracts. The terminal's local scope key is `tenantId|terminalId|locationId|userId`.

  Automatic replay must prevent reconnect storms: allow one in-flight drain per scope across tabs
  and windows; apply randomized 0–60 second jitter to reconnect-triggered runs; use exponential
  backoff starting at 30 seconds and doubling to a 15-minute cap; and honor `429` and
  `Retry-After`. Deduplication continues to use the existing `operation_key` and `idempotency_key`
  contract; automatic replay adds no new idempotency key. A foreground timer or connectivity
  `online` handler is the baseline trigger. Service Worker `sync` or `periodicsync` is optional
  progressive enhancement; ADR 0067's browser baseline does not guarantee it. #999 must also
  coordinate automatic replay with `derivePosUpdateSafety` so a service-worker update reload does
  not race an active drain.

  The replay authorization does not loosen these existing constraints: offline artifacts and
  allowances stay fully scoped, unscoped legacy records remain quarantined, queue writes must be
  durable before local checkout completes, and pending/replaying/manual-resolution records are not
  evicted; replay still validates server authority and idempotency/conflicts; offline checkout
  retains its existing authorization window,
  allocation bounds, cash/non-governed-discount rules, and manual resolution for allocation
  overruns; no final receipt prints before server confirmation (ADR 0025 Guardrail 4); and
  `failed_manual_resolution_required` records, including uncertain item creates without an
  idempotency contract, are never automatically retried. Offline login remains unsupported and
  shift-open still requires live server confirmation under the current clauses; this amendment
  neither broadens nor makes those policies permanent, and #1482/#1483 own any changes. ADR 0026 is
  not amended here and remains owned by #1482. The same manual-only web replay restatement in
  superseded ADR 0061 §1 is governed by this amendment for web POS.
- Reason: The offline-first POS posture in #993 requires configurable background convergence while
  retaining an administrator-controlled manual mode and the existing isolation, durability, and
  financial safety boundaries.
- PR: this PR (Closes #995).

### 2026-10-10 — Reconcile client sale amount with backend persistence authority

- Clause amended: Consequences item 1 (`default`).
- Change: The backend remains the system of record and sole authority for persisted sales,
  inventory, transactions, reporting, compliance, and rule-owned pricing. “Does not move into client
  runtimes” continues to mean that persistence and rules authority do not move. For browser/web POS
  and clients following this replay contract, the client runtime is authoritative only for the
  amount charged for a sale as transacted: the amount displayed to and paid by the customer and
  recorded on the provisional slip, computed from server-issued rules and snapshots. That amount is
  a reconciliation claim, not persistence authority. On replay the server independently
  re-derives its amount, records both figures, and flags any divergence for reconciliation; neither
  figure silently overwrites the other. The immutable sale-time receipt snapshot required by ADR
  0075 remains consistent with the charged amount. Server-side discount/PIN approval and
  rule-validation authority under ADRs 0033 and 0075 remain unchanged. Per #996, the server-rederived amount remains
  the recorded/reportable truth while the client-charged amount is retained as the customer-facing
  sale-time figure. #996 owns the unresolved drawer-expectation treatment before reconciliation
  and what happens to a printed slip after a mismatch, including coordination with the offline
  fiscal-numbering child and its BIR / `PosFiscalEvent` implications. This scoped carve-out does not
  revive the LAN-host topology that ADR 0043 supersedes in part.
- Reason: Make the already-decided offline sale-total behavior consistent with backend persistence
  and pricing authority, while leaving unresolved drawer and fiscal-document handling to its owners.
- PR: this PR (Closes #995).

### 2026-10-10 — Storefront Stock Freshness Contract (#998)

ADR 0017 continues to govern public inventory display after availability is computed. The
Storefront freshness design is documented in
`docs/features/STOREFRONT_STOCK_FRESHNESS_CONTRACT.md`; it consumes the Phase 490 allocation model
and adds no second allocation policy.

1. `GET /store/catalog` keeps its existing HTTP cache policy (`max-age=45`, `s-maxage=45`,
   `stale-while-revalidate=90`, `stale-if-error=180`). Origin availability is live and has no
   Storefront catalog Redis cache-aside layer. Quote and checkout remain `no-store`. Browse may be
   stale within the HTTP bound; checkout commit remains authoritative and rechecks under stock-row
   locks. `[default]`
2. Storefront availability is the Inventory-owned location remainder after active online-order
   holds and all active or quarantined terminal allocations. Storefront browse, quote, and commit
   consume the same availability rule; Storefront does not duplicate the arithmetic. The origin
   result never counts allocated units, while cached copies may lag within the documented HTTP
   freshness bound. `[default]`
3. Reuse ADR 0055's tenant-scoped catalog-change bus for allocation lifecycle invalidations. The
   #997 runtime implementation must publish after grant, top-up, return, quarantine, recovery, and
   consume. Do not expose the authenticated `pos:view` SSE stream to anonymous Storefront clients;
   HTTP TTL remains Storefront browse's invalidation bound. `[default]`

This amendment changes no binding-tier clause and authorizes no runtime, cache-configuration, API,
schema, or UI change. The contract records the allowed stricter option—shorter shared-cache TTL or
`no-store` for stock-bearing catalog reads—if a future product decision requires a literal
"never higher than sellable" guarantee for every served cache copy.

### 2026-10-10 — Web/mobile sync convergence proposal (#1484)

ADR 0095 proposes web POS adoption of the platform-owned `/mobile-pos/sync/*` and
`/mobile-pos/bootstrap/*` contract, while preserving the native client architecture in the mobile
repository. Its per-clause dispositions for ADR 0075/0076 remain non-binding until tech-lead
approval. The governed platform contract is
[`POS_OFFLINE_SYNC_CONTRACT.md`](../../features/POS_OFFLINE_SYNC_CONTRACT.md). This reference does
not change ADR 0014's existing web replay policy, per-operation CP/AP classifications, or the
separate #999 implementation scope.

### 2026-10-26 — Last-known-good workflow settings for POS fallback (#2824)

- Clause amended: Offline Checkout Experience Addendum (2026-07-10), second bullet — "The local
  snapshot is limited to catalog and receipt identity data. Reports, settings, item maintenance,
  account credentials, and remote payment operations remain online-only." (`default`).
- Change: The offline POS snapshot itself is unchanged and still excludes settings. Separately, a
  web client may keep a last-known-good copy of the tenant's own workflow settings — the values of
  `ops_workflow_mode`, `ops_enabled_capabilities`, `ops_disabled_capabilities`, and
  `ops_store_profile` only — in browser `localStorage` under the versioned key
  `dgfy.workflow-mode.last-known-good.v1:<tenant key>`. It is written only after a successful
  `GET /settings`, read only when a later fetch fails, and never written from a fallback or default
  value. It is scoped to the tenant: `<tenant key>` is a non-reversible hash of the session's
  company token (the raw token appears in neither the key nor the value), a record is applied only
  when its stored tenant key matches the current session's, and with no tenant identity it is
  neither read nor written. It carries no user, terminal, location, or transaction data, so it does
  not take the four-part snapshot scope. It is not part of the catalog snapshot, the manual-sync
  allowance, or the operation queue, and holds only the tenant's own persisted values (ADR 0056
  Decision 2; no template is dereferenced). The cached subset is passed through the same
  derivation and persisted-profile-versus-rebuild guard as a fresh response.

  While the cached copy is in use the client treats the workflow as resolved but stale, keeps the
  failure observable, and re-fetches settings on the browser `online` event and with bounded
  exponential backoff (5 seconds doubling to a 60-second cap) until a fresh response replaces it.
  That re-fetch reads settings only; it submits no queued record and triggers no replay, so the
  manual-only replay policy and the existing prohibition on reconnect-triggered submission are
  unchanged. A workflow-mode change made on the server while a terminal is offline is not shown
  until the next successful fetch; the cache drives terminal affordances only, and the API remains
  the authority that accepts or rejects each operation. Reports, item maintenance, account
  credentials, remote payment operations, and every other setting remain online-only.
- Reason: A failed settings load previously reset an F&B terminal to the Counter workflow
  (Walk-in/Pickup/Delivery, no Dine In) with no recovery short of an app restart, and live dine-in
  sales were recorded as `walk_in`.
- PR: this PR (Refs #2824).
