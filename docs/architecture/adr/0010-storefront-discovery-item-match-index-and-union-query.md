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
