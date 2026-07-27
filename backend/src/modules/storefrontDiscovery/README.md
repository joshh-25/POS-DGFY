# Storefront Discovery Module

Provides public, read-only discovery data used by the `store` app:

1. `listDiscoveryUseCase` for search/list/grid/map entries
2. `getStorefrontProfileUseCase` for slug profile lookup

It also provides a master-admin-only write surface for `entity_type: 'external_listing'`
rows — stores that transact on a different platform (ADR 0037 Axis 3):

3. `upsertExternalStorefrontListingUseCase` / `deleteExternalStorefrontListingUseCase` / `listExternalStorefrontListingsUseCase`

Boundaries:

`routes -> controllers -> usecases -> repositories -> models`

Notes:

- The public read path is unauthenticated and never mutates tenant data.
- Discovery read path is index-backed via landlord table `storefront_discovery_index`.
- Every row is one of two `entity_type`s: `dgfy_native` (derived from a real Tenant by
  `storefrontDiscoveryIndexService.js`'s reconciliation job — this module never writes
  those rows) or `external_listing` (master-admin authored via this module's write
  use cases, no Tenant, no tenant DB, no `tenant_id`/`tenant_company_token`).
- Discovery payload does **not** expose tenant `company_token`.
- Public store requests resolve tenant context via `x-store-slug` on `/api/v1/store/*`;
  `external_listing` rows are excluded from that resolver (`storefrontTenantResolver.js`) —
  they have no tenant to resolve to.
