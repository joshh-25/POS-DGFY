import {
    isCommercialPromoPubliclyVisible,
    parsePublicCommercialPromos,
    projectPublicLegacyPromo,
    resolveCommercialPromoApplication,
    resolveCommercialPromoEffectiveState
} from '../src/modules/shared/utils/commercialPromoPolicy.js';

describe('public commercial promo projection', () => {
    test('exposes all active redeemable promos without internal item targeting data', () => {
        expect(parsePublicCommercialPromos([
            { active: true, promo_code: 'SAVE10', title: '10% off', discount_percent: 10, target_item_ids: [1] },
            { active: true, promo_code: 'SAVE20', title: '20% off', discount_percent: 20, target_item_ids: [2] },
            { active: false, promo_code: 'HIDDEN', discount_percent: 50 }
        ])).toEqual([
            expect.objectContaining({ promo_code: 'SAVE10', discount_percent: 10 }),
            expect.objectContaining({ promo_code: 'SAVE20', discount_percent: 20 })
        ]);
        expect(parsePublicCommercialPromos([{ active: true, promo_code: 'SAVE10', discount_percent: 10, target_item_ids: [1] }])[0])
            .not.toHaveProperty('target_item_ids');
    });
});

describe('commercial promo authoritative allocations', () => {
    test('rejects an active promo after its configured end date', () => {
        expect(() => resolveCommercialPromoApplication({
            settings: {
                storefront_promos: {
                    value: [{ active: true, promo_code: 'OLD20', discount_percent: 20, valid_until: '2026-07-09' }]
                }
            },
            promoCode: 'OLD20',
            prepared: { subtotalAmount: 100, preparedLines: [{ item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 }] },
            now: new Date('2026-07-10T12:00:00+08:00')
        })).toThrow('Promo code has expired.');
    });

    test('rejects a scheduled promo before its From date and time window', () => {
        const settings = {
            storefront_promos: {
                value: [{
                    active: true,
                    promo_code: 'MIDNIGHT20',
                    discount_percent: 20,
                    valid_from: '2026-07-12',
                    valid_time_start: '00:00',
                    valid_until: '2026-07-13',
                    valid_time_end: '02:00'
                }]
            }
        };
        const prepared = {
            subtotalAmount: 100,
            preparedLines: [{ item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 }]
        };

        expect(() => resolveCommercialPromoApplication({
            settings,
            promoCode: 'MIDNIGHT20',
            prepared,
            now: new Date('2026-07-11T15:00:00.000Z')
        })).toThrow('Promo code is not active yet.');

        expect(() => resolveCommercialPromoApplication({
            settings: {
                storefront_promos: {
                    value: [{ ...settings.storefront_promos.value[0], valid_from: '2026-07-11', valid_time_start: '23:30', valid_time_end: '23:59' }]
                }
            },
            promoCode: 'MIDNIGHT20',
            prepared,
            now: new Date('2026-07-11T15:00:00.000Z')
        })).toThrow('Promo code is outside its valid time window.');
    });

    test('allocates only eligible lines and reconciles rounding to the header discount', () => {
        const result = resolveCommercialPromoApplication({
            settings: {
                storefront_promos: {
                    value: [{
                        active: true,
                        promo_code: 'MEAL15',
                        discount_percent: 15,
                        target_item_ids: [10]
                    }]
                }
            },
            promoCode: 'meal15',
            prepared: {
                subtotalAmount: 133.33,
                preparedLines: [
                    { item_id: 10, quantity: 1, sale_price: 33.33, line_subtotal: 33.33 },
                    { item_id: 10, quantity: 1, sale_price: 50, line_subtotal: 50 },
                    { item_id: 20, quantity: 1, sale_price: 50, line_subtotal: 50 }
                ]
            }
        });

        expect(result).toEqual(expect.objectContaining({
            applied: true,
            enteredPromoCode: 'MEAL15',
            discountAmount: 12.4995,
            discountRate: 15
        }));
        expect(result.lineAllocations).toEqual([
            expect.objectContaining({ item_id: 10, discount_amount: 4.9995, final_line_amount: 28.3305 }),
            expect.objectContaining({ item_id: 10, discount_amount: 7.5, final_line_amount: 42.5 }),
            expect.objectContaining({ item_id: 20, discount_amount: 0, final_line_amount: 50 })
        ]);
        expect(result.lineAllocations.reduce((sum, line) => sum + line.discount_amount, 0)).toBeCloseTo(result.discountAmount, 4);
    });

    test('uses the scheduled fulfillment time and selected fulfillment method for storefront promo eligibility', () => {
        const settings = {
            storefront_promos: {
                value: [{
                    active: true,
                    promo_code: 'PICKUPLUNCH',
                    discount_percent: 20,
                    fulfillment_methods: { delivery: false, pickup: true },
                    order_timing: { asap: true, scheduled: true },
                    valid_time_start: '10:00',
                    valid_time_end: '14:00'
                }]
            }
        };
        const prepared = {
            subtotalAmount: 100,
            preparedLines: [{ item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 }]
        };

        expect(() => resolveCommercialPromoApplication({
            settings,
            promoCode: 'PICKUPLUNCH',
            prepared,
            channel: 'storefront',
            orderMethod: 'delivery',
            scheduledFor: new Date('2026-07-12T11:00:00+08:00')
        })).toThrow('Promo code is not available for this fulfillment method.');

        expect(() => resolveCommercialPromoApplication({
            settings,
            promoCode: 'PICKUPLUNCH',
            prepared,
            channel: 'storefront',
            orderMethod: 'pickup',
            scheduledFor: new Date('2026-07-12T15:00:00+08:00')
        })).toThrow('Promo code is outside its valid time window.');

        expect(resolveCommercialPromoApplication({
            settings,
            promoCode: 'PICKUPLUNCH',
            prepared,
            channel: 'storefront',
            orderMethod: 'pickup',
            scheduledFor: new Date('2026-07-12T11:00:00+08:00')
        })).toEqual(expect.objectContaining({ applied: true, discountAmount: 20 }));
    });
});

describe('#2159 legacy promo revocation policy', () => {
    const now = new Date('2026-07-10T04:00:00.000Z');

    test('public projection withholds revoked, exhausted, and expired codes but keeps scheduled ones', () => {
        const promos = [
            { active: true, promo_code: 'AVAILABLE', discount_percent: 10 },
            { active: true, promo_code: 'SCHEDULED', discount_percent: 10, valid_from: '2026-08-01' },
            { active: true, promo_code: 'REVOKED', discount_percent: 10, revoked: true, revoked_at: '2026-07-09T00:00:00.000Z', revoked_by: 'admin' },
            { active: true, promo_code: 'EXHAUSTED', discount_percent: 10, usage_limit: 10, used_count: 10 },
            { active: true, promo_code: 'EXPIRED', discount_percent: 10, valid_until: '2026-07-09' }
        ];

        expect(parsePublicCommercialPromos(promos, { timezone: 'Asia/Manila', now }).map((promo) => promo.promo_code))
            .toEqual(['AVAILABLE', 'SCHEDULED']);
    });

    test('effective state distinguishes revoked, inactive, invalid, exhausted, expired, scheduled, and available', () => {
        const stateOf = (entry) => resolveCommercialPromoEffectiveState({
            ...{
                sourceKey: 'storefront_promos',
                promoCode: 'CODE',
                discountPercent: 10,
                active: true,
                revoked: false,
                usageLimit: null,
                usedCount: 0,
                validFrom: '',
                validUntil: ''
            },
            ...entry
        }, { timezone: 'Asia/Manila', now });

        expect(stateOf({})).toBe('available');
        expect(stateOf({ revoked: true })).toBe('revoked');
        expect(stateOf({ active: false })).toBe('inactive');
        expect(stateOf({ promoCode: '' })).toBe('invalid');
        expect(stateOf({ discountPercent: 0 })).toBe('invalid');
        expect(stateOf({ usageLimit: 10, usedCount: 10 })).toBe('exhausted');
        expect(stateOf({ validUntil: '2026-07-09' })).toBe('expired');
        expect(stateOf({ validFrom: '2026-07-11' })).toBe('not_started');
    });

    test('checkout rejects a revoked promo with a dedicated reason code', () => {
        let thrown = null;
        try {
            resolveCommercialPromoApplication({
                settings: {
                    storefront_promos: {
                        value: [{
                            active: true,
                            promo_code: 'REVOKED10',
                            discount_percent: 10,
                            revoked: true,
                            revoked_at: '2026-07-09T00:00:00.000Z',
                            revoked_by: 'admin'
                        }]
                    }
                },
                promoCode: 'REVOKED10',
                prepared: { subtotalAmount: 100, preparedLines: [{ item_id: 1, quantity: 1, sale_price: 100, line_subtotal: 100 }] }
            });
        } catch (error) {
            thrown = error;
        }
        expect(thrown?.message).toBe('Promo code has been revoked.');
        expect(thrown?.details?.reason_code).toBe('PROMO_REVOKED');
    });

    test('singular compatibility projection withholds a non-redeemable code but preserves display-only entries', () => {
        expect(projectPublicLegacyPromo({ active: true, title: 'Banner only' }, { timezone: 'Asia/Manila', now }))
            .toEqual({ active: true, title: 'Banner only' });
        expect(projectPublicLegacyPromo({ active: true, promo_code: 'OK10', discount_percent: 10 }, { timezone: 'Asia/Manila', now }))
            .toEqual(expect.objectContaining({ promo_code: 'OK10' }));
        expect(projectPublicLegacyPromo({ active: true, promo_code: 'REVOKED10', discount_percent: 10, revoked: true }, { timezone: 'Asia/Manila', now }))
            .toBeNull();
        expect(projectPublicLegacyPromo({ active: true, promo_code: 'GONE10', discount_percent: 10, usage_limit: 1, used_count: 1 }, { timezone: 'Asia/Manila', now }))
            .toBeNull();
    });

    test('public visibility stays a single shared decision', () => {
        const base = {
            active: true,
            promoCode: 'CODE',
            discountPercent: 10,
            revoked: false,
            usageLimit: null,
            usedCount: 0,
            validFrom: '',
            validUntil: ''
        };
        expect(isCommercialPromoPubliclyVisible(base, { timezone: 'Asia/Manila', now })).toBe(true);
        expect(isCommercialPromoPubliclyVisible({ ...base, revoked: true }, { timezone: 'Asia/Manila', now })).toBe(false);
        expect(isCommercialPromoPubliclyVisible({ ...base, active: false }, { timezone: 'Asia/Manila', now })).toBe(false);
    });
});
