---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-04-27
last_reviewed: 2026-04-27
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
