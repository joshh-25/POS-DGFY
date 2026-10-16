import { mapForwardFeature } from './photonFeatureMapper.js';

/**
 * House-number queries (#2484). OSM carries almost no house numbers in most PH cities, and
 * Photon lets a leading number match any housenumber nationwide (`52 Rizal Street` ranks houses
 * numbered 52 in Rizal *province* above Rizal Street in Iloilo). The product promise is therefore
 * street-level: the street part is searched on its own, and the typed number rides along in the
 * label so it survives into the delivery address. An exact Photon house on the same street still
 * ranks first when one exists.
 */

const STREET_SUFFIXES = new Set([
    'street', 'st', 'avenue', 'ave', 'av', 'road', 'rd', 'boulevard', 'blvd', 'drive', 'dr',
    'highway', 'hwy', 'lane', 'ln', 'extension', 'ext'
]);
const FILLER_WORDS = new Set(['brgy', 'bgy', 'barangay']);

// `#52`, `No. 52`, `52A`, `52-A`, `12-B2`, `52-1`. A digit-led ordinal (`2nd Street`) never
// matches, because the number must be followed by whitespace. The hyphen suffix is one letter or
// a short number, so a digit-led business name (`7-Eleven Rizal Street`) is not a house number.
const HOUSE_NUMBER_PATTERN = /^\s*(?:#\s*|no\.?\s*)?(\d+[a-z]?(?:-(?:[a-z]\d{0,2}|\d{1,4}[a-z]?))?)\s*,?\s+(.+)$/i;

const tokenize = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const coreTokens = (value) => tokenize(value).filter((token) => !STREET_SUFFIXES.has(token) && !FILLER_WORDS.has(token));

const normalizeHouseNumber = (value) => tokenize(value).join('');

export const parseHouseNumberQuery = (query) => {
    const match = HOUSE_NUMBER_PATTERN.exec(String(query ?? ''));
    if (!match) return null;

    const remainder = match[2].trim();
    if (coreTokens(remainder).length === 0) return null;

    return { houseNumber: match[1], remainder };
};

/**
 * True when `streetName` is the street the customer typed. The first typed word must be part of
 * the street name, and every typed word must be explained by the street name or the feature's
 * locality/district/city/state -- so `Rizal Street, Jaro` matches Plaza Rizal Street in Jaro,
 * while a house on Saint Anthony Street in Rizal province, or Jaro Street in Rizal province,
 * does not.
 */
export const matchesTypedStreet = (streetName, properties, typedTokens) => {
    const streetTokens = coreTokens(streetName);
    if (streetTokens.length === 0 || typedTokens.length === 0) return false;
    if (!streetTokens.includes(typedTokens[0])) return false;

    const explained = new Set([
        ...streetTokens,
        ...tokenize(properties?.locality),
        ...tokenize(properties?.district),
        ...tokenize(properties?.city),
        ...tokenize(properties?.state),
        'philippines'
    ]);
    return typedTokens.every((token) => explained.has(token));
};

const featuresOf = (payload) => (Array.isArray(payload?.features) ? payload.features : []);
const typeOf = (feature) => String(feature?.properties?.type || '').trim();

/**
 * True when the as-typed search found a named place whose name holds the typed number plus
 * another typed word (`7 Eleven Rizal St` -> 7-Eleven). The number is then part of a business
 * name, not an address, and the caller keeps the plain results.
 */
const namesTypedBusiness = (fullPayload, typedNumber, typedTokens) => featuresOf(fullPayload).some((feature) => {
    if (typeOf(feature) === 'street') return false;
    const nameTokens = coreTokens(feature.properties?.name);
    return nameTokens.includes(typedNumber)
        && nameTokens.some((token) => token !== typedNumber && typedTokens.includes(token));
});

/**
 * `fullPayload` answers the query as typed, `streetPayload` the query minus its house number.
 * Returns exact house matches, then street-level matches carrying the typed number. An empty
 * array means neither found the typed street, or the number belongs to a business name, and the
 * caller falls back to the plain search.
 */
export const mapHouseNumberSearch = ({ fullPayload, streetPayload, houseNumber, remainder, limit }) => {
    const typedTokens = coreTokens(remainder);
    const typedNumber = normalizeHouseNumber(houseNumber);
    if (namesTypedBusiness(fullPayload, typedNumber, typedTokens)) return [];

    const exact = featuresOf(fullPayload)
        .filter((feature) => typeOf(feature) === 'house'
            && normalizeHouseNumber(feature.properties.housenumber) === typedNumber
            && matchesTypedStreet(feature.properties.street, feature.properties, typedTokens))
        .map((feature) => mapForwardFeature(feature));

    const streets = featuresOf(streetPayload)
        .filter((feature) => typeOf(feature) === 'street'
            && matchesTypedStreet(feature.properties.name, feature.properties, typedTokens))
        .map((feature) => mapForwardFeature(feature, { houseNumber }));

    const seen = new Set();
    return [...exact, ...streets]
        .filter((result) => {
            if (!result) return false;
            const key = result.address_line.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
};

export const __testing = { coreTokens, tokenize };
