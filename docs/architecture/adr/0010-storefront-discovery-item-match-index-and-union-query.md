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
