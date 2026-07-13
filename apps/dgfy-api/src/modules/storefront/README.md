# storefront module

Scaffolded in Phase 10 Wave 2 (`.planning/phases/10-storefront-discovery-online-ordering/10-03-PLAN.md`): the PUBLIC consumer-facing storefront discovery/search surface (STF-01), the store-page + product-listing read (STF-02), and the server-side cart validator (`validateCart`) every checkout path (guest and account, cash and PayMongo) reuses.

## Relationship to `products` and the landlord `dgfy_core` database

Follows the same Clean Architecture layering as `../products/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildStorefrontModule()`. Unlike `../products/` (tenant-scoped, resolved via `TenantConnector`), `StorefrontDiscoveryRepository` targets the single shared LANDLORD connection (`apps/dgfy-api/src/config/db.js`) directly — `storefront_discovery_index` (built in `10-01-PLAN.md`) is a cross-tenant public projection, not per-tenant data. `getStorePage`/`validateCart` resolve a store's `business_id` from that projection, then read the tenant catalog through the injected `productRepository` (Phase 8's `../products/repositories/productRepository.js`), exactly like every other module that needs tenant-scoped data.

## Endpoints

- `GET /storefront/discovery/search` — distance-ranked, visibility-filtered store search (lat/lng required, optional text/category/open-now filters), rate-limited, unauthenticated
- `GET /storefront/stores/:handle` — a store's discovery page + active product listing, 404 for an unknown/invisible handle, rate-limited, unauthenticated

Mounting under `/storefront` in `apps/dgfy-api/src/routes/index.js` is a later plan's scope (10-04/10-06), not this module's.

## `validateCart` — the single server-side cart re-pricer

`usecases/cartValidation.js`'s `validateCart({businessId, lines})` is exported at the top level of `buildStorefrontModule()` (not just nested under `useCases`) so every checkout path (guest, account, cash, PayMongo — 10-06) imports the SAME function rather than re-implementing pricing. It resolves each line's product from the tenant catalog, rejects unknown/inactive products, snapshots name + unit price from the catalog (never the client), and recomputes every amount in integer centavos via `../availments/usecases/money.js`'s `roundHalfUp` (T-10-03-01 — client-supplied totals are never trusted).

## Prohibitions honored

- Never expose raw sequential `storefront_discovery_index`/`businesses` ids to consumers — only opaque `handle`s (T-10-03-02, IDOR guard).
- Every discovery SQL value is a bound parameter (V5) — no string interpolation of user input, including the sanitized FULLTEXT boolean-mode query text.
- No `backend/` writes/imports — new module code only (v2.0 Commerce Domain zero-touch constraint).
