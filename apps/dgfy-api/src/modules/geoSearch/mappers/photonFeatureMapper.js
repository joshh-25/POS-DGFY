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
