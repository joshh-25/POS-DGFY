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
