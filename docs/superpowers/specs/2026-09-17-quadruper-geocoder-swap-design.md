# Design: Replace the bundled PH-local geocoder with the Quadruper geocoding service

**Date:** 2026-09-17
**Phase:** 337 (authoritative ledger `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` currently ends at Phase 336)
**Status:** Approved design, not yet implemented
**Authority:** Working spec. This file is **not** a governed document — it carries no
`authority_level` frontmatter, is not registered in `docs/_meta/document-registry.json`, and ranks
below `AGENTS.md` and every governed `docs/` doc on any conflict. It records a design decision; it
does not grant one.

---

## 1. Objective

Replace the hardcoded 37-entry PH-local address dataset that backs DGFY's forward and reverse
geocoding with the self-hosted Quadruper geocoding service (Photon 1.3.0 over OpenStreetMap,
~850,000 Philippine places), while:

- keeping the existing `/api/v1/geo/address-search` and `/api/v1/geo/reverse-geocode` contracts
  backward compatible (additive changes only);
- retaining the bundled dataset as a fallback, so geocoding degrades rather than fails when the
  service is unavailable;
- adding nearby-landmark output to reverse geocoding, as a navigation aid for delivery riders.

## 2. Current behavior

### 2.1 What "the geocoder" is

Two use cases in one file, both backed by an in-process static dataset:

| Concern | Location |
|---|---|
| Forward search (`address-search`) | `apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js` — `buildAddressSearchUseCase` |
| Reverse geocode (`reverse-geocode`) | same file — `buildReverseGeocodeUseCase` |
| Data source | `apps/dgfy-api/src/modules/geoSearch/data/phLocalAddressDataset.js` |
| Routes | `apps/dgfy-api/src/routes/geoSearch.js` |
| Validator | `apps/dgfy-api/src/validators/geoSearchValidator.js` |

Forward search is a case-insensitive token-substring match over the dataset's `label` field.
Reverse geocode picks the nearest dataset centroid within that entry's `maxDistanceKm`, ranked by
`precision` then distance, falling back to `Pinned location (lat, lon)`.

**Coverage today is 37 entries spanning only Iloilo City, Oton, and Pavia.** Every coordinate
outside those three municipalities resolves to `precision="coordinate_only"`.

### 2.2 Explicitly out of scope

`buildGeoSearchUseCase` / `geoSearchRepository` (nearest-store discovery via MySQL FULLTEXT +
`ST_Distance_Sphere`) share the `geoSearch` module but are a different concern. They are **not**
geocoding and are **not** modified by this work.

### 2.3 Consumers

- `packages/web-core/src/components/maps/MapPinPicker.jsx` — calls both endpoints
  (`:93` reverse, `:258` forward). Shared by IMS, POS, and Storefront.
- `apps/dgfy-storefront/src/shared/hooks/useDeliveryPinResolution.js` — storefront delivery pin.

**Consumer audit result:** `address_line` is the only field rendered. `psgc_code` is used solely
as a React key fallback (`MapPinPicker.jsx:638`); `precision` / `address_provider` /
`address_distance_meters` are passed through as metadata and are never branched on. No business
logic depends on any field other than `address_line`, `latitude`, and `longitude`.

## 3. Service facts (verified live 2026-09-17)

Base URL `https://quadruper.com/geocode`. DGFY-operated (self-hosted), so coordinate egress crosses
a network boundary within DGFY-controlled infrastructure rather than being disclosure to an external
processor.

`GET /geocode/status` returned:

```json
{"status":"Ok","import_date":"2026-09-12T23:03:36Z","version":"1.3.0","git_commit":"523a59b4"}
```

Four behaviors verified by direct probe, each of which drives a design rule below:

**F1 — The nearest feature is often a POI, not an address.**
`GET /geocode/reverse?lat=10.7202&lon=122.5621&limit=1` returned
`name="Peri Todd's Burger"`, `osm_key=amenity`, `osm_value=restaurant`, `type=house`.
Using `features[0].name` as an address label would put a restaurant name into a merchant's
address field.

**F2 — Address field mapping is inconsistent across the index.**

| Probe | barangay appears in | `state` actually holds |
|---|---|---|
| `10.7392,122.4931` (Oton) | `district` = `Abilay Norte` | `Iloilo` (province) |
| `10.7202,122.5621` (Iloilo City) | `locality` = `Bakhaw` | `Western Visayas` (region) |

This is upstream OpenStreetMap tagging variance, not a service defect, and cannot be fixed by us.

**F3 — A single reverse call yields both the address and usable landmarks.**
`GET /geocode/reverse?lat=10.7202&lon=122.5621&radius=0.4&limit=15&distance_sort=true` returned,
among others: SM Hypermarket (`shop.supermarket`), Watsons (`amenity.pharmacy`), LBC
(`office.courier`), a named bus stop (`highway.bus_stop`), plus `type=street` features carrying
street names. No second request is required.

**F4 — Location bias is decisive for forward search.**

| Query | Top 5 results |
|---|---|
| `q=Poblacion` | Makati, Muntinlupa, Siaton, Remedios T. Romualdez, Mabini |
| `q=Poblacion&lat=10.72&lon=122.56` | Pavia, Jordan, Leganes, Leganes, Leon |

Without bias, a nationwide index ranks *worse* for a local merchant than the 37-entry dataset does.

**F5 — No distance field is returned.** Despite `distance_sort`, response properties contain no
distance. Distances must be computed from `geometry.coordinates`.

Additional documented constraints carried into the design: GET only; unknown parameters return
HTTP 400; empty results return HTTP 200 with `features: []`; `limit` caps at 50; `lang` accepts only
`default` and `en`; `geometry` is unavailable on this index; **no CORS headers are sent**;
`geometry.coordinates` is `[lon, lat]`; every address property is nullable; the index rebuilds
weekly with roughly 15 seconds of downtime, and `osm_id` coordinates can move between rebuilds.

## 4. Architecture

### 4.1 Module layout

```
apps/dgfy-api/src/modules/geoSearch/
├── usecases/geoSearchUseCases.js        MODIFIED — orchestration + fallback policy only
├── providers/
│   ├── quadruperGeocodeProvider.js      NEW — HTTP client: forward, reverse, status
│   └── localGeocodeProvider.js          NEW — wraps the existing bundled dataset
├── mappers/photonFeatureMapper.js       NEW — Photon Feature → DGFY contract, label composer
├── landmarks/landmarkClassifier.js      NEW — osm_key/osm_value allowlist → landmark category
├── data/phLocalAddressDataset.js        UNCHANGED — fallback-only from here on
└── index.js                             MODIFIED — DI wiring for the provider pair
```

Rationale: the current use-case file mixes data lookup, distance math, and response shaping.
Adding a network client to it without splitting would compound that. After the split each unit has
one job, and the use case remains testable with zero network access.

### 4.2 Provider interface

Both providers implement the same two methods and return the **DGFY** contract shape, never
Photon's raw shape:

```
searchAddresses({ query, limit, biasLatitude, biasLongitude }) -> { results: [...] }
reverseGeocode({ latitude, longitude })                        -> { address_line, precision, ... }
```

Photon-shaped objects never escape `providers/` + `mappers/`. This is the boundary that makes the
provider swappable later without touching the use case.

### 4.3 Fallback policy (owned by the use case)

```
Quadruper
  → on timeout, non-200, empty features, malformed JSON, or open circuit
Local bundled dataset
  → on no match within maxDistanceKm
coordinate_only  ("Pinned location (lat, lon)")
```

Fallback is silent to the caller except via the `provider` field, and is logged at `warn` with the
failure reason. A reverse-geocode failure must never block saving valid coordinates — this is an
existing contract in ADR 0013 and `docs/api/specification.md` and is preserved unchanged.

## 5. Detailed design

### 5.1 Address label composition — the `features[0].name` rule

Driven by **F1** and **F2**. The label is composed from address *properties*, never from
`properties.name`.

```
segments = [
  locality || district,          // barangay, whichever field carries it
  district,                      // included when it exists and differs from the above
  city,
  state,                         // province or region, whichever the record carries
  "Philippines"
]
→ drop empty, dedupe case-insensitively, cap at 5 segments, join with ", "
```

Verified outputs:

| Coordinates | Composed label |
|---|---|
| `10.7392,122.4931` (Oton) | `Abilay Norte, Oton, Iloilo, Philippines` — identical to today's format |
| `10.7202,122.5621` (Iloilo City) | `Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines` |

`district` is deliberately retained (the `Jaro` segment): it is how navigation actually works in
Iloilo City and it directly serves the rider-reference goal. Confirmed 2026-09-17.

The label must never be a bare `Near ...` string — an existing ADR 0013 prohibition, preserved.

### 5.2 Landmarks

Always on when landmarks are available (confirmed 2026-09-17). Sourced from the **same single
reverse call** described in **F3**: `radius=0.4&limit=15&distance_sort=true`.

The response's `features[0]` supplies the address components; the full set is then classified.

Landmark selection:
- include when `osm_key` ∈ { `amenity`, `shop`, `tourism`, `office`, `leisure`, `healthcare`,
  `education`, `building` (named only) } or `osm_key`/`osm_value` = `highway`/`bus_stop`;
- require a non-empty `properties.name`;
- exclude `type=street` features from `landmarks[]` — the street name is surfaced separately as
  `components.street`;
- dedupe on normalized `name`, keeping the nearest occurrence. The probe returned "SM Hypermarket"
  twice, once as `shop.supermarket` and once as `shop.mall`, so deduping on the
  `(name, osm_key, osm_value)` triple would keep both — `name` is the field that actually collapses
  them;
- sort by computed distance ascending, cap at **5**.

Each landmark:

```json
{
  "name": "SM Hypermarket",
  "category": "shop",
  "osm_key": "shop",
  "osm_value": "supermarket",
  "distance_meters": 180,
  "latitude": 10.7211,
  "longitude": 122.5634
}
```

`landmarks` is always present as an array; it is `[]` when none qualify or when the local fallback
served the request (the bundled dataset has no landmark data).

### 5.3 Distance computation

Driven by **F5**. The existing haversine helper at
`apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js:32-42` moves to a shared util in
the module and is reused by both the landmark sort and the local provider. `[lon, lat]` ordering is
converted exactly once, inside `photonFeatureMapper.js`, and is covered by a dedicated test.

### 5.4 Precision mapping

The enum is extended additively — every existing value stays valid, so no documented value is
reversed:

| Photon `properties.type` | DGFY `precision` |
|---|---|
| `house` | `house` *(new)* |
| `street` | `street` *(new)* |
| `locality`, `district` | `barangay` |
| `city`, `county` | `city` |
| `state` | `province` |
| `country` | `province` |
| `other`, or absent | most specific component present: `barangay` if `locality`/`district` exists, else `city` if `city` exists, else `province` if `state` exists, else `coordinate_only` |

### 5.5 Request construction and parameter safety

Unknown parameters return HTTP 400, so query strings are built from a **fixed allowlist of
parameter names**. A user-controlled value may be sent as a value; a user-controlled string is
never used as a parameter *name*. All values are URL-encoded.

Forward search sends: `q`, `limit` (≤20, clamped), `lang=en`, `bbox` (always), and `lat`/`lon` when
bias is supplied. The PH bounding box is the documented full data extent
`114.20624,4.55472,126.60253,21.11770`, applied as a hard filter.

Reverse sends: `lat`, `lon`, `radius=0.4`, `limit=15`, `distance_sort=true`, `lang=en`.

### 5.6 Resilience

- **Timeout 2500 ms** via `AbortController`. No retry on the interactive path — a retry doubles
  worst-case latency on a user-blocking request; the fallback is faster and always available.
- **Circuit breaker**: 5 consecutive failures opens the circuit for 60 s, during which requests go
  straight to the local provider without a network call. One trial request closes it on success.
- Rationale: the service has no auth, no rate limit, no published SLA, and a ~15 s weekly rebuild
  outage. A hard dependency would fail merchant onboarding closed on infrastructure downtime.

### 5.7 Caching

Redis, reusing the existing pattern and naming from `geoSearchRepository.js`
(`getRedisClient()` / `isRedisConnected()`, disabled when `NODE_ENV=test`, all cache errors caught
and logged rather than thrown).

- `/status` `import_date` is fetched at most once every 5 minutes and cached in-process.
- Cache keys embed that `import_date`, so a weekly index rebuild invalidates the whole namespace
  without an explicit purge. This is the documented mechanism and it also handles the fact that a
  given `osm_id`'s coordinates can move between rebuilds.
- Reverse key: `geo:rev:{import_date}:{lat.toFixed(5)}:{lon.toFixed(5)}` (~1 m granularity).
- Forward key: `geo:fwd:{import_date}:{sha1(query)}:{biasGrid}:{limit}`, bias snapped to 0.01°.
- TTL from `GEO_GEOCODE_REDIS_CACHE_TTL_SECONDS`, default 900 s.
- Only successful Quadruper responses are cached. Fallback results are never cached, so a transient
  outage cannot pin a degraded answer for the full TTL.

### 5.8 Configuration

New environment variables, all with working defaults so no deployment is blocked on config:

| Variable | Default | Purpose |
|---|---|---|
| `GEOCODE_QUADRUPER_BASE_URL` | `https://quadruper.com/geocode` | Service base URL |
| `GEOCODE_QUADRUPER_ENABLED` | `true` (`false` when `NODE_ENV=test`) | Kill switch to local-only |
| `GEOCODE_QUADRUPER_TIMEOUT_MS` | `2500` | Per-request timeout |
| `GEO_GEOCODE_REDIS_CACHE_TTL_SECONDS` | `900` | Geocode cache TTL |

`GEOCODE_QUADRUPER_ENABLED=false` is a complete, tested revert path: it restores exactly today's
behavior without a code change or redeploy of a previous image.

## 6. API contract changes

All additive. No field is removed, renamed, or given a narrower type.

### 6.1 `GET /api/v1/geo/reverse-geocode`

Request: unchanged (`lat`, `lon`).

Response gains:
- `landmarks[]` — always present, possibly empty; shape per §5.2
- `components` — `{ street, locality, district, city, state, postcode }`, every field nullable
- `precision` — may now be `house` or `street` in addition to the existing four values
- `provider` — `dgfy-quadruper` on a service hit; `dgfy-ph-local` on fallback

Unchanged: `address_line`, `latitude`, `longitude`, `distance_meters`.
`psgc_code`, `parent_psgc_code`, and `provenance` are returned **only** on the local-fallback path.
They are already documented as conditional on a bundled local match, and their sole consumer is a
React key fallback, so this is not a breaking change.

### 6.2 `GET /api/v1/geo/address-search`

Request gains optional `lat` and `lon` (bias). Both must be supplied together; supplying exactly
one is a 422. Validation reuses the existing Joi ranges. When absent, behavior is unbiased — so
existing callers are unaffected.

Response results gain `components` and the extended `precision` vocabulary.

### 6.3 Frontend

`MapPinPicker.jsx` passes its current map center as `lat`/`lon` on `searchAddress()`. This is the
change that makes the coverage increase usable rather than harmful (**F4**).

Landmark display is **out of scope for this phase** — the endpoint returns `landmarks[]`, and
rendering it in the rider-facing surfaces is separate follow-up work to be filed by `/pm`. Shipping
the data first keeps this phase's blast radius to the geocoder itself.

## 7. Testing

Fixtures are recorded from the live probes in §3 and committed, so the suite never touches the
network.

**Mapper (`photonFeatureMapper`)**
- the **F1** case: a `amenity.restaurant` nearest feature must not yield `Peri Todd's Burger` as
  `address_line`
- the **F2** cases: both the Oton record (barangay in `district`, province in `state`) and the
  Iloilo City record (barangay in `locality`, region in `state`) compose correctly
- `[lon, lat]` ordering is respected
- all-nullable address properties produce a valid, non-crashing result
- the 5-segment cap and case-insensitive dedupe

**Provider (`quadruperGeocodeProvider`)** — `fetch` mocked
- timeout aborts and surfaces as a fallback-triggering failure, not an exception
- HTTP 400 in both documented shapes (flat `{message}` and per-field `{lat:[{...}]}`)
- HTTP 200 with `features: []` is treated as a miss, not an error
- malformed/non-JSON body does not throw
- built query strings contain only allowlisted parameter names

**Landmark classifier**
- allowlist include/exclude
- `type=street` excluded from `landmarks[]`
- the duplicate "SM Hypermarket" (`shop.supermarket` + `shop.mall`) collapses to one entry
- unnamed features excluded
- cap of 5 and ascending distance order

**Use case / fallback policy**
- Quadruper success path
- each failure mode falls through to local, then to `coordinate_only`
- circuit breaker opens after 5 failures, short-circuits without a network call, closes on success
- `provider` reflects the path actually taken
- fallback results are not written to cache

**Existing test requiring update**
`apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js` currently asserts
`psgc_code: expect.any(String)` unconditionally. That now holds only on the fallback path; the test
must be split into a Quadruper-path case and a local-fallback case.

**Frontend**
`packages/web-core/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx` gains a case
asserting that `lat`/`lon` bias params are sent on address search.

## 8. Governance obligations

Three, all mandatory, all in the implementation PR.

1. **ADR 0013 amendment.** Addendum 2026-06-21 clause 4 mandates `provider="dgfy-ph-local"` and
   "the most specific local label available from bundled PH-local data". This design changes both.
   The clause is untagged, so per ADR 0039 and `AGENTS.md` Planning Rule 4 the cheapest valid path
   is a dated `## Amendments` block on ADR 0013 in the same PR, with `status: amended`. A new
   superseding ADR is **not** required. The amendment must preserve, verbatim in effect: the
   no-`Near ...`-labels rule, the "suggestion may fill an empty field but must not overwrite
   merchant-edited text" rule, and "reverse-geocode failure must not block saving coordinates".

2. **New compliance impact declaration**, `docs/compliance/impact-declarations/`, classification
   **`minor`** (confirmed 2026-09-17). Grounds: Quadruper is DGFY-operated, so this is a
   network-boundary change within DGFY-controlled infrastructure, not disclosure to an external
   processor. The declaration must note that it narrows the absolute wording in
   `2026-05-18-leaflet-to-maplibre-migration.md` ("no browser-side or live third-party
   reverse-geocode call"): geocoding remains server-side only — the service sends no CORS headers,
   so a browser-side call is impossible by construction — and the browser-side prohibition in that
   declaration is preserved intact.

3. **Phase 337 entry** in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`, with objective, scope,
   status, dependencies, acceptance evidence, and links to the ADR amendment and declaration.

**Docs to update in the same PR**
- `docs/api/specification.md` — the reverse-geocode contract (~line 6857), the tenant-location
  address note (~line 3551), and the onboarding picker note (~line 6856)
- `apps/dgfy-api/src/modules/geoSearch/README.md` — add the provider/mapper layout
- `apps/dgfy-api/src/modules/geoSearch/data/phLocalAddressDataset.js` header comment, which
  currently asserts "no browser-side or live third-party reverse-geocode call is used"

**Prerequisite:** a GitHub issue must exist before the PR (repo SOP,
`docs/process/ISSUE-TAXONOMY.md`). `gh` was unavailable in the design session, so filing is a
`/pm` task.

## 9. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Quadruper becomes a single point of failure for merchant onboarding | Local fallback + circuit breaker + `GEOCODE_QUADRUPER_ENABLED=false` kill switch (§4.3, §5.6, §5.8) |
| R2 | OSM field inconsistency produces malformed labels (**F2**) | Defensive composer + committed fixtures for both observed shapes (§5.1, §7) |
| R3 | A POI name lands in a merchant's address field (**F1**) | Label composed from address properties only; `features[0].name` is never used (§5.1) |
| R4 | `[lon, lat]` inversion — the documented most-common integration bug | Single conversion point in the mapper, with a dedicated test (§5.3, §7) |
| R5 | Empty results treated as an error | Branch on `features.length`, never on status code alone (§4.3, §7) |
| R6 | Weekly rebuild moves coordinates or breaks `osm_id` stability | Cache keyed on `import_date`; `osm_id` is never persisted as a durable key (§5.7) |
| R7 | Coordinate egress across a network boundary | `minor` compliance declaration; server-side only, enforced by the absence of CORS (§8) |
| R8 | 850k places degrade autocomplete relevance without bias (**F4**) | Bias params + mandatory PH `bbox` hard filter (§5.5, §6.3) |
| R9 | Unknown parameter returns HTTP 400 | Fixed parameter-name allowlist; user input is never a parameter name (§5.5) |

## 10. Non-goals

- Nearest-store discovery (`buildGeoSearchUseCase` / `geoSearchRepository`) — untouched (§2.2).
- The `/geocode/structured` endpoint — no current caller needs it.
- Rendering landmarks in rider-facing UI — data only this phase (§6.3).
- Deleting or shrinking the bundled dataset — it is the fallback and stays.
- Backfilling PSGC codes onto Quadruper results — Photon has no PSGC data, and the only consumer
  is a React key fallback.
- Migrating existing stored `address_line` values — no backfill, no rewrite of saved addresses.

## 11. Acceptance criteria

- [ ] Reverse geocode outside Iloilo/Oton/Pavia returns a real composed address instead of
      `precision="coordinate_only"`.
- [ ] `address_line` for `10.7392,122.4931` is `Abilay Norte, Oton, Iloilo, Philippines`.
- [ ] `address_line` for `10.7202,122.5621` is `Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines`
      and is never `Peri Todd's Burger`.
- [ ] Reverse geocode returns a non-empty `landmarks[]` at `10.7202,122.5621`, deduped, distance-sorted,
      capped at 5, containing no `type=street` feature.
- [ ] Forward search for `Poblacion` biased to `10.72,122.56` returns Iloilo-region results ahead of
      Metro Manila ones.
- [ ] With the service unreachable, both endpoints still respond 200 with `provider="dgfy-ph-local"`
      or `precision="coordinate_only"`; saving valid coordinates is never blocked.
- [ ] `GEOCODE_QUADRUPER_ENABLED=false` restores today's behavior exactly.
- [ ] No Photon-shaped object escapes `providers/` or `mappers/`.
- [ ] `npm run check:compliance`, `npm run check:architecture`, and `npm run lint:docs` pass.
- [ ] ADR 0013 amendment, `minor` compliance declaration, and Phase 337 ledger entry are all present
      in the PR.
