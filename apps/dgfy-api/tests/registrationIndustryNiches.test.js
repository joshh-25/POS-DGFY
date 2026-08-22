import { describe, expect, it } from '@jest/globals';
import { normalizeRegistrationIndustryNiches } from '../src/modules/registration/registrationIndustryNiches.js';

describe('normalizeRegistrationIndustryNiches', () => {
    it('keeps an array and normalizes its entries', () => {
        expect(normalizeRegistrationIndustryNiches([' Supermarket ', '', null, 'Grocery store']))
            .toEqual(['Supermarket', 'Grocery store']);
    });

    it('parses the JSON text returned for MariaDB JSON columns', () => {
        expect(normalizeRegistrationIndustryNiches('["Café", "Coffee shop"]'))
            .toEqual(['Café', 'Coffee shop']);
    });

    it('returns an empty array for invalid or non-array values', () => {
        expect(normalizeRegistrationIndustryNiches('not-json')).toEqual([]);
        expect(normalizeRegistrationIndustryNiches('{"niche":"Retail"}')).toEqual([]);
        expect(normalizeRegistrationIndustryNiches(null)).toEqual([]);
    });
});
