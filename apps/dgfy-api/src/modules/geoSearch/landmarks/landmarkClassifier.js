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
