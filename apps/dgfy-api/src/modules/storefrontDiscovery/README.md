# Storefront Discovery Module

Provides public, read-only discovery data used by the `store` app:

1. `listDiscoveryUseCase` for search/list/grid/map entries
2. `getStorefrontProfileUseCase` for slug profile lookup

Boundaries:

`routes -> controllers -> usecases -> repositories -> models`

Notes:

- This module is read-only and does not mutate tenant data.
- Discovery read path is index-backed via landlord table `storefront_discovery_index`.
- Discovery payload does **not** expose tenant `company_token`.
- Public store requests resolve tenant context via `x-store-slug` on `/api/v1/store/*`.
