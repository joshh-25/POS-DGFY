---
status: reference
owner: engineering
last_reviewed: 2026-09-17
declaration_id: 2026-09-17-quadruper-geocoder-swap
classification: minor
surfaces: settings,tenant_locations,storefront,onboarding
reason_codes_impacted: ALLOWED
policy_version: 2026.09.17
verification_evidence: npm --prefix apps/dgfy-api test -- tests/geoFallbackPolicy.test.js,npm run build:skupervisor,npm run build:pos,npm run build:store,npm run lint:docs
rollback_note: Set GEOCODE_QUADRUPER_ENABLED=false. This restores the bundled PH-local dataset as the sole geocoding source with no code change and no redeploy of a prior image.
---

# Quadruper Geocoder Swap

## Compliance Impact Classification

Minor.

Forward and reverse geocoding move from an in-process bundled dataset to the DGFY-operated
Quadruper service. Merchant and customer pin coordinates now cross a network boundary to reach it.

This is **not** disclosure to an external processor: Quadruper is DGFY-operated infrastructure.
No new personal-data category is collected, no new party gains access, and no retention or consent
term changes.

## Affected Surfaces

- **IMS Settings > Storefront location editing and onboarding `primary_location`** — the shared
  `MapPinPicker` address-suggestion call now resolves through Quadruper first, falling back to the
  bundled dataset.
- **Storefront** — the discovery/checkout coordinate contract is unchanged, but the reverse-geocode
  suggestion path underneath onboarding/Settings is DGFY-operated infrastructure rather than
  in-process.
- **`/api/v1/geo/reverse-geocode` and `/api/v1/geo/address-search`** — both now call out to the
  Quadruper service over HTTP from `apps/dgfy-api` before falling back locally.

## Compliance Preconditions

1. All geocoding traffic must continue to originate from `apps/dgfy-api` — no browser-side call to
   Quadruper, Nominatim, or any other geocoding service is permitted.
2. The bundled PH-local dataset must remain a functioning automatic fallback so a Quadruper outage
   degrades precision rather than failing the request.
3. `GEOCODE_QUADRUPER_ENABLED=false` must remain a complete revert path requiring no code change.
4. Reverse-geocode failure must never block saving valid coordinates.
5. An address suggestion may fill an empty address field but must not overwrite merchant-edited
   address text unless the merchant explicitly applies it.

## Relationship to 2026-05-18-leaflet-to-maplibre-migration

That declaration's addenda state that reverse geocoding is "first-party" with "no browser-side or
live third-party reverse-geocode call" and that "the IMS picker must not call browser-side
Nominatim directly".

The browser-side prohibition is **preserved in full and strengthened**: Quadruper sends no CORS
headers, so a browser-side call is impossible by construction rather than by convention. All
geocoding traffic originates from `apps/dgfy-api`.

The "first-party" characterisation is narrowed to mean *DGFY-operated*, which Quadruper is, rather
than *in-process*, which it no longer is.

## Runtime hardening

1. The bundled PH-local dataset is retained as an automatic fallback; geocoding degrades rather
   than fails when the service is unreachable.
2. A 2500 ms timeout and a five-failure/60-second circuit breaker bound the blast radius of an
   outage.
3. `GEOCODE_QUADRUPER_ENABLED=false` is a complete, tested revert path.
4. Only successful service responses are cached, so an outage cannot pin a degraded result.
5. Outbound query strings are built from a fixed parameter-name allowlist; user input is never
   used as a parameter name.
6. Reverse-geocode failure does not block saving valid coordinates (unchanged contract).

## Verification Evidence

- `npm --prefix apps/dgfy-api test -- tests/geoFallbackPolicy.test.js`
- `npm run build:skupervisor`
- `npm run build:pos`
- `npm run build:store`
- `npm run lint:docs`
