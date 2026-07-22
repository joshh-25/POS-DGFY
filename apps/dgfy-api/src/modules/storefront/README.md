# storefront module

Scaffolded in Phase 10 Wave 2 (`.planning/phases/10-storefront-discovery-online-ordering/10-03-PLAN.md`): the PUBLIC consumer-facing storefront discovery/search surface (STF-01), the store-page + product-listing read (STF-02), and the server-side cart validator (`validateCart`) every checkout path (guest and account, cash and PayMongo) reuses.

Extended in Phase 10 Wave 3 (`10-04-PLAN.md`, STF-03/D-06): guest email-OTP checkout verification, a persistent landlord-side guest identity keyed by verified email, and `resolveCheckoutIdentity` — the "who is ordering" resolution `placeOrder` (10-06) consumes.

## Relationship to `products` and the landlord `dgfy_core` database

Follows the same Clean Architecture layering as `../products/`: `routes -> controllers -> usecases -> repositories -> models`, composed in `index.js`'s `buildStorefrontModule()`. Unlike `../products/` (tenant-scoped, resolved via `TenantConnector`), `StorefrontDiscoveryRepository` targets the single shared LANDLORD connection (`apps/dgfy-api/src/config/db.js`) directly — `storefront_discovery_index` (built in `10-01-PLAN.md`) is a cross-tenant public projection, not per-tenant data. `getStorePage`/`validateCart` resolve a store's `business_id` from that projection, then read the tenant catalog through the injected `productRepository` (Phase 8's `../products/repositories/productRepository.js`), exactly like every other module that needs tenant-scoped data.

## Endpoints

- `GET /storefront/discovery/search` — distance-ranked, visibility-filtered store search (lat/lng required, optional text/category/open-now filters), rate-limited, unauthenticated
- `GET /storefront/stores/:handle` — a store's discovery page + active product listing, 404 for an unknown/invisible handle, rate-limited, unauthenticated
- `POST /storefront/guest/otp/request` — requests a guest checkout email-OTP code (`infra/emailOtp.js`'s `STOREFRONT_GUEST_CHECKOUT` purpose), rate-limited, unauthenticated
- `POST /storefront/guest/otp/verify` — verifies the OTP code and upserts the persistent guest identity (D-06), rate-limited, unauthenticated
- `POST /storefront/checkout/identity` — resolves "who is ordering" via `resolveCheckoutIdentity`; mounted behind `optionalAuthenticateAccount` (see `routes.js`) so a logged-in DGFY Account's identity always wins, but a guest is never forced to log in

Mounted under `/storefront` in `apps/dgfy-api/src/routes/index.js` (composition root), reusing the same `productRepository` instance the products/commerce modules already share (10-04-PLAN.md).

## Guest checkout identity (STF-03, D-05, D-06)

Guest verification is email-OTP only (D-05 — no SMS/phone-OTP provider exists in the codebase; phone is stored as unverified contact/coordination info, never OTP-challenged). `guestIdentityRepository.upsertByVerifiedEmail()` finds-or-creates ONE persistent `storefront_guest_identities` row per verified email (D-06) — a repeat guest is recognized across orders rather than getting a fresh anonymous record every time — and is race-safe against the model's unique index (T-10-04-03: a concurrent first-order's unique-constraint violation is caught and re-resolved by re-selecting the winner's row, never surfaced as an error).

`resolveCheckoutIdentity({authenticatedAccountId, guestIdentityId})` returns `{customer_account_id}` when an account is present, else `{guest_identity_id}` when a verified guest identity is present, else rejects 401 `CHECKOUT_IDENTITY_REQUIRED` — account is optional, never forced. The returned shape is an application-level cross-DB reference (no FK), exported at the top level of `buildStorefrontModule()` (alongside `validateCart`) for `placeOrder` (10-06) to consume directly.

## `validateCart` — the single server-side cart re-pricer

`usecases/cartValidation.js`'s `validateCart({businessId, lines})` is exported at the top level of `buildStorefrontModule()` (not just nested under `useCases`) so every checkout path (guest, account, cash, PayMongo — 10-06) imports the SAME function rather than re-implementing pricing. It resolves each line's product from the tenant catalog, rejects unknown/inactive products, snapshots name + unit price from the catalog (never the client), and recomputes every amount in integer centavos via `../availments/usecases/money.js`'s `roundHalfUp` (T-10-03-01 — client-supplied totals are never trusted).

## Prohibitions honored

- Never expose raw sequential `storefront_discovery_index`/`businesses` ids to consumers — only opaque `handle`s (T-10-03-02, IDOR guard).
- Every discovery SQL value is a bound parameter (V5) — no string interpolation of user input, including the sanitized FULLTEXT boolean-mode query text.
- No `backend/` writes/imports — new module code only (v2.0 Commerce Domain zero-touch constraint).
