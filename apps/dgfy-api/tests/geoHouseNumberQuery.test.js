import {
    __testing,
    mapHouseNumberSearch,
    matchesTypedStreet,
    parseHouseNumberQuery
} from '../src/modules/geoSearch/mappers/houseNumberQuery.js';

const feature = (properties, longitude = 122.57, latitude = 10.69) => ({
    type: 'Feature', properties, geometry: { type: 'Point', coordinates: [longitude, latitude] }
});

// Recorded live from https://quadruper.com/geocode on 2026-10-14.
const ILOILO_RIZAL_STREET = {
    osm_key: 'highway', osm_value: 'secondary', type: 'street', name: 'Rizal Street',
    locality: 'Iloilo Central Business District', district: 'City Proper', city: 'Iloilo City', state: 'Western Visayas'
};
const JARO_PLAZA_RIZAL_STREET = {
    osm_key: 'highway', osm_value: 'primary', type: 'street', name: 'Plaza Rizal Street',
    locality: 'Modern Homes', district: 'Jaro', city: 'Iloilo City', state: 'Western Visayas'
};
const CAINTA_HOUSE_52 = {
    osm_key: 'building', osm_value: 'yes', type: 'house', name: null, housenumber: '52',
    street: 'Saint Anthony Street', locality: 'Rodfer Ⅱ', city: 'Cainta', state: 'Rizal'
};
const UNIVERSITY_ON_RIZAL_STREET = {
    osm_key: 'amenity', osm_value: 'university', type: 'house', name: 'University of Iloilo',
    street: 'Rizal Street', locality: 'Iloilo Central Business District', district: 'City Proper', city: 'Iloilo City'
};

describe('parseHouseNumberQuery', () => {
    it.each([
        ['52 Rizal Street', '52', 'Rizal Street'],
        ['  52A Rizal St', '52A', 'Rizal St'],
        ['#52-A Rizal St, Jaro', '52-A', 'Rizal St, Jaro'],
        ['No. 7 Gen. Luna Street', '7', 'Gen. Luna Street'],
        ['52, Rizal Street', '52', 'Rizal Street']
    ])('splits %p into number and street part', (query, houseNumber, remainder) => {
        expect(parseHouseNumberQuery(query)).toEqual({ houseNumber, remainder });
    });

    it.each(['Rizal Street', '2nd Street', '21st Avenue', '52', '52 Street', 'Space Bar'])(
        'returns null for %p', (query) => {
            expect(parseHouseNumberQuery(query)).toBeNull();
        }
    );
});

describe('matchesTypedStreet', () => {
    const typed = (text) => __testing.coreTokens(text);

    it('matches the typed street regardless of suffix spelling', () => {
        expect(matchesTypedStreet('Rizal Street', ILOILO_RIZAL_STREET, typed('Rizal St'))).toBe(true);
        expect(matchesTypedStreet('M.H. del Pilar Street', {}, typed('MH del Pilar'))).toBe(true);
    });

    it('accepts locality words typed after the street', () => {
        expect(matchesTypedStreet('Rizal Street', ILOILO_RIZAL_STREET, typed('Rizal Street, Iloilo City'))).toBe(true);
        expect(matchesTypedStreet('Plaza Rizal Street', JARO_PLAZA_RIZAL_STREET, typed('Rizal Street, Jaro'))).toBe(true);
    });

    it('rejects a street whose only link to the query is the province name', () => {
        expect(matchesTypedStreet('Saint Anthony Street', CAINTA_HOUSE_52, typed('Rizal Street'))).toBe(false);
    });

    it('rejects a typed word the feature cannot explain', () => {
        expect(matchesTypedStreet('Rizal Street', ILOILO_RIZAL_STREET, typed('Rizal Street, Oton'))).toBe(false);
    });

    it('rejects an empty street name', () => {
        expect(matchesTypedStreet(null, ILOILO_RIZAL_STREET, typed('Rizal'))).toBe(false);
        expect(matchesTypedStreet('Street', ILOILO_RIZAL_STREET, typed('Rizal'))).toBe(false);
    });
});

describe('mapHouseNumberSearch', () => {
    const base = { houseNumber: '52', remainder: 'Rizal Street', limit: 8 };

    it('returns matching streets at street precision carrying the typed number', () => {
        const results = mapHouseNumberSearch({
            ...base,
            fullPayload: { features: [feature(CAINTA_HOUSE_52, 121.1, 14.6)] },
            streetPayload: { features: [feature(ILOILO_RIZAL_STREET), feature(UNIVERSITY_ON_RIZAL_STREET)] }
        });

        expect(results).toHaveLength(1);
        expect(results[0].address_line)
            .toBe('52 Rizal Street, Iloilo Central Business District, City Proper, Iloilo City, Western Visayas');
        expect(results[0].precision).toBe('street');
        expect(results[0].components).toMatchObject({ housenumber: '52', street: 'Rizal Street' });
    });

    it('ranks an exact house on the typed street first', () => {
        const exactHouse = { ...CAINTA_HOUSE_52, street: 'Rizal Street', city: 'Iloilo City', state: 'Western Visayas', locality: 'Iloilo Central Business District' };
        const results = mapHouseNumberSearch({
            ...base,
            fullPayload: { features: [feature(exactHouse)] },
            streetPayload: { features: [feature(ILOILO_RIZAL_STREET)] }
        });

        expect(results.map((result) => result.precision)).toEqual(['house', 'street']);
        expect(results[0].address_line.startsWith('52 Rizal Street')).toBe(true);
    });

    it('returns [] when nothing matches the typed street, so the caller falls back', () => {
        expect(mapHouseNumberSearch({
            ...base,
            fullPayload: { features: [feature(CAINTA_HOUSE_52)] },
            streetPayload: { features: [] }
        })).toEqual([]);
        expect(mapHouseNumberSearch({ ...base, fullPayload: null, streetPayload: undefined })).toEqual([]);
    });

    it('collapses identical labels and honours the limit', () => {
        const results = mapHouseNumberSearch({
            ...base,
            limit: 1,
            fullPayload: null,
            streetPayload: { features: [feature(ILOILO_RIZAL_STREET), feature(ILOILO_RIZAL_STREET, 122.58), feature(JARO_PLAZA_RIZAL_STREET)] }
        });
        expect(results).toHaveLength(1);
    });
});
