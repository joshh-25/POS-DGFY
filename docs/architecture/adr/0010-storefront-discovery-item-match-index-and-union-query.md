# ADR 0010: Storefront Discovery Item-Match Index and Union Query Contract

## Status
Accepted (2026-04-20)

## Context
Public storefront discovery previously returned tenant rows with basic store-field search and did not expose item-match reasoning or branch-level match metadata needed for map/list/grid UX improvements.

Product and UX requirements now require:
1. Union discovery behavior (`store` + `item` matches) with explicit caller control (`union`, `item_only`, `store_only`).
2. Stock-aware item matching with safe default behavior (`in_stock_only`) and an explicit broadening override.
3. Near Me behavior that can anchor to nearest matching branch while preserving one-tenant-per-row discovery contract.
4. Scalable read-path behavior without per-request tenant fan-out.

This touches cross-boundary concerns:
- Public API request/response contract (`/storefront/discovery`)
- Landlord discovery index data model and sync pipeline
- Storefront web client discovery controls and result rendering behavior

## Decision
Adopt indexed, metadata-rich discovery with backward-compatible defaults:

1. Keep discovery response shape backward-compatible for existing consumers while adding optional metadata fields.
2. Extend `/storefront/discovery` query contract with:
   - `result_mode` (`union`, `item_only`, `store_only`)
   - `stock_filter` (`in_stock_only`, `include_out_of_stock`)
   - `pin_scope` (`nearest_matching_branch`, `all_matching_branches`, `tenant_primary`)
   - `include_match_meta` (`true`/`false`)
3. Extend discovery rows (when metadata enabled) with:
   - `match_reasons`
   - `matching_item_count`
   - `matching_item_sample`
   - `has_in_stock_match`
   - `matching_location_ids`
   - `nearest_matching_location_id`
4. Materialize searchable item/location snapshot metadata in landlord index (`item_search_snapshot`, `active_location_snapshot`, `search_snapshot_version`) and use it at query time.
5. Preserve checkout and track contracts (`/store/cart/quote`, `/store/checkout`, `/store/track/:pin`) unchanged.

## Consequences
1. Discovery UX can explain why a store appears and can align map pins with matching branches.
2. Default stock-aware search reduces user confusion from out-of-stock-only matches, while keeping an explicit override for broader discovery.
3. Landlord index storage and sync complexity increase because item/location snapshots must remain fresh and bounded.
4. Operational observability must include discovery query mode/filter usage and zero-result latency monitoring.

## Acceptance Criteria
1. Discovery supports union/item/store modes and stock filter behavior with deterministic defaults.
2. Discovery map/list/grid can consume branch-match metadata without changing checkout flows.
3. No `company_token` or tenant-secret fields are exposed in public discovery responses.
4. Query-time discovery does not perform tenant fan-out for item matching.
5. Existing checkout/quote/track error contracts remain deterministic and unchanged.

## Rollback Notes
1. API-level rollback can disable metadata emission (`include_match_meta=false`) while preserving base row payload.
2. Runtime fallback can continue using existing index row fields even if new snapshot fields are temporarily stale.
3. Any future destructive schema cleanup for discovery snapshots must be handled in a separate, explicitly approved ADR/migration phase.

## Addendum (2026-04-24): Tenant Branding Asset Fields
Cross-boundary additive extension approved for storefront branding media:

1. Tenant-wide storefront cover/profile assets are managed via Settings write endpoints and persisted as settings keys.
2. Landlord `storefront_discovery_index` materializes branding URLs (`storefront_cover_image_url`, `storefront_profile_image_url`) during sync.
3. Public discovery list and slug-profile responses may include these two branding fields as optional additive properties.
4. Checkout, quote, tracking, and discovery filter semantics remain unchanged.

## Addendum (2026-04-24): Branding Asset Hardening
Operational hardening for branding asset safety was applied without public contract changes:

1. Settings/POS image uploads now require both MIME allowlist and binary signature validation.
2. Storefront asset settings/index reads sanitize non-canonical values and emit security-signal logs.
3. Legacy SVG files under `/uploads` are served with `text/plain` response type to prevent script execution.

## Addendum (2026-05-15): Current Storefront Client Presentation
The public API query knobs remain supported, but the current Storefront client no longer exposes the old visible `Result Mode`, `Stock Filter`, or `Pin Scope` dropdowns.

1. The Storefront client sends the discovery contract explicitly with `result_mode=union`, `stock_filter=include_out_of_stock`, `pin_scope=tenant_primary`, and `include_match_meta=true` for normal discovery loads.
2. The customer-facing search field uses the current placeholder `Search products, services or stores nearby...` and submits searches through the explicit `Search` action.
3. The location action is an icon button titled `Use my current location`; successful geolocation changes the client pin scope from `tenant_primary` to `nearest_matching_branch`.
4. Storefront profile and cover media render from the tenant branding fields when present and fall back to initials or mode visuals when an image cannot load.
5. Selected/highlighted discovery map pins may add CSS-only glow/ripple styling around the existing branded marker element. When an active search returns tenant/store-name or item/product matches, every result pin receives that search-active glow instead of only the first selected result. This is a presentation-only enhancement and does not change discovery API parameters, stored branch coordinates, checkout location routing, or marker preview semantics.
6. Storefront map markers must render from the unmodified indexed tenant-location latitude/longitude selected by the active `pin_scope`. The client must not fan out duplicates by changing coordinates or applying display offsets. Same-coordinate results render as one exact-coordinate shared marker; cluster membership is disclosed through the Storefront results panel rather than a large on-map list.
7. Active search result pins no longer auto-open compact marker preview cards. Customers open marker previews by hovering a pin on pointer devices or by clicking/tapping a pin; click/tap previews remain intentional cards until closed. Popup state must be cleared when the marker set changes so stale cards cannot remain visually detached from rebuilt pins.

## Addendum (2026-06-06): Root Handles, Main Branch Pins, and Branch-Scoped Catalogs
Storefront routing and branch scoping were hardened without changing public API endpoint paths:

1. The customer discovery/map page canonical path is `/map-dgfy`.
2. Tenant storefront pages use root public handles (`/:store_tenant_slug`) as the canonical customer URL. Legacy `/tenant-store/:slug` and `/store/:slug` URLs remain readable compatibility paths and are canonicalized by the Storefront client after profile resolution.
3. `store_tenant_slug` is the public handle. Tenant display names may duplicate, but public handles must be unique in landlord `storefront_handle_reservations.handle` and must not collide with reserved DGFY root routes such as `map-dgfy`, `api`, `admin`, `store`, or `tenant-store`. Discovery index slugs mirror this reservation for visible tenants.
4. The "main branch" for discovery means the active tenant location flagged `is_primary_storefront=true`. Default discovery uses `pin_scope=tenant_primary`, so searching a company name shows the primary Storefront pin unless the customer explicitly uses a nearest/matching-branch flow.
5. Storefront tenant URLs may carry `location_id`. Branch resolution order is URL `location_id`, discovery-selected branch, active/open fallback, primary Storefront branch, then first active branch. Catalog, quote, checkout, booking, QR, and reorder reads must stay scoped to the selected branch.
6. Inventory item setup now supports branch-level Storefront availability through tenant-local `storefront_location_item_overrides`. Missing rows default to available for additive rollout compatibility; explicit `storefront_available=false` hides the item from that branch before stock labels and checkout validation are applied.
7. Storefront marker animations must keep the MapLibre-owned marker root at the stored coordinate. Custom marker DOM must use a fixed-size root anchor box whose bottom center is the coordinate point. Presentation effects may render outside that box, but must not resize, translate, or replace the root anchor in a way that makes pins appear detached during zoom.

## Addendum (2026-06-07): Durable Handles and Branch-Scoped Services
The June 6 root-handle and branch-scoping decision is amended as follows:

1. `store_tenant_slug` uniqueness is owned by landlord `storefront_handle_reservations.handle`, not only by `storefront_discovery_index.slug`. Visible tenants mirror the reservation into discovery; hidden tenants retain their reservation while absent from public discovery so another tenant cannot claim the same clean URL.
2. The "main branch" for discovery means the active tenant location flagged `is_primary_storefront=true`. Default discovery still uses `pin_scope=tenant_primary`, so company-name search shows that primary Storefront pin unless the customer explicitly enters a nearest/matching-branch flow.
3. `location_id` branch scoping applies to service catalog, service availability, service holds, service bookings, and service waitlist mutations in addition to product catalog, quote, checkout, QR, and reorder reads.
4. Tenant-local `storefront_location_item_overrides.storefront_available=false` hides the item/service from that branch before stock labels, service capacity, checkout validation, or booking validation are applied. Discovery item-search snapshots must also remove explicitly disabled branch locations from `matching_location_ids` and `in_stock_location_ids`.

## Addendum (2026-06-07): Platform-Admin Storefront Visibility Controls

Platform-admin Tenant Manager may update active tenants' Storefront publication state without logging into the tenant IMS.

1. The parent **Storefront / Maps** capability writes tenant-local `system_settings.store_is_visible`.
2. The Storefront sub-mode writes tenant-local `system_settings.customer_access_mode` using the existing `ghost`, `catalog`, `inquiry`, and `transaction` codes.
3. Successful platform-admin changes to either setting must refresh the landlord `storefront_discovery_index` for that tenant.
4. These controls must not change item-level `storefront_catalog_overrides`, branch-level `storefront_location_item_overrides`, POS catalog visibility, tenant lifecycle status, or clean-handle reservation ownership.

## Addendum (2026-07-10): Commercial Promo Discovery Projection

1. The landlord discovery index may materialize `storefront_promos` as an additive public profile field so a Storefront can display each active commercial promotion.
2. The projection is allowlisted to customer-facing promo display and redemption fields. Item targeting and internal allocation details remain tenant-private.
3. The legacy `storefront_promo` field remains readable as a compatibility fallback; existing public routes and checkout contracts are unchanged.
4. Discovery index reconciliation refreshes this projection after Settings updates. Storefront clients must suppress promos outside their configured validity dates.

## Addendum (2026-06-08): Marker Stability and Draft Branch Availability

The June root-handle and branch-scoping implementation is hardened as follows:

1. Search-active Storefront marker glow remains presentation-only. The MapLibre marker root and the visible marker body must stay anchored to the stored latitude/longitude. Storefront pins use a fixed `38px` by `48px` root anchor box with the visual marker absolutely positioned inside it; pulse/glow effects may animate surrounding pseudo-elements or filter only, but must not scale, resize, or translate the root or marker body in a way that makes the pin appear to drift during zoom.
2. IMS item and product draft saves must preserve `storefront_location_item_overrides` when branch availability toggles are submitted. Draft behavior remains separate from final Storefront visibility and sale-readiness decisions, but a draft save must not silently drop branch-level Storefront availability choices.
3. Normal Storefront pins and shared-coordinate cluster pins must use the same bottom-center coordinate anchor and the same popup offset contract so marker cards keep consistent spacing above the pin across zoom levels. The customer "your location" marker must render below storefront pins so overlapping coordinates remain clickable for the storefront pin.

## Addendum (2026-06-08): Renderer-Owned Discovery Pins

The Storefront discovery map marker contract is further hardened:

1. Customer-facing Storefront discovery pins must render from a MapLibre GeoJSON source and MapLibre style layers, not DOM `Marker` overlays. The visual pin icon is a sprite image owned by the map renderer with `icon-anchor=bottom`, so zoom and pan transforms are applied by the same renderer that owns the map tiles.
2. Normal store pins, shared-coordinate count pins, highlighted/search-active halos, and the customer "your location" dot use explicit layer order. The user-location layer renders below storefront pins; storefront symbol layers render above the halo and user layers so overlapping store coordinates remain clickable.
3. The source feature geometry must use the unmodified indexed longitude/latitude selected by the active `pin_scope`. The client may fit the viewport with padding large enough to keep the full bottom-anchored icon visible, but it must not shift feature coordinates or apply per-result coordinate offsets.
4. Marker preview cards remain DOM popups anchored to the same feature coordinates. Popup retention and auto-open behavior may be driven by layer click/hover events, but card position must derive from the feature geometry rather than a detached marker element.

## Addendum (2026-06-09): Hover Previews and 13-Meter Count Clustering

The renderer-owned marker contract is amended for production map usability:

1. Hover-opened marker preview cards are temporary previews. They must collapse when the pointer leaves the Storefront pin layer, including the case where the pointer moves over the preview card. Click-opened previews remain intentional cards and keep the close action.
2. Exact-coordinate Storefront pins still cluster into a shared count pin. Storefront pins within `13` meters of an existing visible pin may also cluster into one count pin so near-overlapping Philippine storefront coordinates do not visually stack as separate unreadable pins.
3. Individual non-cluster Storefront pins must still use their stored/indexed coordinates. A near-coordinate count cluster may use the small cluster centroid as its count-pin geometry, but only for the aggregate count feature and not as a mutation of any branch/store coordinate.
4. A single known provisioned/default placeholder coordinate must not render as an accurate standalone Storefront pin. Multiple storefronts at that placeholder coordinate may render as a shared count cluster so customers can discover the available storefronts without treating the coordinate as a verified exact storefront location.
5. Discovery search result maps must not auto-open marker preview cards. Search highlighting may use the existing pin halo/glow, but preview cards are pointer-owned on hover or user-owned on click/tap so cards do not remain open after the pointer leaves a pin.
6. Clicking a shared count pin scopes the existing Discover Nearby/View Results panel to the grouped storefronts instead of rendering a scrollable on-map list widget. This keeps the map clean and preserves the results panel as the owner of storefront lists.
7. When a search has visible results and the results panel is collapsed, the View Results control may pulse with CSS-only shadow/filter animation. The pulse must not scale or move the button, pins, or MapLibre-owned marker anchors.
