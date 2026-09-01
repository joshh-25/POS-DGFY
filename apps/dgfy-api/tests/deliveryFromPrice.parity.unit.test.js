// Phase 242 (#1333, epic #1321). The honesty property Wave 0 decision #3 (#1322) conditions the
// "from ₱X" convention on: the advertised value is a floor the charged fee never goes below, for
// every in-range distance -- AND the floor is reachable (distance 0 charges exactly fromPrice), not
// merely a lower bound no customer can ever actually get.
//
// Tested against the real checkout math (computeCalculatedDeliveryFeeCentavos), not a restatement of
// it -- if that formula's branching changes, this test is what breaks.

import { describe, expect, it } from '@jest/globals';
import { resolveAdvertisedDeliveryFromPrice } from '../src/modules/deliveryPricing/domain/deliveryFromPrice.js';
import { computeCalculatedDeliveryFeeCentavos } from '../src/modules/deliveryPricing/domain/deliveryFeePolicy.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;
const centavosToPeso = (value) => round4(Number(value || 0) / 100);

const calc = {
    min_fee: 39,
    included_km: 2,
    per_km_rate: 15,
    increment_km: 1,
    max_distance_km: 10
};

describe('delivery from-price parity with the real checkout formula (calculated mode)', () => {
    const { fromPrice } = resolveAdvertisedDeliveryFromPrice({
        tenantSettings: {
            store_delivery_fee_mode: 'calculated',
            store_delivery_fee: '999', // deliberately far from min_fee -- calculated mode must never fall back here
            store_delivery_fee_calc: calc
        }
    });

    it('resolves fromPrice to the calc min_fee, not the flat fee', () => {
        expect(fromPrice).toBe(39);
    });

    it.each([
        0,
        1000,
        calc.included_km * 1000,
        calc.included_km * 1000 + 1,
        calc.max_distance_km * 1000
    ])('charged fee at %i meters is always >= the advertised from-price', (distanceMeters) => {
        const result = computeCalculatedDeliveryFeeCentavos({ distanceMeters, config: calc });
        expect(result.outOfRange).toBe(false);
        expect(centavosToPeso(result.feeCentavos)).toBeGreaterThanOrEqual(fromPrice);
    });

    it('the floor is reachable: distance 0 charges exactly the advertised from-price', () => {
        const result = computeCalculatedDeliveryFeeCentavos({ distanceMeters: 0, config: calc });
        expect(result.incrementsCharged).toBe(0);
        expect(centavosToPeso(result.feeCentavos)).toBe(fromPrice);
    });

    it('a distance beyond max_distance_km is out-of-range and never a displayed price -- it does not violate the floor because it is hard-blocked at checkout (storeUseCases.js:2283) before any total is built', () => {
        const result = computeCalculatedDeliveryFeeCentavos({
            distanceMeters: calc.max_distance_km * 1000 + 1,
            config: calc
        });
        expect(result.outOfRange).toBe(true);
        expect(result.feeCentavos).toBe(0);
    });
});

describe('delivery from-price parity (free mode)', () => {
    it('fromPrice is 0 and the checkout baseFee for free mode is always 0 (storeUseCases.js:624-625)', () => {
        const { fromPrice, mode } = resolveAdvertisedDeliveryFromPrice({
            tenantSettings: { store_delivery_fee_mode: 'free', store_delivery_fee: '999' }
        });
        expect(mode).toBe('free');
        expect(fromPrice).toBe(0);
    });
});
