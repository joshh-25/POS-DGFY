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
