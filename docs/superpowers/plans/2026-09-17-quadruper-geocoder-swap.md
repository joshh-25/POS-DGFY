# Quadruper Geocoder Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bundled 37-entry PH-local geocoder in `apps/dgfy-api/src/modules/geoSearch` with the self-hosted Quadruper (Photon over OSM) service, keeping the bundled dataset as an automatic fallback and adding nearby-landmark output to reverse geocoding.

**Architecture:** A provider pair (`quadruperGeocodeProvider`, `localGeocodeProvider`) behind one interface, with pure mapper/classifier units between the wire format and the DGFY contract. The use case keeps only the fallback policy: Quadruper → local dataset → `coordinate_only`. No Photon-shaped object escapes `providers/` or `mappers/`.

**Tech Stack:** Node 20 ESM, Express, Joi, Jest (`--experimental-vm-modules`), Redis (`node-redis` v4), native `fetch` + `AbortController`.

**Spec:** `docs/superpowers/specs/2026-09-17-quadruper-geocoder-swap-design.md`

## Global Constraints

- **Phase 337.** The authoritative ledger `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` ends at Phase 336. Do not renumber.
- **Never name a new directory under `modules/geoSearch/` `services/`.** `scripts/check-architecture-guardrails.js:155-159` fails any `usecases/*.js` whose source matches `/from\s+['"][^'"]*\/services(?:\/[^'"]*)?['"]/`. The new directories are `providers/`, `mappers/`, `landmarks/`, `shared/`.
- **Models may only be imported inside `repositories/`** (`check-architecture-guardrails.js:171`). None of the new files import a model.
- **All tests live in `apps/dgfy-api/tests/`.** Jest config sets `roots: ['<rootDir>/tests']`; colocated tests are not discovered.
- **Test command, from the repo root:** `npm --prefix apps/dgfy-api test -- <relative test path>`. Never `cd` first (see `.claude/rules/bash-path-resolution.md`).
- **Branch:** work continues on `docs/quadruper-geocoder-spec`, or a fresh `feature/quadruper-geocoder` cut from `origin/develop`. **PR base is `develop`.** Never `staging`, never `main`.
- **A GitHub issue must exist and be linked before the PR is opened** (`docs/process/ISSUE-TAXONOMY.md`). File via `/pm`. Use `Refs #N` unless the issue is fully closed by this work.
- `geometry.coordinates` from Quadruper is **`[lon, lat]`**. Convert in exactly one place: `mappers/photonFeatureMapper.js`.
- Every Quadruper address property is **nullable**. Never assume presence.
- HTTP 200 with `features: []` is a **miss**, not an error.
- **A reverse-geocode failure must never block saving valid coordinates.** Existing contract in ADR 0013 and `docs/api/specification.md`.
- Commit messages use Conventional Commits per `docs/ai/PR.md`. Scan `rg "DO NOT COMMIT"` over changed files before each commit.

---

## Spec clarification adopted by this plan

The spec's §5.1 rule "never use `properties.name` as the address label" is **correct for reverse geocoding only**, where the nearest feature is often a POI (`"Peri Todd's Burger"`).

**Forward search is the opposite case** and the spec did not distinguish it. For `q=Poblacion` biased to Iloilo, the top result carries `name="Poblacion"`, `city="Pavia"`, `state="Iloilo"` and **no** `locality`/`district`. Composing from address properties alone yields `"Pavia, Iloilo, Philippines"` — silently dropping the very term the user searched for.

Therefore forward search **prepends `name`** when it is not already a segment (Task 2, `prependName`), producing `"Poblacion, Pavia, Iloilo, Philippines"`. Reverse geocoding never does this. Task 9 records this distinction in the spec file.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/modules/geoSearch/shared/geoDistance.js` | Haversine, extracted from the use case | 1 |
| `src/modules/geoSearch/landmarks/landmarkClassifier.js` | `osm_key`/`osm_value` allowlist → is-landmark + category | 1 |
| `src/modules/geoSearch/mappers/photonFeatureMapper.js` | Photon Feature → DGFY contract; label composer; precision map; landmark assembly | 2 |
| `src/config/geocodeConfig.js` | Env-driven base URL, enable flag, timeout, TTL, PH bbox | 3 |
| `src/modules/geoSearch/providers/quadruperGeocodeProvider.js` | HTTP client; param allowlist; timeout; error handling | 3 |
| `src/modules/geoSearch/providers/localGeocodeProvider.js` | Bundled-dataset provider, extracted from the use case | 4 |
| `src/modules/geoSearch/providers/geocodeCircuitBreaker.js` | 5-failure / 60 s breaker | 5 |
| `src/modules/geoSearch/providers/geocodeCache.js` | Redis cache keyed on `import_date` | 5 |
| `src/modules/geoSearch/usecases/geoSearchUseCases.js` | MODIFY — fallback policy only | 6 |
| `src/modules/geoSearch/index.js` | MODIFY — DI wiring | 6 |
| `src/validators/geoSearchValidator.js` | MODIFY — optional paired `lat`/`lon` bias | 7 |
| `src/modules/geoSearch/controllers/geoSearchHandlers.js` | MODIFY — pass bias through | 7 |
| `packages/web-core/src/components/maps/MapPinPicker.jsx` | MODIFY — send map center as bias | 8 |
| ADR 0013 amendment, compliance declaration, phase ledger, API spec, READMEs | Governance | 9 |

---

### Task 1: Distance util and landmark classifier

Two pure units with no dependencies. Extracting the haversine first means Task 2 and Task 4 both consume one implementation rather than duplicating it.

**Files:**
- Create: `apps/dgfy-api/src/modules/geoSearch/shared/geoDistance.js`
- Create: `apps/dgfy-api/src/modules/geoSearch/landmarks/landmarkClassifier.js`
- Test: `apps/dgfy-api/tests/geoLandmarkClassifier.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `distanceKm({latitude, longitude}, {latitude, longitude}) -> number`
  - `distanceMeters({latitude, longitude}, {latitude, longitude}) -> number` (integer)
  - `isLandmarkFeature(properties) -> boolean`
  - `landmarkCategory(properties) -> string`

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoLandmarkClassifier.test.js`:

```javascript
import { distanceMeters } from '../src/modules/geoSearch/shared/geoDistance.js';
import { isLandmarkFeature, landmarkCategory } from '../src/modules/geoSearch/landmarks/landmarkClassifier.js';

describe('geoDistance', () => {
    it('returns an integer metre distance between two nearby points', () => {
        const metres = distanceMeters(
            { latitude: 10.7202, longitude: 122.5621 },
            { latitude: 10.7200869, longitude: 122.5620412 }
        );
        expect(Number.isInteger(metres)).toBe(true);
        expect(metres).toBeGreaterThanOrEqual(0);
        expect(metres).toBeLessThan(50);
    });

    it('returns 0 for identical points', () => {
        expect(distanceMeters(
            { latitude: 10.72, longitude: 122.56 },
            { latitude: 10.72, longitude: 122.56 }
        )).toBe(0);
    });
});

describe('landmarkClassifier', () => {
    // Every key in LANDMARK_OSM_KEYS must appear here. A dropped key would otherwise
    // go uncaught, and a test name must never claim coverage it does not have.
    it('accepts named features from all allowlist categories', () => {
        expect(isLandmarkFeature({ name: "Peri Todd's Burger", osm_key: 'amenity', osm_value: 'restaurant', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'SM Hypermarket', osm_key: 'shop', osm_value: 'supermarket', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'Sony Dormitory', osm_key: 'tourism', osm_value: 'hostel', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'LBC', osm_key: 'office', osm_value: 'courier', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'City Health Center', osm_key: 'healthcare', osm_value: 'clinic', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'Freedom Park', osm_key: 'leisure', osm_value: 'park', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'ABC Elementary School', osm_key: 'education', osm_value: 'school', type: 'house' })).toBe(true);
        expect(isLandmarkFeature({ name: 'Unit 4B', osm_key: 'building', osm_value: 'apartments', type: 'house' })).toBe(true);
    });

    it('accepts a named bus stop, which riders use as a reference point', () => {
        expect(isLandmarkFeature({ name: 'Comision Civil - Jalandoni', osm_key: 'highway', osm_value: 'bus_stop', type: 'house' })).toBe(true);
    });

    it('rejects street features even when named', () => {
        expect(isLandmarkFeature({ name: 'Jalandoni Street', osm_key: 'highway', osm_value: 'secondary', type: 'street' })).toBe(false);
    });

    it('rejects unnamed features', () => {
        expect(isLandmarkFeature({ name: '', osm_key: 'amenity', osm_value: 'restaurant', type: 'house' })).toBe(false);
        expect(isLandmarkFeature({ osm_key: 'shop', osm_value: 'convenience', type: 'house' })).toBe(false);
    });

    it('rejects administrative place features', () => {
        expect(isLandmarkFeature({ name: 'Abilay Norte', osm_key: 'place', osm_value: 'village', type: 'district' })).toBe(false);
    });

    it('handles null and undefined properties without throwing', () => {
        expect(isLandmarkFeature(null)).toBe(false);
        expect(isLandmarkFeature(undefined)).toBe(false);
    });

    it('reports the osm_key as the category', () => {
        expect(landmarkCategory({ osm_key: 'shop' })).toBe('shop');
        expect(landmarkCategory({})).toBe('other');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoLandmarkClassifier.test.js`
Expected: FAIL — `Cannot find module '../src/modules/geoSearch/shared/geoDistance.js'`

- [ ] **Step 3: Write the distance util**

Create `apps/dgfy-api/src/modules/geoSearch/shared/geoDistance.js`:

```javascript
const EARTH_RADIUS_KM = 6371;

const toRadians = (value) => (value * Math.PI) / 180;

export const distanceKm = (first, second) => {
    const dLat = toRadians(second.latitude - first.latitude);
    const dLon = toRadians(second.longitude - first.longitude);
    const lat1 = toRadians(first.latitude);
    const lat2 = toRadians(second.latitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const distanceMeters = (first, second) => Math.round(distanceKm(first, second) * 1000);
```

- [ ] **Step 4: Write the landmark classifier**

Create `apps/dgfy-api/src/modules/geoSearch/landmarks/landmarkClassifier.js`:

```javascript
// Categories a delivery rider can actually navigate by. `place`/`landuse`/`boundary` are
// deliberately excluded: they are administrative areas, already carried by `components`.
const LANDMARK_OSM_KEYS = new Set([
    'amenity',
    'shop',
    'tourism',
    'office',
    'leisure',
    'healthcare',
    'education',
    'building'
]);

// Exact key:value pairs allowed even when the key is not in the set above.
const LANDMARK_KEY_VALUE_PAIRS = new Set(['highway:bus_stop']);

export const isLandmarkFeature = (properties) => {
    if (!properties) return false;

    const name = String(properties.name || '').trim();
    if (!name) return false;

    // Street names are surfaced as `components.street`, never as a landmark.
    if (String(properties.type || '').trim() === 'street') return false;

    const osmKey = String(properties.osm_key || '').trim();
    const osmValue = String(properties.osm_value || '').trim();

    if (LANDMARK_KEY_VALUE_PAIRS.has(`${osmKey}:${osmValue}`)) return true;
    return LANDMARK_OSM_KEYS.has(osmKey);
};

export const landmarkCategory = (properties) => (
    String(properties?.osm_key || '').trim() || 'other'
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoLandmarkClassifier.test.js`
Expected: PASS — 9 tests

- [ ] **Step 6: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/modules/geoSearch/shared/geoDistance.js apps/dgfy-api/src/modules/geoSearch/landmarks/landmarkClassifier.js apps/dgfy-api/tests/geoLandmarkClassifier.test.js
git add apps/dgfy-api/src/modules/geoSearch/shared/geoDistance.js apps/dgfy-api/src/modules/geoSearch/landmarks/landmarkClassifier.js apps/dgfy-api/tests/geoLandmarkClassifier.test.js
git commit -m "feat(geocoder): add shared distance util and landmark classifier"
```

---

### Task 2: Photon feature mapper

The unit that owns every wire-format concern: `[lon, lat]` ordering, the defensive label composer, precision mapping, and landmark assembly. Fixtures are the real probe responses recorded 2026-09-17.

**Files:**
- Create: `apps/dgfy-api/src/modules/geoSearch/mappers/photonFeatureMapper.js`
- Test: `apps/dgfy-api/tests/geoPhotonFeatureMapper.test.js`

**Interfaces:**
- Consumes: `distanceMeters` (Task 1), `isLandmarkFeature`, `landmarkCategory` (Task 1).
- Produces:
  - `QUADRUPER_PROVIDER` — the string `'dgfy-quadruper'`
  - `composeAddressLine(properties) -> string`
  - `mapPrecision(properties) -> string`
  - `mapComponents(properties) -> {street, locality, district, city, state, postcode}` (all nullable)
  - `mapLandmarks(features, origin) -> Array<{name, category, osm_key, osm_value, distance_meters, latitude, longitude}>`
  - `mapReverseGeocodeResponse(payload, {latitude, longitude}) -> object | null`
  - `mapForwardSearchResponse(payload) -> Array<object>`

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoPhotonFeatureMapper.test.js`:

```javascript
import {
    QUADRUPER_PROVIDER,
    composeAddressLine,
    mapComponents,
    mapForwardSearchResponse,
    mapLandmarks,
    mapPrecision,
    mapReverseGeocodeResponse
} from '../src/modules/geoSearch/mappers/photonFeatureMapper.js';

// Recorded live from https://quadruper.com/geocode on 2026-09-17.
const OTON_STREET_PROPERTIES = {
    osm_type: 'W', osm_id: 170405621, osm_key: 'highway', osm_value: 'residential',
    type: 'street', name: 'Rizal Avenue', district: 'Abilay Norte', city: 'Oton',
    state: 'Iloilo', country: 'Philippines', postcode: '5020', countrycode: 'PH'
};

const ILOILO_RESTAURANT_PROPERTIES = {
    osm_type: 'N', osm_id: 3141074610, osm_key: 'amenity', osm_value: 'restaurant',
    type: 'house', name: "Peri Todd's Burger", street: 'Jalandoni Street',
    locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City',
    state: 'Western Visayas', country: 'Philippines', postcode: '5000', countrycode: 'PH'
};

const feature = (properties, longitude, latitude) => ({
    type: 'Feature', properties, geometry: { type: 'Point', coordinates: [longitude, latitude] }
});

describe('composeAddressLine', () => {
    it('places the barangay first when it arrives in `district` (Oton shape)', () => {
        expect(composeAddressLine(OTON_STREET_PROPERTIES))
            .toBe('Abilay Norte, Oton, Iloilo, Philippines');
    });

    it('keeps both barangay and district when both exist (Iloilo City shape)', () => {
        expect(composeAddressLine(ILOILO_RESTAURANT_PROPERTIES))
            .toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
    });

    it('deduplicates case-insensitively repeated segments', () => {
        expect(composeAddressLine({ locality: 'Pavia', district: 'pavia', city: 'Pavia', state: 'Iloilo' }))
            .toBe('Pavia, Iloilo, Philippines');
    });

    it('survives an entirely empty property bag', () => {
        expect(composeAddressLine({})).toBe('Philippines');
        expect(composeAddressLine(null)).toBe('Philippines');
    });

    it('caps at five segments', () => {
        const label = composeAddressLine({
            locality: 'A', district: 'B', city: 'C', state: 'D'
        });
        expect(label.split(', ')).toHaveLength(5);
    });
});

describe('mapPrecision', () => {
    it('maps Photon granularity onto the DGFY vocabulary', () => {
        expect(mapPrecision({ type: 'house' })).toBe('house');
        expect(mapPrecision({ type: 'street' })).toBe('street');
        expect(mapPrecision({ type: 'locality' })).toBe('barangay');
        expect(mapPrecision({ type: 'district' })).toBe('barangay');
        expect(mapPrecision({ type: 'city' })).toBe('city');
        expect(mapPrecision({ type: 'county' })).toBe('city');
        expect(mapPrecision({ type: 'state' })).toBe('province');
        expect(mapPrecision({ type: 'country' })).toBe('province');
    });

    it('falls back to the most specific component present when type is absent or `other`', () => {
        expect(mapPrecision({ type: 'other', district: 'Jaro' })).toBe('barangay');
        expect(mapPrecision({ city: 'Oton' })).toBe('city');
        expect(mapPrecision({ state: 'Iloilo' })).toBe('province');
        expect(mapPrecision({})).toBe('coordinate_only');
    });
});

describe('mapComponents', () => {
    it('returns every address field, nulling the absent ones', () => {
        expect(mapComponents(ILOILO_RESTAURANT_PROPERTIES)).toEqual({
            street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro',
            city: 'Iloilo City', state: 'Western Visayas', postcode: '5000'
        });
        expect(mapComponents({})).toEqual({
            street: null, locality: null, district: null, city: null, state: null, postcode: null
        });
    });
});

describe('mapLandmarks', () => {
    const origin = { latitude: 10.7202, longitude: 122.5621 };

    it('collapses a duplicate name that arrives under two different osm_values', () => {
        const landmarks = mapLandmarks([
            feature({ name: 'SM Hypermarket', osm_key: 'shop', osm_value: 'supermarket', type: 'house' }, 122.5634, 10.7211),
            feature({ name: 'SM Hypermarket', osm_key: 'shop', osm_value: 'mall', type: 'house' }, 122.5700, 10.7300)
        ], origin);

        expect(landmarks).toHaveLength(1);
        expect(landmarks[0].osm_value).toBe('supermarket');
    });

    it('excludes street features and sorts the rest by ascending distance', () => {
        const landmarks = mapLandmarks([
            feature({ name: 'Far Pharmacy', osm_key: 'amenity', osm_value: 'pharmacy', type: 'house' }, 122.5700, 10.7280),
            feature({ name: 'Jalandoni Street', osm_key: 'highway', osm_value: 'secondary', type: 'street' }, 122.5622, 10.7203),
            feature({ name: 'Near Store', osm_key: 'shop', osm_value: 'convenience', type: 'house' }, 122.5622, 10.7203)
        ], origin);

        expect(landmarks.map((entry) => entry.name)).toEqual(['Near Store', 'Far Pharmacy']);
        expect(landmarks[0].distance_meters).toBeLessThan(landmarks[1].distance_meters);
    });

    it('caps the list at five entries', () => {
        const many = Array.from({ length: 9 }, (_, index) => feature(
            { name: `Shop ${index}`, osm_key: 'shop', osm_value: 'convenience', type: 'house' },
            122.5621 + (index + 1) * 0.001,
            10.7202
        ));
        expect(mapLandmarks(many, origin)).toHaveLength(5);
    });

    it('returns an empty array for a non-array input', () => {
        expect(mapLandmarks(null, origin)).toEqual([]);
        expect(mapLandmarks(undefined, origin)).toEqual([]);
    });

    it('skips features whose geometry is missing or malformed', () => {
        expect(mapLandmarks([
            { properties: { name: 'No Geometry', osm_key: 'shop', osm_value: 'mall', type: 'house' } }
        ], origin)).toEqual([]);
    });
});

describe('mapReverseGeocodeResponse', () => {
    const origin = { latitude: 10.7202, longitude: 122.5621 };

    it('never uses the nearest feature name as the address line', () => {
        const result = mapReverseGeocodeResponse({
            type: 'FeatureCollection',
            features: [feature(ILOILO_RESTAURANT_PROPERTIES, 122.5620412, 10.7200869)]
        }, origin);

        expect(result.address_line).toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
        expect(result.address_line).not.toContain('Peri Todd');
        expect(result.provider).toBe(QUADRUPER_PROVIDER);
        expect(result.precision).toBe('house');
        expect(result.components.street).toBe('Jalandoni Street');
        expect(Array.isArray(result.landmarks)).toBe(true);
    });

    it('reads coordinates as [lon, lat], not [lat, lon]', () => {
        const result = mapReverseGeocodeResponse({
            features: [feature(ILOILO_RESTAURANT_PROPERTIES, 122.5620412, 10.7200869)]
        }, origin);

        // Treating the pair as [lat, lon] would place the point thousands of km away.
        expect(result.distance_meters).toBeLessThan(100);
    });

    it('returns null for an empty feature collection', () => {
        expect(mapReverseGeocodeResponse({ type: 'FeatureCollection', features: [] }, origin)).toBeNull();
        expect(mapReverseGeocodeResponse({}, origin)).toBeNull();
        expect(mapReverseGeocodeResponse(null, origin)).toBeNull();
    });
});

describe('mapForwardSearchResponse', () => {
    it('prepends the matched place name so the searched term survives', () => {
        const results = mapForwardSearchResponse({
            features: [feature(
                { name: 'Poblacion', osm_key: 'place', osm_value: 'village', type: 'district',
                  city: 'Pavia', state: 'Iloilo', country: 'Philippines', countrycode: 'PH' },
                122.5480, 10.7760
            )]
        });

        expect(results).toHaveLength(1);
        expect(results[0].address_line).toBe('Poblacion, Pavia, Iloilo, Philippines');
        expect(results[0].latitude).toBeCloseTo(10.7760, 4);
        expect(results[0].longitude).toBeCloseTo(122.5480, 4);
        expect(results[0].provider).toBe(QUADRUPER_PROVIDER);
    });

    it('does not duplicate a name that is already a segment', () => {
        const results = mapForwardSearchResponse({
            features: [feature(
                { name: 'Oton', osm_key: 'place', osm_value: 'town', type: 'city',
                  city: 'Oton', state: 'Iloilo' },
                122.4931, 10.7392
            )]
        });

        expect(results[0].address_line).toBe('Oton, Iloilo, Philippines');
    });

    it('drops features with unusable geometry and returns [] for an empty collection', () => {
        expect(mapForwardSearchResponse({ features: [{ properties: { name: 'X' } }] })).toEqual([]);
        expect(mapForwardSearchResponse({ features: [] })).toEqual([]);
        expect(mapForwardSearchResponse(null)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoPhotonFeatureMapper.test.js`
Expected: FAIL — `Cannot find module '../src/modules/geoSearch/mappers/photonFeatureMapper.js'`

- [ ] **Step 3: Write the mapper**

Create `apps/dgfy-api/src/modules/geoSearch/mappers/photonFeatureMapper.js`:

```javascript
import { distanceMeters } from '../shared/geoDistance.js';
import { isLandmarkFeature, landmarkCategory } from '../landmarks/landmarkClassifier.js';

export const QUADRUPER_PROVIDER = 'dgfy-quadruper';

const MAX_LABEL_SEGMENTS = 5;
const MAX_LANDMARKS = 5;

const PRECISION_BY_TYPE = {
    house: 'house',
    street: 'street',
    locality: 'barangay',
    district: 'barangay',
    city: 'city',
    county: 'city',
    state: 'province',
    country: 'province'
};

const clean = (value) => {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
};

const dedupeSegments = (segments) => {
    const seen = new Set();
    const output = [];
    segments.forEach((segment) => {
        if (!segment) return;
        const key = segment.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        output.push(segment);
    });
    return output;
};

/**
 * Photon's PH index is inconsistent about which field carries the barangay and whether
 * `state` holds a province or a region (verified live 2026-09-17: Oton puts the barangay in
 * `district` with `state="Iloilo"`, while Iloilo City puts it in `locality` with
 * `state="Western Visayas"`). Compose defensively rather than trusting a fixed field.
 */
export const composeAddressLine = (properties) => {
    const locality = clean(properties?.locality);
    const district = clean(properties?.district);
    const city = clean(properties?.city);
    const state = clean(properties?.state);

    const primary = locality || district;
    const ordered = [primary, locality ? district : null, city, state, 'Philippines'];

    return dedupeSegments(ordered).slice(0, MAX_LABEL_SEGMENTS).join(', ');
};

export const mapPrecision = (properties) => {
    const type = String(properties?.type || '').trim();
    const mapped = PRECISION_BY_TYPE[type];
    if (mapped) return mapped;

    if (clean(properties?.locality) || clean(properties?.district)) return 'barangay';
    if (clean(properties?.city)) return 'city';
    if (clean(properties?.state)) return 'province';
    return 'coordinate_only';
};

export const mapComponents = (properties) => ({
    street: clean(properties?.street),
    locality: clean(properties?.locality),
    district: clean(properties?.district),
    city: clean(properties?.city),
    state: clean(properties?.state),
    postcode: clean(properties?.postcode)
});

/** GeoJSON order is [lon, lat]. This is the only place that conversion happens. */
const toCoordinates = (feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const longitude = Number(coordinates[0]);
    const latitude = Number(coordinates[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
};

export const mapLandmarks = (features, origin) => {
    const nearestByName = new Map();

    (Array.isArray(features) ? features : []).forEach((feature) => {
        const properties = feature?.properties;
        if (!isLandmarkFeature(properties)) return;

        const coordinates = toCoordinates(feature);
        if (!coordinates) return;

        const name = String(properties.name).trim();
        const candidate = {
            name,
            category: landmarkCategory(properties),
            osm_key: String(properties.osm_key || '').trim(),
            osm_value: String(properties.osm_value || '').trim(),
            distance_meters: distanceMeters(origin, coordinates),
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
        };

        // The same POI can appear under two osm_values (observed: SM Hypermarket as both
        // shop.supermarket and shop.mall), so dedupe on name and keep the nearest.
        const existing = nearestByName.get(name.toLowerCase());
        if (!existing || candidate.distance_meters < existing.distance_meters) {
            nearestByName.set(name.toLowerCase(), candidate);
        }
    });

    return Array.from(nearestByName.values())
        .sort((a, b) => a.distance_meters - b.distance_meters)
        .slice(0, MAX_LANDMARKS);
};

export const mapReverseGeocodeResponse = (payload, { latitude, longitude }) => {
    const features = Array.isArray(payload?.features) ? payload.features : [];
    if (features.length === 0) return null;

    const nearest = features[0];
    const properties = nearest?.properties || {};
    const addressLine = composeAddressLine(properties);
    if (!addressLine) return null;

    const origin = { latitude, longitude };
    const nearestCoordinates = toCoordinates(nearest);

    return {
        address_line: addressLine,
        provider: QUADRUPER_PROVIDER,
        precision: mapPrecision(properties),
        distance_meters: nearestCoordinates ? distanceMeters(origin, nearestCoordinates) : null,
        components: mapComponents(properties),
        landmarks: mapLandmarks(features, origin)
    };
};

/**
 * Forward search is the mirror image of reverse: here `name` IS the match the user typed
 * (`q=Poblacion` returns name="Poblacion", city="Pavia" with no locality/district), so
 * dropping it would discard the searched term. Reverse never does this.
 */
const prependName = (name, addressLine) => {
    if (!name) return addressLine;
    const segments = addressLine.split(', ');
    if (segments.some((segment) => segment.toLowerCase() === name.toLowerCase())) return addressLine;
    return [name, ...segments].slice(0, MAX_LABEL_SEGMENTS).join(', ');
};

export const mapForwardSearchResponse = (payload) => {
    const features = Array.isArray(payload?.features) ? payload.features : [];

    return features
        .map((feature) => {
            const properties = feature?.properties || {};
            const coordinates = toCoordinates(feature);
            if (!coordinates) return null;

            const addressLine = prependName(clean(properties.name), composeAddressLine(properties));
            if (!addressLine) return null;

            return {
                address_line: addressLine,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                precision: mapPrecision(properties),
                provider: QUADRUPER_PROVIDER,
                components: mapComponents(properties)
            };
        })
        .filter(Boolean);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoPhotonFeatureMapper.test.js`
Expected: PASS — 18 tests

- [ ] **Step 5: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/modules/geoSearch/mappers/photonFeatureMapper.js apps/dgfy-api/tests/geoPhotonFeatureMapper.test.js
git add apps/dgfy-api/src/modules/geoSearch/mappers/photonFeatureMapper.js apps/dgfy-api/tests/geoPhotonFeatureMapper.test.js
git commit -m "feat(geocoder): map Photon features onto the DGFY geocode contract"
```

---

### Task 3: Quadruper HTTP provider and config

**Files:**
- Create: `apps/dgfy-api/src/config/geocodeConfig.js`
- Create: `apps/dgfy-api/src/modules/geoSearch/providers/quadruperGeocodeProvider.js`
- Test: `apps/dgfy-api/tests/geoQuadruperProvider.test.js`

**Interfaces:**
- Consumes: `mapForwardSearchResponse`, `mapReverseGeocodeResponse` (Task 2).
- Produces:
  - `geocodeConfig` — `{baseUrl, enabled, timeoutMs, cacheTtlSeconds, phBbox}`
  - `quadruperGeocodeProvider.reverseGeocode({latitude, longitude}) -> object | null | undefined`
  - `quadruperGeocodeProvider.searchAddresses({query, limit, biasLatitude, biasLongitude}) -> {results} | null | undefined`
  - `quadruperGeocodeProvider.getStatus() -> object | null`
  - `__testing.buildQuery(allowlist, values) -> string`, `FORWARD_PARAM_ALLOWLIST`, `REVERSE_PARAM_ALLOWLIST`

**Two distinct sentinels, and the distinction is load-bearing:**

| Return | Meaning | Circuit breaker |
|---|---|---|
| `undefined` | Transport failure — timeout, non-200, malformed body | **counts as a failure** |
| `null` | HTTP 200, no match — a genuine miss | **counts as a success** |
| object | A mapped result | counts as a success |

Collapsing both into `null` would mean five consecutive "no such address" searches open the breaker and degrade every user to the 37-entry dataset for 60 seconds. A miss is not an outage.

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoQuadruperProvider.test.js`:

```javascript
import {
    FORWARD_PARAM_ALLOWLIST,
    REVERSE_PARAM_ALLOWLIST,
    __testing,
    quadruperGeocodeProvider
} from '../src/modules/geoSearch/providers/quadruperGeocodeProvider.js';

const jsonResponse = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
});

const ILOILO_FEATURE = {
    type: 'Feature',
    properties: {
        osm_key: 'amenity', osm_value: 'restaurant', type: 'house', name: "Peri Todd's Burger",
        street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City',
        state: 'Western Visayas', country: 'Philippines', countrycode: 'PH'
    },
    geometry: { type: 'Point', coordinates: [122.5620412, 10.7200869] }
};

describe('quadruperGeocodeProvider', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns a mapped address on a successful reverse response', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        const result = await quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.address_line).toBe('Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines');
        expect(result.provider).toBe('dgfy-quadruper');
    });

    it('treats HTTP 200 with an empty feature list as a miss, not an error', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ type: 'FeatureCollection', features: [] }));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 1, longitude: 1 })).resolves.toBeNull();
    });

    it('returns the transport-failure sentinel on the flat HTTP 400 error shape', async () => {
        global.fetch = jest.fn(async () => jsonResponse(
            { message: 'q parameter is required when no include categories are specified' }, 400
        ));

        await expect(quadruperGeocodeProvider.searchAddresses({ query: 'x', limit: 5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel on the per-field HTTP 400 error shape', async () => {
        global.fetch = jest.fn(async () => jsonResponse(
            { lat: [{ message: 'TYPE_CONVERSION_FAILED', args: {}, value: 'abc' }] }, 400
        ));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel rather than throwing when the body is not JSON', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token < in JSON'); }
        }));

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('returns the transport-failure sentinel rather than throwing when the request aborts', async () => {
        global.fetch = jest.fn(async () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            throw error;
        });

        await expect(quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7, longitude: 122.5 })).resolves.toBeUndefined();
    });

    it('always sends the PH bbox and clamps limit to 20 on forward search', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.searchAddresses({ query: 'Bakhaw', limit: 999 });

        const url = new URL(global.fetch.mock.calls[0][0]);
        expect(url.searchParams.get('bbox')).toBe('114.20624,4.55472,126.60253,21.11770');
        expect(url.searchParams.get('limit')).toBe('20');
        expect(url.searchParams.get('lang')).toBe('en');
    });

    it('sends bias coordinates only when both are supplied', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.searchAddresses({ query: 'Poblacion', limit: 5, biasLatitude: 10.72, biasLongitude: 122.56 });
        const withBias = new URL(global.fetch.mock.calls[0][0]);
        expect(withBias.searchParams.get('lat')).toBe('10.72');
        expect(withBias.searchParams.get('lon')).toBe('122.56');

        global.fetch.mockClear();
        await quadruperGeocodeProvider.searchAddresses({ query: 'Poblacion', limit: 5 });
        const withoutBias = new URL(global.fetch.mock.calls[0][0]);
        expect(withoutBias.searchParams.has('lat')).toBe(false);
        expect(withoutBias.searchParams.has('lon')).toBe(false);
    });

    it('never emits a parameter name outside the allowlist', () => {
        const query = __testing.buildQuery(FORWARD_PARAM_ALLOWLIST, {
            q: 'test', limit: 5, bogus: 'should-not-appear', __proto__unsafe: 'no'
        });
        const params = new URLSearchParams(query);

        Array.from(params.keys()).forEach((key) => {
            expect(FORWARD_PARAM_ALLOWLIST).toContain(key);
        });
        expect(query).not.toContain('bogus');
    });

    it('URL-encodes values containing spaces and commas', () => {
        const query = __testing.buildQuery(REVERSE_PARAM_ALLOWLIST, { lat: 10.7, lon: 122.5 });
        expect(query).toContain('lat=10.7');

        const forward = __testing.buildQuery(FORWARD_PARAM_ALLOWLIST, { q: 'Ayala Avenue, Makati' });
        expect(forward).toContain('q=Ayala+Avenue%2C+Makati');
    });

    it('requests landmark-bearing reverse parameters', async () => {
        global.fetch = jest.fn(async () => jsonResponse({ features: [ILOILO_FEATURE] }));

        await quadruperGeocodeProvider.reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        const url = new URL(global.fetch.mock.calls[0][0]);
        expect(url.searchParams.get('radius')).toBe('0.4');
        expect(url.searchParams.get('limit')).toBe('15');
        expect(url.searchParams.get('distance_sort')).toBe('true');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoQuadruperProvider.test.js`
Expected: FAIL — `Cannot find module '../src/modules/geoSearch/providers/quadruperGeocodeProvider.js'`

- [ ] **Step 3: Write the config**

Create `apps/dgfy-api/src/config/geocodeConfig.js`:

```javascript
import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (raw, fallback) => {
    const text = String(raw ?? '').trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
    return fallback;
};

const parseInteger = (raw, fallback) => {
    const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const geocodeConfig = {
    baseUrl: (process.env.GEOCODE_QUADRUPER_BASE_URL || 'https://quadruper.com/geocode').replace(/\/+$/, ''),
    // Disabled by default under test so no suite can reach the network.
    enabled: parseBoolean(process.env.GEOCODE_QUADRUPER_ENABLED, process.env.NODE_ENV !== 'test'),
    timeoutMs: parseInteger(process.env.GEOCODE_QUADRUPER_TIMEOUT_MS, 2500),
    cacheTtlSeconds: parseInteger(process.env.GEO_GEOCODE_REDIS_CACHE_TTL_SECONDS, 900),
    // Documented full PH data extent. Applied as a hard filter, not a bias.
    phBbox: '114.20624,4.55472,126.60253,21.11770'
};
```

- [ ] **Step 4: Write the provider**

Create `apps/dgfy-api/src/modules/geoSearch/providers/quadruperGeocodeProvider.js`:

```javascript
import logger from '../../../config/logger.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import {
    mapForwardSearchResponse,
    mapReverseGeocodeResponse
} from '../mappers/photonFeatureMapper.js';

// An unknown parameter makes the service return HTTP 400, so parameter NAMES are fixed here
// and user input is only ever a parameter VALUE.
export const FORWARD_PARAM_ALLOWLIST = ['q', 'limit', 'lang', 'bbox', 'lat', 'lon'];
export const REVERSE_PARAM_ALLOWLIST = ['lat', 'lon', 'radius', 'limit', 'lang', 'distance_sort'];

const MAX_FORWARD_LIMIT = 20;
const REVERSE_RADIUS_KM = 0.4;
const REVERSE_LIMIT = 15;

const buildQuery = (allowlist, values) => {
    const params = new URLSearchParams();
    allowlist.forEach((name) => {
        const value = values[name];
        if (value === undefined || value === null || value === '') return;
        params.set(name, String(value));
    });
    return params.toString();
};

/** Returns `null` for every transport failure; the caller converts that to the `undefined` sentinel. */
const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), geocodeConfig.timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });

        if (!response.ok) {
            logger.warn('[Geocode] Quadruper returned a non-success status', { status: response.status });
            return null;
        }

        return await response.json();
    } catch (error) {
        logger.warn('[Geocode] Quadruper request failed', { err: error?.message, name: error?.name });
        return null;
    } finally {
        clearTimeout(timer);
    }
};

const hasBias = (latitude, longitude) => Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

/**
 * Returns `undefined` on a transport failure, `null` on a genuine miss (HTTP 200, no match),
 * and a mapped object on a hit. The use case's circuit breaker counts only `undefined` as a
 * failure — otherwise a run of unmatched searches would look identical to an outage.
 */
export const quadruperGeocodeProvider = {
    reverseGeocode: async ({ latitude, longitude }) => {
        const query = buildQuery(REVERSE_PARAM_ALLOWLIST, {
            lat: latitude,
            lon: longitude,
            radius: REVERSE_RADIUS_KM,
            limit: REVERSE_LIMIT,
            lang: 'en',
            distance_sort: 'true'
        });

        const payload = await fetchJson(`${geocodeConfig.baseUrl}/reverse?${query}`);
        if (payload === null || payload === undefined) return undefined;

        // May still be null: HTTP 200 with an empty feature list is a miss, not a failure.
        return mapReverseGeocodeResponse(payload, { latitude, longitude });
    },

    searchAddresses: async ({ query, limit, biasLatitude, biasLongitude }) => {
        const biased = hasBias(biasLatitude, biasLongitude);
        const search = buildQuery(FORWARD_PARAM_ALLOWLIST, {
            q: query,
            limit: Math.min(Number(limit) || 8, MAX_FORWARD_LIMIT),
            lang: 'en',
            bbox: geocodeConfig.phBbox,
            lat: biased ? biasLatitude : undefined,
            lon: biased ? biasLongitude : undefined
        });

        const payload = await fetchJson(`${geocodeConfig.baseUrl}/api?${search}`);
        if (payload === null || payload === undefined) return undefined;

        const results = mapForwardSearchResponse(payload);
        return results.length > 0 ? { results } : null;
    },

    getStatus: async () => fetchJson(`${geocodeConfig.baseUrl}/status`)
};

export const __testing = { buildQuery };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoQuadruperProvider.test.js`
Expected: PASS — 11 tests

- [ ] **Step 6: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/config/geocodeConfig.js apps/dgfy-api/src/modules/geoSearch/providers/quadruperGeocodeProvider.js apps/dgfy-api/tests/geoQuadruperProvider.test.js
git add apps/dgfy-api/src/config/geocodeConfig.js apps/dgfy-api/src/modules/geoSearch/providers/quadruperGeocodeProvider.js apps/dgfy-api/tests/geoQuadruperProvider.test.js
git commit -m "feat(geocoder): add Quadruper HTTP provider with strict param allowlist"
```

---

### Task 4: Local fallback provider (atomic move)

Move the bundled-dataset logic out of the use case and behind the same interface as Task 3.

**This is one atomic move: the new provider is created and the original helpers are deleted from
the use case in the same commit.** Creating the provider in one task and deleting the original in a
later one would put verbatim duplicated logic on the branch — ruled against 2026-09-17. A move is
one commit.

Behavior is preserved exactly, plus the `landmarks: []` and `components` additions.

**Files:**
- Create: `apps/dgfy-api/src/modules/geoSearch/providers/localGeocodeProvider.js`
- Modify: `apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js` — delete the extracted helpers, delegate to the provider
- Test: `apps/dgfy-api/tests/geoLocalProvider.test.js`
- Regression (must keep passing, **unmodified**): `apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js`

**Interfaces:**
- Consumes: `distanceKm` (Task 1), `PH_LOCAL_ADDRESS_DATASET` / `PH_LOCAL_ADDRESS_PROVIDER` / `PH_LOCAL_ADDRESS_PROVENANCE` (existing).
- Produces:
  - `localGeocodeProvider.reverseGeocode({latitude, longitude}) -> object` (never `null`; falls back to `coordinate_only`)
  - `localGeocodeProvider.searchAddresses({query, limit}) -> {results}` (possibly empty)

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoLocalProvider.test.js`:

```javascript
import { localGeocodeProvider } from '../src/modules/geoSearch/providers/localGeocodeProvider.js';

describe('localGeocodeProvider.reverseGeocode', () => {
    it('returns the covered barangay label with PSGC provenance', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result).toEqual(expect.objectContaining({
            address_line: 'Bito-on, Iloilo City, Iloilo, Philippines',
            provider: 'dgfy-ph-local',
            precision: 'barangay',
            psgc_code: '0631000019',
            parent_psgc_code: '0631000000'
        }));
        expect(result.address_line).not.toMatch(/^Near /i);
    });

    it('always returns a landmarks array, empty, since the bundled dataset has no POI data', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });
        expect(result.landmarks).toEqual([]);
    });

    // Cebu City. NOT Manila (14.5995, 120.9842) -- the bundled dataset has an exact
    // entry at those coordinates with maxDistanceKm 20, so it resolves to `city`, not
    // `coordinate_only`. Cebu City is ~155 km from the Iloilo province centroid
    // (55 km radius) and ~140 km from Guimaras (40 km radius), so it is genuinely uncovered.
    it('falls back to a coordinate-only label well outside covered municipalities', async () => {
        const result = await localGeocodeProvider.reverseGeocode({ latitude: 10.3157, longitude: 123.8854 });

        expect(result.precision).toBe('coordinate_only');
        expect(result.address_line).toBe('Pinned location (10.315700, 123.885400)');
        expect(result.landmarks).toEqual([]);
    });
});

describe('localGeocodeProvider.searchAddresses', () => {
    it('matches on every whitespace-separated token, case-insensitively', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'bito-on iloilo', limit: 8 });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].address_line).toContain('Bito-on');
        expect(results[0].provider).toBe('dgfy-ph-local');
    });

    it('returns an empty result set for an unmatched query', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'zzzz-not-a-place', limit: 8 });
        expect(results).toEqual([]);
    });

    it('honours the limit', async () => {
        const { results } = await localGeocodeProvider.searchAddresses({ query: 'iloilo', limit: 2 });
        expect(results.length).toBeLessThanOrEqual(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoLocalProvider.test.js`
Expected: FAIL — `Cannot find module '../src/modules/geoSearch/providers/localGeocodeProvider.js'`

- [ ] **Step 3: Write the local provider**

Create `apps/dgfy-api/src/modules/geoSearch/providers/localGeocodeProvider.js`. This logic is moved from `usecases/geoSearchUseCases.js` (removed there in Task 6):

```javascript
import { distanceKm } from '../shared/geoDistance.js';
import {
    PH_LOCAL_ADDRESS_DATASET,
    PH_LOCAL_ADDRESS_PROVIDER,
    PH_LOCAL_ADDRESS_PROVENANCE
} from '../data/phLocalAddressDataset.js';

const PRECISION_RANK = {
    barangay: 0,
    city: 1,
    province: 2,
    coordinate_only: 3
};

const EMPTY_COMPONENTS = Object.freeze({
    street: null, locality: null, district: null, city: null, state: null, postcode: null
});

const provenance = () => ({
    psgc_release: PH_LOCAL_ADDRESS_PROVENANCE.psgcRelease,
    generated_at: PH_LOCAL_ADDRESS_PROVENANCE.generatedAt
});

const coordinateFallback = ({ latitude, longitude }) => ({
    address_line: `Pinned location (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
    provider: PH_LOCAL_ADDRESS_PROVIDER,
    precision: 'coordinate_only',
    components: { ...EMPTY_COMPONENTS },
    landmarks: [],
    provenance: provenance()
});

export const localGeocodeProvider = {
    reverseGeocode: async ({ latitude, longitude }) => {
        const position = { latitude, longitude };

        const nearest = PH_LOCAL_ADDRESS_DATASET
            .map((place) => ({ ...place, distance_km: distanceKm(position, place) }))
            .filter((place) => place.distance_km <= place.maxDistanceKm)
            .sort((a, b) => {
                const precisionDelta = (PRECISION_RANK[a.precision] ?? 99) - (PRECISION_RANK[b.precision] ?? 99);
                if (precisionDelta !== 0) return precisionDelta;
                return a.distance_km - b.distance_km;
            })[0];

        if (!nearest) return coordinateFallback(position);

        return {
            address_line: nearest.label,
            provider: PH_LOCAL_ADDRESS_PROVIDER,
            precision: nearest.precision,
            distance_meters: Math.round(nearest.distance_km * 1000),
            psgc_code: nearest.psgcCode,
            parent_psgc_code: nearest.parentPsgcCode,
            components: { ...EMPTY_COMPONENTS },
            // The bundled dataset carries administrative centroids only, never POIs.
            landmarks: [],
            provenance: provenance()
        };
    },

    searchAddresses: async ({ query, limit = 8 }) => {
        const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const cap = Math.max(1, Math.min(Number(limit) || 8, 20));

        const results = PH_LOCAL_ADDRESS_DATASET
            .filter((place) => {
                const label = String(place.label || '').toLowerCase();
                return tokens.every((token) => label.includes(token));
            })
            .slice(0, cap)
            .map((place) => ({
                address_line: place.label,
                latitude: place.latitude,
                longitude: place.longitude,
                precision: place.precision,
                provider: PH_LOCAL_ADDRESS_PROVIDER,
                psgc_code: place.psgcCode,
                parent_psgc_code: place.parentPsgcCode,
                components: { ...EMPTY_COMPONENTS }
            }));

        return { results };
    }
};
```

- [ ] **Step 4: Delete the extracted logic from the use case and delegate**

In `apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js`, **delete** `toRadians`,
`distanceKm`, `coordinateFallback`, `precisionRank`, and `resolveLocalAddress` (lines 32-86 of the
original), delete the `PH_LOCAL_ADDRESS_*` import block, and replace both geocode builders. Leave
`buildGeoSearchUseCase` (nearest-store discovery) exactly as it is — it is a different concern.

The file becomes:

```javascript
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { localGeocodeProvider } from '../providers/localGeocodeProvider.js';

export const buildGeoSearchUseCase = ({ geoSearchRepository }) => {
    return async ({ query, latitude, longitude, radius, stockFilter, page, limit }) => {
        try {
            const result = await geoSearchRepository.searchNearbyStores({
                query,
                latitude,
                longitude,
                radius,
                stockFilter,
                page,
                limit
            });
            return ok(result);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Geo search failed',
                { statusCode: 500 }
            ));
        }
    };
};

const validationFailure = (message) => fail(new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422 }
));

export const buildReverseGeocodeUseCase = () => {
    return async ({ latitude, longitude }) => {
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return validationFailure('Latitude and longitude are required.');
        }

        const local = await localGeocodeProvider.reverseGeocode({ latitude: lat, longitude: lon });
        return ok({ ...local, latitude: lat, longitude: lon });
    };
};

export const buildAddressSearchUseCase = () => {
    return async ({ query, limit = 8 }) => {
        const normalizedQuery = String(query || '').trim();
        if (normalizedQuery.length < 2) {
            return validationFailure('Enter at least 2 characters to search for an address.');
        }

        return ok(await localGeocodeProvider.searchAddresses({ query: normalizedQuery, limit }));
    };
};
```

Task 6 adds the remote provider, breaker, and cache on top of this. Do not anticipate that here.

- [ ] **Step 5: Run the new test AND the existing regression suite**

Both matter: the second proves the move changed no behaviour. Do not edit the existing test file.

Run: `npm --prefix apps/dgfy-api test -- tests/geoLocalProvider.test.js tests/geoSearchReverseGeocode.usecase.test.js`
Expected: PASS — 6 new tests plus every pre-existing reverse-geocode case, unmodified

- [ ] **Step 6: Run the architecture guardrails**

Run: `npm --prefix apps/dgfy-api run check:architecture-guardrails`
Expected: PASS — confirms `usecases/geoSearchUseCases.js` imports no `/services` path

- [ ] **Step 7: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/modules/geoSearch/providers/localGeocodeProvider.js apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js apps/dgfy-api/tests/geoLocalProvider.test.js
git add apps/dgfy-api/src/modules/geoSearch/providers/localGeocodeProvider.js apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js apps/dgfy-api/tests/geoLocalProvider.test.js
git commit -m "refactor(geocoder): move bundled dataset behind the local provider interface"
```

---

### Task 5: Circuit breaker and Redis cache

**Files:**
- Create: `apps/dgfy-api/src/modules/geoSearch/providers/geocodeCircuitBreaker.js`
- Create: `apps/dgfy-api/src/modules/geoSearch/providers/geocodeCache.js`
- Test: `apps/dgfy-api/tests/geoCircuitBreaker.test.js`

**Interfaces:**
- Consumes: `geocodeConfig` (Task 3), `quadruperGeocodeProvider.getStatus` (Task 3), `getRedisClient`/`isRedisConnected` (existing `src/config/redis.js`).
- Produces:
  - `createCircuitBreaker({failureThreshold, openMs, now}) -> {isOpen(), recordSuccess(), recordFailure(), reset()}`
  - `geocodeCircuitBreaker` — module singleton, threshold 5, open 60 s
  - `readCache(key) -> Promise<object|null>`, `writeCache(key, value) -> Promise<void>`
  - `buildReverseCacheKey(importDate, latitude, longitude) -> string`
  - `buildForwardCacheKey(importDate, query, limit, biasLatitude, biasLongitude) -> string`
  - `resolveImportDate() -> Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoCircuitBreaker.test.js`:

```javascript
import { createCircuitBreaker } from '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js';
import { buildForwardCacheKey, buildReverseCacheKey } from '../src/modules/geoSearch/providers/geocodeCache.js';

describe('createCircuitBreaker', () => {
    const breakerAt = (clock) => createCircuitBreaker({ failureThreshold: 5, openMs: 60000, now: () => clock.value });

    it('stays closed below the failure threshold', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 4; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(false);
    });

    it('opens on the fifth consecutive failure', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(true);
    });

    it('closes again once the open window elapses', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 5; index += 1) breaker.recordFailure();
        expect(breaker.isOpen()).toBe(true);

        clock.value = 60001;
        expect(breaker.isOpen()).toBe(false);
    });

    it('resets the failure run on success, so intermittent failures never accumulate', () => {
        const clock = { value: 0 };
        const breaker = breakerAt(clock);

        for (let index = 0; index < 4; index += 1) breaker.recordFailure();
        breaker.recordSuccess();
        for (let index = 0; index < 4; index += 1) breaker.recordFailure();

        expect(breaker.isOpen()).toBe(false);
    });
});

describe('cache keys', () => {
    it('snaps reverse coordinates to five decimal places', () => {
        expect(buildReverseCacheKey('2026-09-12T23:03:36Z', 10.72021234, 122.56219876))
            .toBe('geo:rev:2026-09-12T23:03:36Z:10.72021:122.56220');
    });

    it('produces the same forward key for bias coordinates inside one 0.01 degree cell', () => {
        const first = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.7201, 122.5601);
        const second = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.7249, 122.5649);
        expect(first).toBe(second);
    });

    it('produces different keys for different queries and for a changed import date', () => {
        const base = buildForwardCacheKey('2026-09-12T23:03:36Z', 'Poblacion', 8, 10.72, 122.56);
        expect(base).not.toBe(buildForwardCacheKey('2026-09-12T23:03:36Z', 'Bakhaw', 8, 10.72, 122.56));
        expect(base).not.toBe(buildForwardCacheKey('2026-09-19T23:03:36Z', 'Poblacion', 8, 10.72, 122.56));
    });

    it('is case- and whitespace-insensitive on the query', () => {
        expect(buildForwardCacheKey('D', '  Poblacion  ', 8)).toBe(buildForwardCacheKey('D', 'poblacion', 8));
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoCircuitBreaker.test.js`
Expected: FAIL — `Cannot find module '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js'`

- [ ] **Step 3: Write the circuit breaker**

Create `apps/dgfy-api/src/modules/geoSearch/providers/geocodeCircuitBreaker.js`:

```javascript
const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 60000;

export const createCircuitBreaker = ({
    failureThreshold = DEFAULT_FAILURE_THRESHOLD,
    openMs = DEFAULT_OPEN_MS,
    now = () => Date.now()
} = {}) => {
    let consecutiveFailures = 0;
    let openedAt = null;

    const isOpen = () => {
        if (openedAt === null) return false;
        if (now() - openedAt >= openMs) {
            // Window elapsed: close and let one trial request through.
            openedAt = null;
            consecutiveFailures = 0;
            return false;
        }
        return true;
    };

    return {
        isOpen,
        recordSuccess: () => {
            consecutiveFailures = 0;
            openedAt = null;
        },
        recordFailure: () => {
            consecutiveFailures += 1;
            if (consecutiveFailures >= failureThreshold) openedAt = now();
        },
        reset: () => {
            consecutiveFailures = 0;
            openedAt = null;
        }
    };
};

export const geocodeCircuitBreaker = createCircuitBreaker();
```

- [ ] **Step 4: Write the cache**

Create `apps/dgfy-api/src/modules/geoSearch/providers/geocodeCache.js`:

```javascript
import crypto from 'crypto';
import logger from '../../../config/logger.js';
import { getRedisClient, isRedisConnected } from '../../../config/redis.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import { quadruperGeocodeProvider } from './quadruperGeocodeProvider.js';

const IMPORT_DATE_REFRESH_MS = 5 * 60 * 1000;
const UNKNOWN_IMPORT_DATE = 'unknown';

let cachedImportDate = null;
let cachedImportDateAt = 0;

/**
 * The index rebuilds weekly and a given osm_id's coordinates can move between rebuilds, so
 * every cache key embeds import_date. A rebuild therefore invalidates the whole namespace
 * without an explicit purge.
 */
export const resolveImportDate = async () => {
    if (cachedImportDate && Date.now() - cachedImportDateAt < IMPORT_DATE_REFRESH_MS) {
        return cachedImportDate;
    }

    const status = await quadruperGeocodeProvider.getStatus();
    cachedImportDate = String(status?.import_date || UNKNOWN_IMPORT_DATE);
    cachedImportDateAt = Date.now();
    return cachedImportDate;
};

export const buildReverseCacheKey = (importDate, latitude, longitude) => (
    `geo:rev:${importDate}:${Number(latitude).toFixed(5)}:${Number(longitude).toFixed(5)}`
);

export const buildForwardCacheKey = (importDate, query, limit, biasLatitude, biasLongitude) => {
    const normalized = String(query || '').trim().toLowerCase();
    const hash = crypto.createHash('sha1').update(normalized).digest('hex');
    const biasCell = Number.isFinite(Number(biasLatitude)) && Number.isFinite(Number(biasLongitude))
        ? `${(Math.floor(Number(biasLatitude) / 0.01) * 0.01).toFixed(2)}:${(Math.floor(Number(biasLongitude) / 0.01) * 0.01).toFixed(2)}`
        : 'nobias';
    return `geo:fwd:${importDate}:${hash}:${biasCell}:${limit}`;
};

const cacheEnabled = () => geocodeConfig.enabled && isRedisConnected();

export const readCache = async (key) => {
    if (!cacheEnabled()) return null;
    try {
        const cached = await getRedisClient().get(key);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        logger.warn('[Geocode] Redis cache read failed', { err: error?.message });
        return null;
    }
};

export const writeCache = async (key, value) => {
    if (!cacheEnabled()) return;
    try {
        await getRedisClient().setEx(key, geocodeConfig.cacheTtlSeconds, JSON.stringify(value));
    } catch (error) {
        logger.warn('[Geocode] Redis cache write failed', { err: error?.message });
    }
};

export const __testing = {
    resetImportDateCache: () => {
        cachedImportDate = null;
        cachedImportDateAt = 0;
    }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoCircuitBreaker.test.js`
Expected: PASS — 8 tests

- [ ] **Step 6: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/modules/geoSearch/providers/geocodeCircuitBreaker.js apps/dgfy-api/src/modules/geoSearch/providers/geocodeCache.js apps/dgfy-api/tests/geoCircuitBreaker.test.js
git add apps/dgfy-api/src/modules/geoSearch/providers/geocodeCircuitBreaker.js apps/dgfy-api/src/modules/geoSearch/providers/geocodeCache.js apps/dgfy-api/tests/geoCircuitBreaker.test.js
git commit -m "feat(geocoder): add circuit breaker and import-date-keyed geocode cache"
```

---

### Task 6: Rewire the use cases onto the fallback policy

The use case loses all data-lookup and distance code (now in Tasks 1 and 4) and keeps only the policy: Quadruper → local → `coordinate_only`.

**Files:**
- Modify: `apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js` — Task 4 already reduced this to local-only delegation; add the remote provider, breaker, and cache on top. `buildGeoSearchUseCase` stays untouched.
- Verify only (no edit expected): `apps/dgfy-api/src/modules/geoSearch/index.js`
- Modify: `apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js`
- Test: `apps/dgfy-api/tests/geoFallbackPolicy.test.js`

**Interfaces:**
- Consumes: `quadruperGeocodeProvider` (Task 3), `localGeocodeProvider` (Task 4), `geocodeCircuitBreaker`, cache helpers (Task 5), existing `ok`/`fail`/`DomainError`.
- Produces:
  - `buildReverseGeocodeUseCase({ remoteProvider, localProvider, circuitBreaker }) -> async ({latitude, longitude}) => ApplicationResult`
  - `buildAddressSearchUseCase({ remoteProvider, localProvider, circuitBreaker }) -> async ({query, limit, biasLatitude, biasLongitude}) => ApplicationResult`

Both builders take an options object with defaults, so tests inject fakes without touching the network. Existing callers that invoke them with **no** arguments keep working.

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoFallbackPolicy.test.js`:

```javascript
import {
    buildAddressSearchUseCase,
    buildReverseGeocodeUseCase
} from '../src/modules/geoSearch/usecases/geoSearchUseCases.js';
import { createCircuitBreaker } from '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js';

const remoteHit = {
    address_line: 'Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines',
    provider: 'dgfy-quadruper',
    precision: 'house',
    distance_meters: 12,
    components: { street: 'Jalandoni Street', locality: 'Bakhaw', district: 'Jaro', city: 'Iloilo City', state: 'Western Visayas', postcode: '5000' },
    landmarks: [{ name: 'SM Hypermarket', category: 'shop', osm_key: 'shop', osm_value: 'supermarket', distance_meters: 180, latitude: 10.7211, longitude: 122.5634 }]
};

const localHit = {
    address_line: 'Bito-on, Iloilo City, Iloilo, Philippines',
    provider: 'dgfy-ph-local',
    precision: 'barangay',
    psgc_code: '0631000019',
    components: { street: null, locality: null, district: null, city: null, state: null, postcode: null },
    landmarks: []
};

const fakeLocal = { reverseGeocode: async () => localHit, searchAddresses: async () => ({ results: [localHit] }) };

describe('reverse geocode fallback policy', () => {
    it('uses the remote provider when it answers', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => remoteHit },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7202, longitude: 122.5621 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-quadruper');
        expect(result.data.landmarks).toHaveLength(1);
        expect(result.data.latitude).toBe(10.7202);
        expect(result.data.longitude).toBe(122.5621);
    });

    it('falls back to local on a genuine miss', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => null },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-ph-local');
        expect(result.data.landmarks).toEqual([]);
    });

    it('falls back to local when the remote provider throws', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => { throw new Error('socket hang up'); } },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 10.7294, longitude: 122.5962 });

        expect(result.success).toBe(true);
        expect(result.data.provider).toBe('dgfy-ph-local');
    });

    it('stops calling the remote provider once transport failures open the breaker', async () => {
        const reverseGeocode = jest.fn(async () => undefined);
        const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 60000 });
        const useCase = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode },
            localProvider: fakeLocal,
            circuitBreaker: breaker
        });

        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        expect(breaker.isOpen()).toBe(true);

        reverseGeocode.mockClear();
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        expect(reverseGeocode).not.toHaveBeenCalled();
    });

    it('does NOT open the breaker on repeated genuine misses', async () => {
        const reverseGeocode = jest.fn(async () => null);
        const breaker = createCircuitBreaker({ failureThreshold: 2, openMs: 60000 });
        const useCase = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode },
            localProvider: fakeLocal,
            circuitBreaker: breaker
        });

        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });
        await useCase({ latitude: 10.7294, longitude: 122.5962 });

        expect(breaker.isOpen()).toBe(false);
        expect(reverseGeocode).toHaveBeenCalledTimes(3);
    });

    it('rejects non-finite coordinates with a validation failure', async () => {
        const reverseGeocode = buildReverseGeocodeUseCase({
            remoteProvider: { reverseGeocode: async () => remoteHit },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await reverseGeocode({ latitude: 'abc', longitude: null });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });
});

describe('address search fallback policy', () => {
    it('passes bias coordinates through to the remote provider', async () => {
        const searchAddresses = jest.fn(async () => ({ results: [remoteHit] }));
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        await useCase({ query: 'Poblacion', limit: 8, biasLatitude: 10.72, biasLongitude: 122.56 });

        expect(searchAddresses).toHaveBeenCalledWith(expect.objectContaining({
            query: 'Poblacion', limit: 8, biasLatitude: 10.72, biasLongitude: 122.56
        }));
    });

    it('falls back to the local dataset when the remote provider returns null', async () => {
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses: async () => null },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await useCase({ query: 'bito-on', limit: 8 });

        expect(result.success).toBe(true);
        expect(result.data.results[0].provider).toBe('dgfy-ph-local');
    });

    it('rejects a query shorter than two characters', async () => {
        const useCase = buildAddressSearchUseCase({
            remoteProvider: { searchAddresses: async () => ({ results: [] }) },
            localProvider: fakeLocal,
            circuitBreaker: createCircuitBreaker()
        });

        const result = await useCase({ query: 'a', limit: 8 });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoFallbackPolicy.test.js`
Expected: FAIL — the builders currently take no options, so injected fakes are ignored and `provider` is `dgfy-ph-local` in the first test.

- [ ] **Step 3: Add the remote path to the use case file**

Task 4 left this file delegating straight to `localGeocodeProvider`. Add the remote provider, the
circuit breaker, the cache, and the injectable options. Replace the whole file with:

```javascript
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { quadruperGeocodeProvider } from '../providers/quadruperGeocodeProvider.js';
import { localGeocodeProvider } from '../providers/localGeocodeProvider.js';
import { geocodeCircuitBreaker } from '../providers/geocodeCircuitBreaker.js';
import { geocodeConfig } from '../../../config/geocodeConfig.js';
import {
    buildForwardCacheKey,
    buildReverseCacheKey,
    readCache,
    resolveImportDate,
    writeCache
} from '../providers/geocodeCache.js';

export const buildGeoSearchUseCase = ({ geoSearchRepository }) => {
    return async ({ query, latitude, longitude, radius, stockFilter, page, limit }) => {
        try {
            const result = await geoSearchRepository.searchNearbyStores({
                query, latitude, longitude, radius, stockFilter, page, limit
            });
            return ok(result);
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Geo search failed',
                { statusCode: 500 }
            ));
        }
    };
};

const validationFailure = (message) => fail(new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422 }
));

/**
 * Calls the remote provider through the breaker. Returns null on any failure so the caller
 * falls through to the local provider. Never throws.
 */
const callRemote = async (circuitBreaker, invoke) => {
    if (!geocodeConfig.enabled || circuitBreaker.isOpen()) return null;

    try {
        const value = await invoke();
        // `undefined` is the provider's transport-failure sentinel. `null` is a genuine miss
        // (HTTP 200, no match) and must NOT trip the breaker, or a run of unmatched searches
        // would degrade every user to the bundled dataset for 60 seconds.
        if (value === undefined) {
            circuitBreaker.recordFailure();
            return null;
        }
        circuitBreaker.recordSuccess();
        return value;
    } catch (error) {
        circuitBreaker.recordFailure();
        return null;
    }
};

export const buildReverseGeocodeUseCase = ({
    remoteProvider = quadruperGeocodeProvider,
    localProvider = localGeocodeProvider,
    circuitBreaker = geocodeCircuitBreaker
} = {}) => {
    return async ({ latitude, longitude }) => {
        const lat = Number(latitude);
        const lon = Number(longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return validationFailure('Latitude and longitude are required.');
        }

        const importDate = geocodeConfig.enabled ? await resolveImportDate() : 'local';
        const cacheKey = buildReverseCacheKey(importDate, lat, lon);

        const cached = await readCache(cacheKey);
        if (cached) return ok({ ...cached, latitude: lat, longitude: lon });

        const remote = await callRemote(circuitBreaker, () => remoteProvider.reverseGeocode({ latitude: lat, longitude: lon }));
        if (remote) {
            // Only successful remote answers are cached, so an outage cannot pin a degraded
            // result for the full TTL.
            await writeCache(cacheKey, remote);
            return ok({ ...remote, latitude: lat, longitude: lon });
        }

        const local = await localProvider.reverseGeocode({ latitude: lat, longitude: lon });
        return ok({ ...local, latitude: lat, longitude: lon });
    };
};

export const buildAddressSearchUseCase = ({
    remoteProvider = quadruperGeocodeProvider,
    localProvider = localGeocodeProvider,
    circuitBreaker = geocodeCircuitBreaker
} = {}) => {
    return async ({ query, limit = 8, biasLatitude, biasLongitude }) => {
        const normalizedQuery = String(query || '').trim();
        if (normalizedQuery.length < 2) {
            return validationFailure('Enter at least 2 characters to search for an address.');
        }

        const importDate = geocodeConfig.enabled ? await resolveImportDate() : 'local';
        const cacheKey = buildForwardCacheKey(importDate, normalizedQuery, limit, biasLatitude, biasLongitude);

        const cached = await readCache(cacheKey);
        if (cached) return ok(cached);

        const remote = await callRemote(circuitBreaker, () => remoteProvider.searchAddresses({
            query: normalizedQuery, limit, biasLatitude, biasLongitude
        }));
        if (remote) {
            await writeCache(cacheKey, remote);
            return ok(remote);
        }

        return ok(await localProvider.searchAddresses({ query: normalizedQuery, limit }));
    };
};
```

- [ ] **Step 4: Confirm the DI entry point needs no change**

Both builders now default every new option, so `index.js` calling them with no arguments still
wires the real providers. **Make no edit.** Read the file and confirm it already reads exactly:

```javascript
import { geoSearchRepository } from './repositories/geoSearchRepository.js';
import { buildAddressSearchUseCase, buildGeoSearchUseCase, buildReverseGeocodeUseCase } from './usecases/geoSearchUseCases.js';

export const geoSearchUseCase = buildGeoSearchUseCase({ geoSearchRepository });
export const reverseGeocodeUseCase = buildReverseGeocodeUseCase();
export const addressSearchUseCase = buildAddressSearchUseCase();

export { geoSearchRepository };
```

If it differs, something earlier went wrong — stop and report rather than editing this file.

- [ ] **Step 5: Run the new test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoFallbackPolicy.test.js`
Expected: PASS — 9 tests

- [ ] **Step 6: Update the pre-existing reverse-geocode test**

`apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js` asserts `psgc_code: expect.any(String)` unconditionally, which now holds only on the local-fallback path. `GEOCODE_QUADRUPER_ENABLED` already defaults to `false` under `NODE_ENV=test`, so the existing cases still exercise the local provider — but make that explicit rather than incidental.

Insert this block immediately after the existing `import` lines at the top of the file:

```javascript
import { localGeocodeProvider } from '../src/modules/geoSearch/providers/localGeocodeProvider.js';
import { createCircuitBreaker } from '../src/modules/geoSearch/providers/geocodeCircuitBreaker.js';

// These cases assert the bundled-dataset contract (PSGC codes, provenance), which is now the
// FALLBACK path. Pin the providers explicitly so the suite never depends on the
// GEOCODE_QUADRUPER_ENABLED default to stay off.
const buildLocalOnlyReverseGeocode = () => buildReverseGeocodeUseCase({
    remoteProvider: { reverseGeocode: async () => null },
    localProvider: localGeocodeProvider,
    circuitBreaker: createCircuitBreaker()
});
```

Then replace every occurrence of `const reverseGeocode = buildReverseGeocodeUseCase();` in that file with:

```javascript
        const reverseGeocode = buildLocalOnlyReverseGeocode();
```

- [ ] **Step 7: Run the full geo suite to verify nothing regressed**

Run: `npm --prefix apps/dgfy-api test -- tests/geoSearchReverseGeocode.usecase.test.js tests/geoFallbackPolicy.test.js tests/geoLocalProvider.test.js tests/geoPhotonFeatureMapper.test.js tests/geoLandmarkClassifier.test.js tests/geoQuadruperProvider.test.js`
Expected: PASS — all suites green

- [ ] **Step 8: Run the architecture guardrails**

Run: `npm --prefix apps/dgfy-api run check:architecture-guardrails`
Expected: PASS — confirms no `usecases/*.js` file imports a `/services` path and no model import escaped `repositories/`

- [ ] **Step 9: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js apps/dgfy-api/tests/geoFallbackPolicy.test.js apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js
git add apps/dgfy-api/src/modules/geoSearch/usecases/geoSearchUseCases.js apps/dgfy-api/tests/geoFallbackPolicy.test.js apps/dgfy-api/tests/geoSearchReverseGeocode.usecase.test.js
git commit -m "refactor(geocoder): rewire use cases onto the remote-then-local fallback policy"
```

---

### Task 7: Bias parameters on the address-search endpoint

**Files:**
- Modify: `apps/dgfy-api/src/validators/geoSearchValidator.js:32-35`
- Modify: `apps/dgfy-api/src/modules/geoSearch/controllers/geoSearchHandlers.js:68-73`
- Test: `apps/dgfy-api/tests/geoAddressSearchValidator.test.js`

**Interfaces:**
- Consumes: `buildAddressSearchUseCase` bias parameter names (Task 6).
- Produces: `validateAddressSearchQuery` accepting optional paired `lat`/`lon`.

- [ ] **Step 1: Write the failing test**

Create `apps/dgfy-api/tests/geoAddressSearchValidator.test.js`:

```javascript
import { validateAddressSearchQuery } from '../src/validators/geoSearchValidator.js';

const runValidator = (query) => new Promise((resolve) => {
    const req = { query };
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve({ res: this, validated: null }); return this; }
    };
    validateAddressSearchQuery(req, res, () => resolve({ res, validated: req.validatedQuery }));
});

describe('validateAddressSearchQuery', () => {
    it('accepts a query with no bias, preserving existing caller behaviour', async () => {
        const { validated, res } = await runValidator({ query: 'Bakhaw' });

        expect(res.statusCode).toBeNull();
        expect(validated).toEqual(expect.objectContaining({ query: 'Bakhaw', limit: 8 }));
        expect(validated.lat).toBeUndefined();
        expect(validated.lon).toBeUndefined();
    });

    it('accepts a query with both bias coordinates', async () => {
        const { validated, res } = await runValidator({ query: 'Poblacion', lat: '10.72', lon: '122.56' });

        expect(res.statusCode).toBeNull();
        expect(validated.lat).toBe(10.72);
        expect(validated.lon).toBe(122.56);
    });

    it('rejects a half-supplied bias with 422', async () => {
        const latOnly = await runValidator({ query: 'Poblacion', lat: '10.72' });
        expect(latOnly.res.statusCode).toBe(422);

        const lonOnly = await runValidator({ query: 'Poblacion', lon: '122.56' });
        expect(lonOnly.res.statusCode).toBe(422);
    });

    it('rejects out-of-range bias coordinates with 422', async () => {
        const { res } = await runValidator({ query: 'Poblacion', lat: '999', lon: '122.56' });
        expect(res.statusCode).toBe(422);
    });

    it('still rejects a one-character query with 422', async () => {
        const { res } = await runValidator({ query: 'a' });
        expect(res.statusCode).toBe(422);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-api test -- tests/geoAddressSearchValidator.test.js`
Expected: FAIL — `stripUnknown: true` drops `lat`/`lon`, so the second test sees `undefined` and the third test gets no 422.

- [ ] **Step 3: Add the bias fields to the schema**

In `apps/dgfy-api/src/validators/geoSearchValidator.js`, replace the `addressSearchQuerySchema` declaration (lines 32-35) with:

```javascript
// `.and('lat','lon')` makes the bias pair all-or-nothing: biasing on one axis is meaningless
// and would silently produce misranked results.
const addressSearchQuerySchema = Joi.object({
    query: Joi.string().trim().min(2).max(120).required(),
    limit: Joi.number().integer().min(1).max(20).default(8),
    lat: Joi.number().min(-90).max(90).optional(),
    lon: Joi.number().min(-180).max(180).optional()
}).and('lat', 'lon');
```

- [ ] **Step 4: Pass the bias through the handler**

In `apps/dgfy-api/src/modules/geoSearch/controllers/geoSearchHandlers.js`, replace the body of `searchAddresses`'s use-case call:

```javascript
        const result = await addressSearchUseCase({
            query: q.query,
            limit: q.limit,
            biasLatitude: q.lat,
            biasLongitude: q.lon
        });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-api test -- tests/geoAddressSearchValidator.test.js`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
rg "DO NOT COMMIT" apps/dgfy-api/src/validators/geoSearchValidator.js apps/dgfy-api/src/modules/geoSearch/controllers/geoSearchHandlers.js apps/dgfy-api/tests/geoAddressSearchValidator.test.js
git add apps/dgfy-api/src/validators/geoSearchValidator.js apps/dgfy-api/src/modules/geoSearch/controllers/geoSearchHandlers.js apps/dgfy-api/tests/geoAddressSearchValidator.test.js
git commit -m "feat(geocoder): accept paired lat/lon bias on address search"
```

---

### Task 8: Send the map centre as search bias from the picker

Without this the API accepts bias that nothing supplies, and a nationwide index ranks worse than the 37-entry dataset did.

**Files:**
- Modify: `packages/web-core/src/components/maps/MapPinPicker.jsx` — the `searchAddress` function
- Modify: `packages/web-core/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx`

**Interfaces:**
- Consumes: the `lat`/`lon` query parameters from Task 7.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append this case inside the existing top-level `describe` block of `packages/web-core/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx` (place it next to the existing `/address-search?` assertion around line 239):

```javascript
  it('biases address search to the current map position', async () => {
    // Deliberately NOT DEFAULT_CENTER (10.7202, 122.5621) -- using those would pass even if
    // the component ignored the props and fell through to the default camera position.
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/address-search?')) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({ data: { results: [] } })
        });
      }
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({ data: {} }) });
    });

    render(<MapPinPicker latitude={11.1069} longitude={122.6413} deliveryRadiusKm={5} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search business address' }), 'Poblacion');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const call = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/address-search?'));
      expect(call).toBeDefined();
      const params = new URL(String(call[0]), 'http://localhost').searchParams;
      expect(params.get('query')).toBe('Poblacion');
      expect(params.get('lat')).toBe('11.1069');
      expect(params.get('lon')).toBe('122.6413');
    });
  });
```

This suite is **Vitest**, not Jest: `globalThis.fetch = vi.fn()`, and the search box is reached by
`getByRole('searchbox', { name: 'Search business address' })`. Match the surrounding file; do not
introduce Jest globals.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix apps/dgfy-ims test -- MapPinPicker.maplibre`
Expected: FAIL — `expected null to be "11.1069"`; the request currently sends only `query` and `limit`.

`apps/dgfy-ims` is the correct app and the only one: its `vite.config.js` is alone in adding
`'../../packages/web-core/**/*.{test,spec}.?(c|m)[jt]s?(x)'` to `test.include`. The POS and
Storefront configs both carry a comment saying web-core's tests run from `apps/dgfy-ims`, not
there. Do not try another app.

- [ ] **Step 3: Send the bias**

In `packages/web-core/src/components/maps/MapPinPicker.jsx`, replace the `params` construction inside `searchAddress` (currently `const params = new URLSearchParams({ query, limit: '8' });`) with:

```javascript
      // Bias to whatever the map is currently looking at. Without this a nationwide index
      // ranks a Metro Manila "Poblacion" above the one the merchant is standing in.
      const centre = mapRef.current?.getCenter?.();
      const biasLat = parseMapCoordinate(latitude) ?? (centre ? centre.lat : null);
      const biasLng = parseMapCoordinate(longitude) ?? (centre ? centre.lng : null);

      const params = new URLSearchParams({ query, limit: '8' });
      if (biasLat != null && biasLng != null) {
        params.set('lat', String(biasLat));
        params.set('lon', String(biasLng));
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix apps/dgfy-ims test -- MapPinPicker.maplibre`
Expected: PASS — including the pre-existing address-search and reverse-geocode cases

- [ ] **Step 5: Build every app that consumes web-core**

`packages/web-core` is the shared trunk for all three frontends, so a change there can break any of them.

Run: `npm run build:skupervisor && npm run build:pos && npm run build:store`
Expected: three successful Vite builds

- [ ] **Step 6: Commit**

```bash
rg "DO NOT COMMIT" packages/web-core/src/components/maps/MapPinPicker.jsx packages/web-core/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx
git add packages/web-core/src/components/maps/MapPinPicker.jsx packages/web-core/src/components/maps/__tests__/MapPinPicker.maplibre.test.jsx
git commit -m "feat(geocoder): bias picker address search to the current map centre"
```

---

### Task 9: Governance, documentation, and version bumps

Non-optional. ADR 0013 currently *mandates* the behaviour this work replaces; shipping without the amendment leaves an authoritative document contradicting the code.

**Files:**
- Modify: `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
- Create: `docs/compliance/impact-declarations/2026-09-17-quadruper-geocoder-swap.md`
- Modify: `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`
- Modify: `docs/api/specification.md`
- Modify: `apps/dgfy-api/src/modules/geoSearch/README.md`
- Modify: `apps/dgfy-api/src/modules/geoSearch/data/phLocalAddressDataset.js` (header comment only)
- Modify: `docs/superpowers/specs/2026-09-17-quadruper-geocoder-swap-design.md`
- Modify: `apps/dgfy-api/package.json`, and each consuming frontend's `package.json`

- [ ] **Step 1: Amend ADR 0013**

Set `status: amended` in the frontmatter, then append at the end of the file:

```markdown
## Amendments

### 2026-09-17: Quadruper geocoding provider (Phase 337)

The 2026-06-21 addendum's clause 4 required IMS address autofill to resolve from *bundled*
PH-local data with `provider="dgfy-ph-local"`. That bundled dataset covers 37 entries across
a handful of Western Visayas municipalities (Iloilo City and its districts, Oton, Pavia, Leganes,
Guimbal, Tigbauan, San Miguel, Guimaras), plus a single Manila entry and two province-level
centroids; every pin outside that narrow set resolved to `precision="coordinate_only"`. Clause 4 is amended as follows.

1. `/api/v1/geo/reverse-geocode` resolves against the DGFY-operated Quadruper geocoding service
   (Photon over OpenStreetMap, Philippines index) and returns `provider="dgfy-quadruper"`.
2. The bundled PH-local dataset is retained as an automatic fallback. When Quadruper is
   unavailable or returns no match, the endpoint returns the bundled label with
   `provider="dgfy-ph-local"` and its existing PSGC provenance, exactly as before this amendment.
3. `precision` is **extended, not replaced**: `house` and `street` join the existing `barangay`,
   `city`, `province`, and `coordinate_only`. No previously documented value is removed.
4. `psgc_code` and `parent_psgc_code` remain available only on the bundled-fallback path.
   OpenStreetMap carries no PSGC identifiers, so a Quadruper-served response omits them. They were
   already documented as conditional on a bundled local match.
5. Reverse-geocode responses additionally carry `landmarks[]`, nearby named points of interest
   ordered by distance and capped at five, as a delivery-navigation aid. The array is always
   present and is empty on the bundled-fallback path.
6. `/api/v1/geo/address-search` accepts optional paired `lat`/`lon` bias coordinates.

**Unchanged by this amendment**, and still binding: the endpoint must not return vague `Near ...`
labels; an address suggestion may fill an empty address field but must not overwrite
merchant-edited address text unless the merchant explicitly applies it; and reverse-geocode
failure must never prevent saving valid coordinates. Geocoding remains server-side only — the
service sends no CORS headers, so a browser-side call is impossible by construction.
```

- [ ] **Step 2: Write the compliance impact declaration**

Create `docs/compliance/impact-declarations/2026-09-17-quadruper-geocoder-swap.md`. Copy the frontmatter key set from `docs/compliance/impact-declarations/2026-05-18-leaflet-to-maplibre-migration.md` and adapt:

```markdown
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
```

- [ ] **Step 3: Run the compliance checker**

Run: `npm run check:compliance`
Expected: PASS. If it reports a missing or malformed declaration, fix the frontmatter to match the key set `scripts/check-compliance-impact.js:196-220` requires before continuing.

> A `NOT-EXECUTED-*` `preflight_request_ref` on a `develop`-targeting PR is expected, not a defect — the continuous sweep reconciles it after merge. Do not hand-edit it.

- [ ] **Step 4: Add the phase ledger entry**

Append to `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`, continuing the sequence (the file currently ends at Phase 336):

```markdown
## Phase 337 - Quadruper geocoding provider with bundled-dataset fallback (#<ISSUE>)

- **Initiative / release:** Geo search and address resolution
- **Objective:** Replace the 37-entry bundled PH-local geocoder with the DGFY-operated Quadruper
  service (Photon over OpenStreetMap, ~850k PH places), retaining the bundled dataset as an
  automatic fallback and adding nearby-landmark output to reverse geocoding.
- **Scope:** `apps/dgfy-api/src/modules/geoSearch` (new `providers/`, `mappers/`, `landmarks/`,
  `shared/` units), `src/config/geocodeConfig.js`, `src/validators/geoSearchValidator.js`,
  `packages/web-core/src/components/maps/MapPinPicker.jsx`.
- **Status:** completed
- **Dependencies:** ADR 0013 (amended 2026-09-17); declaration
  `2026-09-17-quadruper-geocoder-swap`.
- **Acceptance and validation evidence:** `tests/geoLandmarkClassifier.test.js`,
  `tests/geoPhotonFeatureMapper.test.js`, `tests/geoQuadruperProvider.test.js`,
  `tests/geoLocalProvider.test.js`, `tests/geoCircuitBreaker.test.js`,
  `tests/geoFallbackPolicy.test.js`, `tests/geoAddressSearchValidator.test.js`,
  `MapPinPicker.maplibre.test.jsx`; `npm run check:compliance`,
  `npm run check:architecture`, `npm run lint:docs`; three frontend builds.
- **Completion date:** <YYYY-MM-DD at merge>
- **Links:** `docs/superpowers/specs/2026-09-17-quadruper-geocoder-swap-design.md`,
  `docs/superpowers/plans/2026-09-17-quadruper-geocoder-swap.md`.
```

Replace `#<ISSUE>` with the real issue number and `<YYYY-MM-DD at merge>` with the merge date.

- [ ] **Step 5: Update the API specification**

In `docs/api/specification.md`, replace the `GET /api/v1/geo/reverse-geocode` bullet (around line 6857) with:

```markdown
- `GET /api/v1/geo/reverse-geocode` returns PH address metadata for map pin suggestions. Successful responses include `provider` (`dgfy-quadruper` when resolved by the DGFY-operated Quadruper geocoding service, `dgfy-ph-local` when served by the bundled fallback dataset), `precision` (`house`, `street`, `barangay`, `city`, `province`, or `coordinate_only`), optional `distance_meters`, `components` (`street`, `locality`, `district`, `city`, `state`, `postcode` — every field nullable), and `landmarks` (an always-present array, capped at five, of nearby named points of interest ordered by ascending distance, each with `name`, `category`, `osm_key`, `osm_value`, `distance_meters`, `latitude`, `longitude`; empty on the bundled-fallback path). PSGC code fields and `provenance` appear only on the bundled-fallback path, since OpenStreetMap carries no PSGC identifiers. The endpoint must not return vague `Near ...` labels; when no match is available it returns `Pinned location (lat, lon)` with `precision="coordinate_only"`. Reverse-geocode failure must not block saving valid coordinates.
- `GET /api/v1/geo/address-search` accepts `query` (2-120 chars), `limit` (1-20, default 8), and optional `lat`/`lon` bias coordinates. `lat` and `lon` are all-or-nothing: supplying exactly one returns `422`. Results are hard-filtered to the Philippines bounding box.
```

Then update the two "first-party PH-local reverse-geocod*" phrases near lines 3551 and 6856 to read "PH reverse-geocoded address suggestions" — the geocoding is still server-side and DGFY-operated, but it is no longer bundled in-process.

- [ ] **Step 6: Update the module README and the dataset header**

In `apps/dgfy-api/src/modules/geoSearch/README.md`, add to the Files table:

```markdown
| `providers/quadruperGeocodeProvider.js` | HTTP client for the DGFY-operated Quadruper service; strict parameter-name allowlist, 2500 ms timeout |
| `providers/localGeocodeProvider.js` | Bundled PH-local dataset behind the same interface; the fallback |
| `providers/geocodeCircuitBreaker.js` | Five-failure / 60-second breaker guarding the remote provider |
| `providers/geocodeCache.js` | Redis cache keyed on the service's `import_date` |
| `mappers/photonFeatureMapper.js` | Photon Feature → DGFY contract; label composer, precision map, landmark assembly |
| `landmarks/landmarkClassifier.js` | `osm_key`/`osm_value` allowlist deciding what counts as a landmark |
| `shared/geoDistance.js` | Haversine shared by the mapper and the local provider |
```

In `apps/dgfy-api/src/modules/geoSearch/data/phLocalAddressDataset.js`, replace the now-false line
`"Runtime reverse geocoding is bundled and first-party; no browser-side or live third-party reverse-geocode call is used."` with:

```
"This dataset is the FALLBACK path as of Phase 337; primary resolution is the DGFY-operated Quadruper service. Geocoding remains server-side only — no browser-side geocoding call is made.",
```

- [ ] **Step 7: Record the forward-search clarification in the spec**

In `docs/superpowers/specs/2026-09-17-quadruper-geocoder-swap-design.md`, append to §5.1:

```markdown
**Forward search is the exception to this rule.** In reverse geocoding the nearest feature's
`name` may be an unrelated POI, so it is never used. In forward search `name` IS the match the
user typed (`q=Poblacion` returns `name="Poblacion"`, `city="Pavia"`, with no `locality` or
`district`), so it is prepended to the composed label when it is not already a segment —
producing `Poblacion, Pavia, Iloilo, Philippines` rather than `Pavia, Iloilo, Philippines`.
Implemented as `prependName` in `mappers/photonFeatureMapper.js`.
```

- [ ] **Step 8: Bump app versions**

Run: `node scripts/check-app-version-bump.js`

Bump the `version` in `apps/dgfy-api/package.json` and in the `package.json` of every frontend the script names as changed. This work adds features without breaking callers, so a **minor** bump is correct. Re-run the script until it reports no missing bump.

- [ ] **Step 9: Run the full gate set**

```bash
npm run check:compliance
npm run check:architecture
npm run lint:docs
npm --prefix apps/dgfy-api test -- tests/geoLandmarkClassifier.test.js tests/geoPhotonFeatureMapper.test.js tests/geoQuadruperProvider.test.js tests/geoLocalProvider.test.js tests/geoCircuitBreaker.test.js tests/geoFallbackPolicy.test.js tests/geoAddressSearchValidator.test.js tests/geoSearchReverseGeocode.usecase.test.js
```

Expected: all green. `lint:docs` validates only docs registered in `docs/_meta/document-registry.json`; ADR 0013 **is** registered, so a malformed amendment fails here.

- [ ] **Step 10: Commit, batched by domain per `docs/ai/PR.md`**

```bash
rg "DO NOT COMMIT" docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md docs/compliance/impact-declarations/2026-09-17-quadruper-geocoder-swap.md docs/features/IMPLEMENTATION_PHASE_LEDGER.md docs/api/specification.md

git add docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md docs/compliance/impact-declarations/2026-09-17-quadruper-geocoder-swap.md
git commit -m "docs(geocoder): amend ADR 0013 and declare the Quadruper swap impact"

git add docs/features/IMPLEMENTATION_PHASE_LEDGER.md docs/api/specification.md apps/dgfy-api/src/modules/geoSearch/README.md apps/dgfy-api/src/modules/geoSearch/data/phLocalAddressDataset.js docs/superpowers/specs/2026-09-17-quadruper-geocoder-swap-design.md
git commit -m "docs(geocoder): record Phase 337 and the updated geocode contract"

git add apps/dgfy-api/package.json apps/dgfy-ims/package.json apps/dgfy-pos/package.json apps/dgfy-storefront/package.json
git commit -m "chore(release): bump app minor versions for Phase 337"
```

(Only stage the frontend `package.json` files the version-bump script actually flagged.)

---

## Opening the PR

Base `develop`. Never `staging`, never `main`.

Body must contain `## Summary` and `## Testing Evidence` per `docs/ai/PR.md`, and link the issue with `Refs #N` (or `Closes #N` if the issue is fully satisfied). Put the Tier 0 evidence — the three frontend builds, `check:compliance`, `check:architecture`, `lint:docs`, and the eight backend suites — in `## Testing Evidence` at creation time.

**Stop there.** Merging is a separate decision by a separate party.

---

## Manual verification before requesting review

Automated tests never touch the live service. Confirm these by hand once, against a running API:

- [ ] `GET /api/v1/geo/reverse-geocode?lat=10.3157&lon=123.8854` (Cebu City — genuinely outside all bundled coverage) returns a real composed address, not `precision="coordinate_only"`. Do NOT use Manila (14.5995, 120.9842) for this check: the bundled dataset has an exact entry there, so it would pass even with the service disabled.
- [ ] `GET /api/v1/geo/reverse-geocode?lat=10.7202&lon=122.5621` returns `Bakhaw, Jaro, Iloilo City, Western Visayas, Philippines` and a non-empty `landmarks[]` — and never `Peri Todd's Burger` as `address_line`.
- [ ] `GET /api/v1/geo/address-search?query=Poblacion&lat=10.72&lon=122.56` ranks Iloilo-region results above Metro Manila ones.
- [ ] With `GEOCODE_QUADRUPER_BASE_URL` pointed at an unreachable host, both endpoints still return `200` within roughly three seconds, with `provider="dgfy-ph-local"` or `precision="coordinate_only"`.
- [ ] With `GEOCODE_QUADRUPER_ENABLED=false`, behaviour matches the pre-change baseline exactly.
- [ ] In IMS Settings, dropping a pin fills an empty address field but does **not** overwrite text the merchant already edited.
