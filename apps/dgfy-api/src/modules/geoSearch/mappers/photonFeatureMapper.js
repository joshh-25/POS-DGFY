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
    housenumber: clean(properties?.housenumber),
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

/**
 * #2593: how close a street-bearing feature must be before its street goes into a reverse label.
 * Calibrated live on 2026-10-19: pins in Iloilo's built-up areas matched their own street at
 * 12-42 m, while the nearest candidate for a pin between streets sat 87 m+ away.
 */
export const REVERSE_STREET_MAX_DISTANCE_METERS = 75;

const featureStreet = (properties) => (
    String(properties?.type || '').trim() === 'street' ? clean(properties?.name) : clean(properties?.street)
);

/**
 * The street of the nearest feature that names one, or null when none is within
 * REVERSE_STREET_MAX_DISTANCE_METERS. A street feature names itself; a house or POI names the
 * street it sits on. Only the street is taken: never a house number, never a POI name.
 */
export const findReverseStreet = (features, origin) => {
    let best = null;
    (Array.isArray(features) ? features : []).forEach((feature) => {
        const name = featureStreet(feature?.properties);
        const coordinates = toCoordinates(feature);
        if (!name || !coordinates) return;

        const distance = distanceMeters(origin, coordinates);
        if (distance > REVERSE_STREET_MAX_DISTANCE_METERS) return;
        if (!best || distance < best.distanceMeters) {
            best = { name, properties: feature.properties, distanceMeters: distance };
        }
    });
    return best;
};

// A reverse label never carries a house number or a POI name, so a house- or street-typed
// feature's own precision would overstate what the label says.
const ADDRESS_LEVEL_TYPES = new Set(['house', 'street']);
const mapAdministrativePrecision = (properties) => (
    ADDRESS_LEVEL_TYPES.has(String(properties?.type || '').trim())
        ? mapPrecision({ ...properties, type: null })
        : mapPrecision(properties)
);

export const mapReverseGeocodeResponse = (payload, { latitude, longitude }) => {
    const features = Array.isArray(payload?.features) ? payload.features : [];
    if (features.length === 0) return null;

    const origin = { latitude, longitude };
    const nearest = features[0];
    const properties = nearest?.properties || {};
    const street = findReverseStreet(features, origin);

    // The street's own feature supplies the rest of the label, so the barangay and city always
    // belong to the street that was named.
    const addressLine = street
        ? dedupeSegments([street.name, ...composeAddressLine(street.properties).split(', ')]).slice(0, MAX_LABEL_SEGMENTS).join(', ')
        : composeAddressLine(properties);
    if (!addressLine) return null;

    const nearestCoordinates = toCoordinates(nearest);
    const components = mapComponents(properties);
    if (street) components.street = street.name;

    return {
        address_line: addressLine,
        provider: QUADRUPER_PROVIDER,
        precision: street ? 'street' : mapAdministrativePrecision(properties),
        distance_meters: nearestCoordinates ? distanceMeters(origin, nearestCoordinates) : null,
        components,
        landmarks: mapLandmarks(features, origin)
    };
};

/**
 * Forward search is the mirror image of reverse: here `name` IS the match the user typed
 * (`q=Poblacion` returns name="Poblacion", city="Pavia" with no locality/district), so
 * dropping it would discard the searched term. Reverse never does this.
 *
 * The street (with its house number, when Photon has one) follows the name. A `street`-type
 * feature carries its street name in `name` and leaves `street` empty, so it is read from there.
 * `houseNumber` overrides Photon's own value: house-number queries resolved to street level
 * carry the number the customer typed, so it survives into the delivery address text.
 */
export const composeForwardAddressLine = (properties, { houseNumber = null } = {}) => {
    const isStreet = String(properties?.type || '').trim() === 'street';
    const name = clean(properties?.name);
    const street = isStreet ? name : clean(properties?.street);
    const number = clean(houseNumber) || clean(properties?.housenumber);
    const streetLine = street && number ? `${number} ${street}` : street;

    const segments = dedupeSegments([isStreet ? null : name, streetLine, ...composeAddressLine(properties).split(', ')]);
    return segments.slice(0, MAX_LABEL_SEGMENTS).join(', ');
};

export const mapForwardFeature = (feature, { houseNumber = null } = {}) => {
    const properties = feature?.properties || {};
    const coordinates = toCoordinates(feature);
    if (!coordinates) return null;

    const addressLine = composeForwardAddressLine(properties, { houseNumber });
    if (!addressLine) return null;

    const components = mapComponents(properties);
    if (!components.street && String(properties.type || '').trim() === 'street') {
        components.street = clean(properties.name);
    }
    if (houseNumber) components.housenumber = clean(houseNumber);

    return {
        address_line: addressLine,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        precision: mapPrecision(properties),
        provider: QUADRUPER_PROVIDER,
        components
    };
};

export const mapForwardSearchResponse = (payload) => {
    const features = Array.isArray(payload?.features) ? payload.features : [];
    return features.map((feature) => mapForwardFeature(feature)).filter(Boolean);
};
