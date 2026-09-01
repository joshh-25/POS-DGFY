// Phase 242 (#1333, epic #1321). Unit tests for resolveAdvertisedDeliveryFromPrice -- the pure
// mode->fromPrice matrix. Every row mirrors an actual branch of resolveStoreDeliveryFee
// (storeUseCases.js:586-694); see deliveryFromPrice.parity.unit.test.js for the "floor is real"
// property tested against the actual checkout math, not a restatement of it.

import { describe, expect, it } from '@jest/globals';
import { resolveAdvertisedDeliveryFromPrice } from '../src/modules/deliveryPricing/domain/deliveryFromPrice.js';

const validCalc = (overrides = {}) => ({
    min_fee: 39,
    included_km: 2,
    per_km_rate: 15,
    increment_km: 1,
    max_distance_km: 10,
    ...overrides
});

describe('resolveAdvertisedDeliveryFromPrice', () => {
    it('fixed mode: advertises the parsed flat fee', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'fixed', store_delivery_fee: '50' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 50 });
    });

    it('fixed mode: a zero fee advertises 0', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'fixed', store_delivery_fee: '0' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 0 });
    });

    it('fixed mode: a negative fee guards to 0', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'fixed', store_delivery_fee: '-5' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 0 });
    });

    it('fixed mode: a non-finite fee guards to 0', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'fixed', store_delivery_fee: 'abc' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 0 });
    });

    it('free mode: always 0, ignoring the fixed fee entirely', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'free', store_delivery_fee: '50' }
        });
        expect(result).toEqual({ mode: 'free', fromPrice: 0 });
    });

    it('calculated mode, valid calc: advertises min_fee, not the flat fee', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee: '50',
                store_delivery_fee_calc: validCalc({ min_fee: 39 })
            }
        });
        expect(result).toEqual({ mode: 'calculated', fromPrice: 39 });
    });

    it('calculated mode, valid calc with min_fee 0: advertises 0', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee: '50',
                store_delivery_fee_calc: validCalc({ min_fee: 0 })
            }
        });
        expect(result).toEqual({ mode: 'calculated', fromPrice: 0 });
    });

    it('calculated mode, null calc: fails open to the fixed fee, mode NOT rewritten', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee: '50',
                store_delivery_fee_calc: null
            }
        });
        expect(result).toEqual({ mode: 'calculated', fromPrice: 50 });
    });

    it('calculated mode, malformed calc (negative min_fee): fails open to the fixed fee', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee: '50',
                store_delivery_fee_calc: validCalc({ min_fee: -1 })
            }
        });
        expect(result).toEqual({ mode: 'calculated', fromPrice: 50 });
    });

    it('calculated mode, calc as a raw JSON STRING (not parsed): fails open to the fixed fee -- documents the projection-layer trap as a behavior', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: {
                store_delivery_fee_mode: 'calculated',
                store_delivery_fee: '50',
                store_delivery_fee_calc: JSON.stringify(validCalc())
            }
        });
        expect(result).toEqual({ mode: 'calculated', fromPrice: 50 });
    });

    it('absent/garbage mode defaults to fixed (normalizeMode default)', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'garbage', store_delivery_fee: '50' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 50 });

        const resultAbsent = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee: '50' }
        });
        expect(resultAbsent).toEqual({ mode: 'fixed', fromPrice: 50 });
    });

    it('mode normalization is case/whitespace-insensitive', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: '  FIXED  ', store_delivery_fee: '50' }
        });
        expect(result).toEqual({ mode: 'fixed', fromPrice: 50 });
    });

    it('the result is always frozen', () => {
        const result = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'fixed', store_delivery_fee: '50' }
        });
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('handles a fully absent params object without throwing', () => {
        const result = resolveAdvertisedDeliveryFromPrice();
        expect(result).toEqual({ mode: 'fixed', fromPrice: 0 });
    });
});
