---
status: amended
authority_level: authoritative
owner: architecture
date: 2026-05-03
last_reviewed: 2026-09-06
review_by: 2026-11-03
applies_to: architecture_decision
topic: customer_access_modes_and_inventory_display
---

# ADR 0017: Customer Access Modes And Inventory Display Controls

## Context
The existing onboarding classifier exposes `visibility_mode` values (`ghost`, `catalog`, `inquiry`, `transaction`) as advisory classification output only. Product language now needs to describe the actual customer-facing capability: what a customer can see or do after finding a tenant storefront.

This change follows `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, ADR 0006, ADR 0007, ADR 0008, ADR 0009, ADR 0010, ADR 0013, ADR 0014, and ADR 0016. It is a cross-boundary change because it touches tenant-local settings, onboarding classification, Storefront discovery/profile/catalog/checkout behavior, customer-facing UI, inventory visibility, compliance/payment readiness, telemetry, and documentation.

## Decision

> **Strictness tiers (ADR 0039).** Clauses below are tagged `[binding]`, `[default]`,
> or `[snapshot]`. `binding` needs a superseding ADR to change; `default` needs an
> amendment block in the implementing PR; `snapshot` is documentation and may be
> updated by ordinary work. Untagged clauses elsewhere in this document are `default`.

- Introduce Customer Access Mode as the runtime storefront capability contract. Keep internal v1 codes compatible with the existing classifier: `ghost`, `catalog`, `inquiry`, and `transaction`, with user-facing labels `Map Listing Only`, `Catalog Only`, `Inquiry Mode`, and `Online Ordering Mode`. `[binding]`
- Add tenant-local settings for `customer_access_mode` and `inventory_display_mode` in `system_settings`. Use `catalog` and `availability` as default values for existing tenants. `[snapshot]`
- Keep `visibility_mode` as a backward-compatible alias in onboarding snapshots during migration. New UI copy must use Customer Access Mode. `[snapshot]`
- Compute an effective customer access mode from the saved requested mode and the declared/verified readiness stage. Storefront public behavior must use the effective mode, not only the raw saved setting. `[binding]`
- Registration-stage guidance is enforced for customer checkout and payment capability. Tenant UI should guide and limit normal selection, while backend quote/checkout/payment paths fail closed when the effective mode does not allow the requested action. `[binding]`
- Inquiry Mode v1 uses existing tenant contact channels as the customer action. It does not add a persisted lead/inquiry inbox until a separate lead-management contract is approved. `[default]`
- Inventory Display is independent from Customer Access Mode. It controls customer-facing stock presentation only; exact stock remains server-side unless `inventory_display_mode=exact_quantity`. `[binding]`
- Item-level storefront catalog visibility is independent from POS visibility. Inventory-facing users control this with `storefront_catalog_overrides.storefront_visible`, while POS continues to use `pos_catalog_overrides.pos_visible`. `[default]`
- Storefront item images are independent from POS menu images. Storefront catalog reads prefer `storefront_catalog_overrides.storefront_image_url` as the primary image and `storefront_catalog_overrides.storefront_image_gallery` as the ordered detail gallery. POS image data is used only as rollout/backfill fallback. `[default]`

## Mode Contract
| Internal code | Label | Customer can see | Customer can do |
|---|---|---|---|
| `ghost` | Map Listing Only | Business name, category, location, basic contact | Find or contact the business |
| `catalog` | Catalog Only | Catalog/menu/services, photos, prices, availability presentation | Browse only |
| `inquiry` | Inquiry Mode | Catalog plus contact/inquiry calls to action | Contact, request availability, ask for a quote |
| `transaction` | Online Ordering Mode | Purchasable or bookable catalog entries | Order, book, and pay when payment readiness allows |

Inventory display modes:

| Code | Public presentation |
|---|---|
| `hidden` | No stock/availability text |
| `availability` | `Available`, `Not available`, or `Bookable` |
| `low_stock` | Availability plus low-stock copy such as `Only 3 left` under the configured threshold |
| `exact_quantity` | Exact public quantity when the tenant explicitly chooses it |

## Consequences
- Storefront discovery and profile responses need additive access-mode metadata and cache invalidation after settings changes.
- `store_is_visible=false` is stronger than Customer Access Mode: it hides the tenant from public discovery/map feeds and public storefront profile reads. Customer Access Mode applies only after the tenant is publicly visible.
- Storefront catalog responses must continue hiding `cost_per_unit`; quantity fields must be normalized through inventory display policy instead of exposing raw stock by default.
- Public Storefront catalog and checkout eligibility must read item-level storefront overrides when available. During additive rollout, a missing `storefront_catalog_overrides` table may fall back to the prior POS-derived policy with warning logging instead of returning `500`.
- POS catalog responses and terminal eligibility must remain sourced from POS overrides only. Image upload/removal must not silently enable either POS or Storefront visibility.
- Quote, checkout, and service booking public mutations must fail closed when the effective mode is not `transaction`.
- Storefront product quotes/checkouts and public service booking/hold/batch mutations must also fail closed outside configured `storefront_hours` business hours. The same weekly setting drives the public hours label, public open/closed status, immediate/scheduled product checkout availability, and service booking schedule acceptance.
- When the effective mode is `transaction`, Storefront checkout/booking must allow repeated customer orders and quantity `1+` lines/drafts whenever POS-equivalent readiness passes. Customer Access Mode controls whether the action is allowed; it must not impose a one-active-order or one-active-booking limit.
- Onboarding remains a soft reminder per ADR 0013, but its business classification step should become the first capture point for Customer Access Mode and Inventory Display preferences.
- Settings > Storefront becomes the long-term source-of-truth surface for changing these controls after onboarding.
- No architecture allowlist exception is required.

## Validation
- Run `npm run check:architecture` and `npm run lint:docs`.
- Add backend tests for mode normalization, effective mode derivation, settings validation, storefront catalog serialization, and quote/checkout blocking.
- Add frontend tests for onboarding wording, Settings deep link ownership, Storefront CTA suppression/replacement, inventory display labels, and checkout panel gating.
- Add compatibility tests proving legacy `visibility_mode` snapshots still deserialize and expose a `customer_access_mode` alias.
- Add catalog split tests proving POS image upload preserves `pos_visible=false`, Storefront image upload preserves `storefront_visible=false`, Storefront catalog reads filter on `storefront_visible`, and POS catalog reads filter on `pos_visible`.

## Addendum: Item-Level Storefront Catalog Overrides (2026-05-03)

The Storefront catalog now has an additive tenant-local override table, `storefront_catalog_overrides`, with item-level visibility and image fields. Migration backfills preserve existing production behavior by deriving initial storefront visibility and images from the previous POS-derived policy before runtime reads switch to the new table.

This addendum does not change Customer Access Mode. Customer Access Mode controls whether the tenant storefront can be browsed, queried, or used for ordering overall. `Show in Storefront` controls whether a specific item appears in the customer-facing catalog when the effective Customer Access Mode permits catalog browsing.

## Addendum: Storefront Fallback Boundary Hardening (2026-05-04)

After the additive table exists, Storefront catalog runtime reads must not treat a missing per-item Storefront override row as permission to inherit POS visibility or POS menu images. Row-missing behavior uses the Storefront default item policy: finished-goods products are visible by default, service rows follow service storefront metadata, and Storefront images remain empty unless a Storefront image override exists.

POS-derived visibility and POS image data are now compatibility fallback only when the `storefront_catalog_overrides` table itself is unavailable during rollout. This preserves rollback safety without re-coupling item-level Storefront catalog state to POS state after migration.

Image replacement is also sequenced for deploy safety: POS and Storefront uploads store the new file, commit the override update, and then best-effort remove the prior file. If the database update fails after storage succeeds, the newly stored file is removed and the old image remains in place.

## Addendum: Storefront Item Gallery Contract (2026-06-03)

Storefront item media now supports an ordered gallery. The first uploaded image remains the primary `storefront_image_url` for backward compatibility, and the full customer-facing order is stored in `storefront_image_gallery`. Public catalog responses expose both `image_url` and `image_gallery`; older clients can continue rendering `image_url`, while F&B item details use `image_gallery` for carousel thumbnails and slide navigation.

Inventory onboarding and item setup can upload multiple item images, capped at 5 total Storefront item images per item. Multi-image upload appends to the ordered gallery and preserves the existing first image as primary; if no gallery exists, the first accepted upload becomes primary. Item/product setup surfaces can promote any existing gallery image to the first/primary position and can remove one gallery image without clearing the whole gallery. Single-image upload remains backward-compatible replacement for older clients. Upload/removal still preserves `storefront_visible` and must not mutate POS menu image fields.

## Addendum: Production Hardening And Default Enforcement (2026-05-04, updated 2026-05-15)

Runtime enforcement is default-on. Public Storefront behavior must honor the effective Customer Access Mode unless operators explicitly set `CUSTOMER_ACCESS_MODES_ENABLED=false` for rollback. When that rollback switch is active, controlled tenant re-enablement is supported through `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`.

Public discovery index rows materialize Customer Access metadata (`customer_access_mode`, `effective_customer_access_mode`, `max_customer_access_mode`, `inventory_display_mode`, low-stock threshold, `access_capabilities`, limitation reason, and rollout-enabled state) so discovery UI can hide order/cart CTAs before tenant profile load without tenant DB fanout.

Settings updates, onboarding business-classification saves, tenant location changes, and storefront asset changes refresh storefront discovery after successful use-case results. Runtime schema readiness treats the discovery-index Customer Access migration and columns as required for environments that claim this rollout.

Validation evidence must include targeted policy/settings/onboarding/store/service/discovery tests, Storefront helper tests, docs lint, architecture checks, Storefront build, SKUpervisor build, and whitespace diff checks before enabling the rollout broadly.

## Addendum: Public Storefront Visibility Opt-In (2026-06-06)

Newly provisioned tenants default to `store_is_visible=false`; provisioning must correct any migration-seeded `store_is_visible=true` value for the new tenant database before the discovery bootstrap runs and must not create a synthetic primary location from environment fallback coordinates. Onboarding and Settings are the supported merchant controls for opting into public exposure. When the switch is off, public discovery, map pins, third-party map feeds, and root-handle profile reads (`/:store_tenant_slug`) must not return the tenant. When the switch is on, `store_is_visible=true` means the storefront is public/searchable. Map publication still requires a valid active primary location with finite coordinates unless the merchant explicitly sets `store_has_no_location=true`. No-location storefronts remain searchable/profile-readable with nullable discovery coordinates, and public map pins, embedded profile maps, directions links, and public `/store/locations` branch data must be suppressed until the merchant turns no-location off and publishes a primary pin. Legacy `/store/:slug` and `/tenant-store/:slug` paths are compatibility routes and are not the canonical customer URL.

## Addendum: Searchable No-Location Storefronts (2026-06-16)

`store_has_no_location=true` is a reversible tenant-local setting for merchants that should be searchable but not map-pinned. It does not change Customer Access Mode; catalog, inquiry, checkout, booking, payment, stock, branch, business-hours, and compliance gates remain governed by their existing contracts. The public discovery index represents this state with `location_id=null`, `latitude=null`, and `longitude=null`, and public clients must treat those values as absent rather than coercing them to `0`.

## Addendum: Storefront Price And Cost Boundary (2026-05-07)

Storefront visibility does not make item cost public:

- Public Storefront catalog and QR payloads expose `default_sale_price` and never expose `cost_per_unit`, FIFO batch cost, weighted average cost, or raw inventory value.
- Public Storefront catalog and QR item resolution must suppress or block otherwise visible item rows when `default_sale_price` is missing or zero; a price-less row is not customer-ready catalog content.
- Storefront checkout requires an explicit positive `default_sale_price` for every cartable item. Missing or zero sale price is a setup error, not permission to sell at cost.
- `storefront_catalog_overrides.storefront_visible=true` is a sale-readiness configuration. Enabling it on an item without a positive `default_sale_price` must surface a readiness blocker in IMS and must fail closed in Storefront checkout.
- Storefront image upload must not create or preserve a visible Storefront override for a price-less row. Hidden rows may still store images for later setup, but visible rows must pass sale-price readiness first.
- Inventory Display remains quantity/availability presentation only. It does not alter cost visibility and does not authorize public cost exposure.

## Addendum: Storefront Checkout Multiplicity (2026-05-11)

Storefront multiplicity is part of the transaction-mode contract:

- Stock-bearing product, retail, F&B/menu, and future mode cart lines may use quantity `1+`, bounded by location stock and the FIFO/location contract from ADR 0009.
- Public product quote and checkout validation must aggregate all requested quantities for the same stock-bearing `item_id` before comparing against available stock. This closes duplicate-line bypasses from F&B modifier splits, future line customization, direct API callers, and UI regressions while still preserving separate receipt lines and modifier snapshots.
- Service bookings may use quantity `1+` per booking and multiple booking drafts per all-or-nothing checkout, bounded by Services Mode resource/provider/location validation from ADR 0016. Quantity above `1` requires a capacity anchor, currently an active assigned service resource; provider-only and location-only service bookings remain effective capacity `1`.
- Public service availability reads are allowed as catalog/customer-guidance reads, but they must be no-store and capacity-aware. They may show only slots that currently satisfy Services Mode capacity/readiness rules, including active unexpired hold quantities, and may return customer-safe diagnostics for no-slot/setup states; public booking mutations remain transaction-gated and revalidate under lock.
- Public service booking holds are transaction-gated mutations. Active unexpired holds may reserve Services Mode capacity briefly, must require idempotency, must be counted by availability/booking capacity checks while active, and must be consumed or replaced by the final booking path.
- Storefront readiness remains POS-equivalent, not POS-coupled: POS visibility is not a Storefront gate, but Storefront must enforce the same sale-readiness concepts for active status, price, stock, service bookability, and capacity.
- Public checkout and booking mutations must be idempotent. Product checkout continues to use POS transaction idempotency; service booking checkout stores the idempotency key and request hash on created bookings and replays matching retries.

## Addendum: Bulk Catalog Setup And Mode-Aware Readiness (2026-05-11)

Bulk setup is now part of the item-level catalog contract:

- POS and Storefront readiness use shared setup policy helpers so onboarding, single-item controls, bulk visibility APIs, and bulk image APIs report the same blocker vocabulary.
- POS readiness requires active status, effective POS visibility, positive sale price, non-negative stock, and available stock for stock-bearing rows. Service and stock-exempt rows may be POS-ready without physical stock when the other blockers pass.
- Onboarding `has_sellable_item` must count POS-ready items, not merely active or POS-visible rows.
- Storefront readiness reports effective visibility, sale-price readiness, image state, active status, and blocker reasons. Visible Storefront rows without a positive `default_sale_price` remain blocked.
- `PATCH /api/v1/pos/catalog-overrides/bulk` may enable POS visibility only for POS-ready rows. Disabling remains allowed for incomplete rows.
- `PATCH /api/v1/items/storefront-overrides/bulk` may enable Storefront visibility only for Storefront-ready rows and must never mutate POS visibility. Disabling remains allowed for incomplete rows.
- `POST /api/v1/pos/catalog-overrides/images/bulk` and `POST /api/v1/items/storefront-images/bulk` match files by SKU filename stem, preserve current visibility, return per-file partial-success results, and clean up failed stored/temp files.
- Bulk image middleware accepts the batch for use-case validation so unsupported MIME/signature, duplicate filenames, unmatched SKU stems, readiness blockers, and 5 MB policy failures can be reported per file. The middleware still caps uploads at 50 files and 6 MB per temporary file, below the production Nginx `client_max_body_size=8m` ingress guard and above the 5 MB product image policy.
- POS and Storefront bulk image uploads are separate asset paths. A POS bulk image upload must not set Storefront image fields, and a Storefront bulk image upload must not set POS image fields.
- Onboarding readiness must not use the legacy `items.pos_visible` column as a shortcut. It must evaluate the same POS readiness policy as the catalog setup flow and page through item rows rather than assuming the first query window contains the sellable candidate.

Mode-aware recommendations are advisory, not permission bypasses. Corrected taxonomy modes use their mode-native sellable/internal item presets. Placeholder modes (`retail`, `hospitality`, `healthcare`, `ticketing_transport`, `logistics_distribution`, and `education_institutions`) must continue using conservative finished-goods defaults until a governed mode pass defines their taxonomy, financial policy, POS policy, Storefront policy, import/export columns, onboarding expectations, bulk setup recommendations, and tests.

## Addendum: Tenant Location Pin Deletion Safety (2026-05-12)

Settings > Storefront may permanently delete tenant location pins only when the row is unused. The IMS UI exposes hard delete only after a pin is inactive so operators take the history-preserving deactivate path first. Permanent delete is distinct from deactivation:

- `DELETE /api/v1/tenant-locations/:id` deactivates the location and preserves history.
- `DELETE /api/v1/tenant-locations/:id/permanent` hard-deletes only when no operational references exist.

Operational references include current location stock, FIFO batches, stock movements, POS transactions, POS terminal shifts, POS shift location transitions, POS shift backfill audits, user-location grants, service provider assignments, service resources, service bookings, and service booking holds. The backend reference guard must be maintained as a named source manifest and covered by tests that compare the manifest against direct `TenantLocation` model associations, exact foreign keys, and the counted where-clause fields. If deletion is blocked by the pre-delete count, API responses must return `409` with `reference_counts`, and IMS Settings must surface those blockers with deactivate as the safe fallback. If the guard cannot inspect a named tenant-local reference model from the active tenant context, the API must fail closed with `503 SERVICE_UNAVAILABLE`; unknown reference state must never be treated as zero usage. If a concurrent write creates a dependent row after the pre-delete count but before the delete commits, database FK enforcement or the repository delete call must still map the failure to the same `409` operational-history conflict. The supported production contract is therefore pre-count evidence, tenant-context guard availability, and fail-closed FK conflict mapping; broad serializable locking across every dependent table is not assumed.

## Addendum: Original-Preserving Image Derivation Contract (2026-07-09)

Storefront and POS image upload paths now support additive image derivation without changing their existing primary-image URL contract.

- Upload validation remains transport-authoritative and unchanged. MIME allowlist, binary signature validation, size limits, readiness blockers, and bulk partial-success behavior still execute before catalog/settings writes are committed.
- Accepted image uploads preserve the original file under a tenant-scoped internal `uploads/originals/**` path for rollback, reprocessing, and high-resolution operator use. The original is not promoted to the existing public primary image field by default.
- Public delivery files are generated per uploaded asset in a tenant-scoped asset folder under the existing public surface roots (`storefront-catalog`, `pos-catalog`, `storefront-assets`). The persisted primary public URL continues to point at the large delivery variant so legacy consumers keep working.
- Derived public delivery variants are additive and purpose-based: `thumb` (`400px` target width), `medium` (`1024px` target width), and `large` (`1920px` target width). Processing preserves aspect ratio, strips metadata from public variants, and must not upscale smaller images.
- Photo-like uploads may be re-encoded to `WebP` with default quality `80`. Graphic/text-heavy uploads remain on a conservative lossless/public-safe path (currently PNG-family output) instead of being blindly converted.
- Variant discovery is additive. Backend responses may expose `image_variants`-style metadata, but existing `storefront_image_url`, `pos_image_url`, `storefront_cover_image_url`, `storefront_profile_image_url`, and gallery primary ordering remain backward-compatible.
- Cleanup remains fail-safe. If a DB/catalog/settings write fails after asset generation, newly stored public/original files must be removed best-effort so the old persisted asset remains authoritative.

## Amendments (2026-08-14)

The interactive POS and Storefront catalog upload flow now uses the source file
only as a temporary processing input. For new uploads through the
`storefront-catalog` and `pos-catalog` image storage paths, the backend removes
the source after the optimized delivery variants and manifest are written. The
persisted public image URL and ordered gallery contract are unchanged. If the
later catalog write fails, the generated new asset is removed best-effort and
the prior catalog record remains authoritative; the source is not retained for
rollback or reprocessing. Existing retained originals are not deleted by this
change. Storefront profile/cover/gallery settings assets and other callers that
explicitly retain originals remain governed by the original-preserving default.

The POS item editor also shows a browser-local preview immediately after file
selection and uploads the image automatically for existing items. The returned
optimized asset replaces the temporary preview. New items continue to queue
selected images until the item receives an ID.

### Interactive POS Image Upload Acknowledgement (2026-08-14)

Interactive POS item-image uploads now use the asynchronous catalog upload
endpoints for existing items. The POS or iMin Android WebView displays the
selected source image locally and receives a fast `202 Accepted` acknowledgement
while the backend worker performs image validation, compression, gallery
persistence, and temporary-source cleanup. The interactive client does not
poll the compression job.

The persisted catalog record remains the source of truth. On completion, the
backend emits the existing catalog-change invalidation event. The POS refreshes
the item through its normal catalog path and replaces the local preview with
the optimized public asset; on failure, the prior persisted gallery remains
authoritative. Save Item is independent of background image optimization, so
the modal does not show a full form-saving state while the worker is processing
an image. The same API and behavior apply in a browser and in the APK's WebView;
no APK-specific image implementation is introduced.

The Redis queue is required for durable multi-process production processing.
The in-process queue fallback is limited to local development when Redis is
unavailable. Service-worker caching continues to bypass `/api/` and
`/uploads/`; image binaries are not placed in the browser, WebView, or Redis
cache as a substitute for the persisted catalog asset.

## Amendments (2026-09-06)

AVIF encoding is deprecated and disabled by default in the image upload pipeline as of Phase 296
(#265 epic, PR 2 of 5) -- it is not removed. `storeOptimizedImageAsset`'s delivery-format set no
longer requests an AVIF encode for new uploads (`RESPONSIVE_ASSET_VERSION` is now 3); the AVIF
encoder path (`AVIF_QUALITY_STEPS`, the `encoder === 'avif'` branches) remains in code, marked
`@deprecated`, for potential future reactivation or a manual/offline AVIF regeneration tool.

Existing assets written under the prior responsive-asset version (`-v2-<hash>` folders) are
unaffected and require no migration: their `.avif` files remain on disk and continue to be served,
and `deriveImageAssetVariantUrls` continues to advertise `avif` URLs for those folders specifically
by parsing the asset version out of the folder name rather than assuming a single global version.
New assets (`-v3-<hash>` folders) never advertise an `avif` URL and never had one encoded.

`status: amended` (already the case from prior addenda) is unchanged.

## Amendments (2026-09-06, client-derived upload contract)

Disambiguated from the "## Amendments (2026-09-06)" block immediately above -- both land the same
day (Phase 296's AVIF-deprecation entry and this one), so this heading is given an explicit
sub-label rather than repeating the bare date, per this ADR's own precedent of never letting two
sibling `##` headings share identical text.

Phase 299 (#265 epic, PR 4 of 5) adds a **client-derived image upload contract**: the two
single-image catalog endpoints (`POST /catalog-overrides/:item_id/image`,
`POST /:item_id/storefront-image`) now accept two additional, fully optional multipart fields --
`image_medium` and `image_thumbnail` -- alongside the existing required `image` field, plus an
optional `client_image_manifest` JSON text field carrying a `source_mime_hint` (the pre-conversion
MIME of the user's original file, before any client-side re-encoding) and a `large_pre_optimized`
flag (declaring that `image` itself is already a validated, correctly-sized "large" delivery
variant, not a raw original).

**Trust model: the manifest is a hint, never a trust boundary.** Every client-supplied claim --
`source_mime_hint`, `large_pre_optimized`, and each of `image_medium`/`image_thumbnail` themselves
-- is independently validated server-side (`validateClientVariant`: header-only sharp metadata
check against the exact format/width/pixel-cap contract the server would otherwise have produced
itself) before being trusted enough to skip re-encoding. A failed validation never fails the
request; it silently falls back to the server deriving that specific variant from the original,
exactly as if the client had never sent the optional field at all. This is a graceful degradation
ladder, not a hard contract: every caller who predates this phase, and sends only a bare `image`
field, gets byte-identical behavior to before this amendment.

**The bulk endpoints** (`POST /catalog-overrides/images/bulk`,
`POST /storefront-images/bulk`) gain the equivalent capability through their existing SKU-stem
filename convention, extended rather than replaced: a bare `<SKU>.<ext>` file means exactly what it
means today (the server derives everything); `<SKU>__large.<ext>` / `<SKU>__medium.<ext>` /
`<SKU>__thumbnail.<ext>` correlate up to three files for one SKU into a single upload, with
`<SKU>__large.<ext>`'s presence itself serving as the bulk endpoint's opt-in signal (no manifest
transport exists in a bulk multipart batch, so the filename convention carries the signal there
instead). Two files claiming the same variant slot for one SKU is a new, distinct failure mode
(`duplicate_variant_for_sku`), kept separate from the pre-existing `duplicate_filename` status
(which still fires, unchanged, for two *bare* files sharing a stem).

**Original-retention resolution**, settling the question this ADR's Context/Consequences left open
for the two catalog-image storage modules: `storefrontCatalogImageStorage.js` now retains the raw
original (`retainOriginal: true`, previously an unconditional `false`) -- storefront-catalog-image
uploads are IMS's managed surface. `posCatalogImageStorage.js` keeps `retainOriginal: false` --
POS terminals stay capped, unchanged. This is keyed off which storage module (and therefore which
endpoint) handled the call, not a new client-sent signal -- already fully determined by the request
path today.

`buildBulkCatalogImageUpload`'s permissive `fileFilter` (the "do not make this strict without
updating ADR 0017" comment at `uploadConfig.js`) is unaffected by this amendment -- the bulk
endpoints' multer configuration itself does not change; only the use-case layer's filename parsing
and per-SKU grouping do.

**Explicitly out of scope, left running unaffected**: the gallery endpoints (up to 5 photos per
item, `/:item_id/storefront-images`) and the async/queued single-image path
(`/:item_id/storefront-image/async`, `/:item_id/storefront-images/async`,
`workers/itemImageWorker.js`). Both predate this amendment and are unrelated to it; a future phase
extending the client-derived contract to either is a materially larger scope (up to 15 files per
gallery request) and should amend this ADR again in its own right, not be assumed already covered
by this entry.

No new client asset-encoding module is introduced by this phase -- `packages/web-core`'s image
encoder remains unbuilt. Every field this amendment adds is server-side contract only; real traffic
continues to send a bare `image` field until that separate, later phase ships a caller for the new
optional fields.

`status: amended` remains unchanged; `last_reviewed` refreshed to this entry's own land date
(already 2026-09-06, unchanged from the amendment immediately above).
