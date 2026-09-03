// Unit tests for src/modules/vouchers/domain/voucherEligibilityPolicy.js (Phase 103, #614).
//
// The load-bearing cases here are the two FAIL-CLOSED inversions of the promo engine's `isActiveTime`
// (degenerate window, unresolvable timezone) required by ADR 0066 decision 3 `[binding]`, and the
// tenant-timezone weekday boundary, where evaluating in UTC is wrong for eight hours every week.

import {
    DEFAULT_VOUCHER_TIMEZONE,
    VOUCHER_WEEKDAY_MASK_ALL,
    deriveVoucherStatus,
    evaluateVoucherEligibility,
    hasMaskBit
} from '../src/modules/vouchers/domain/voucherEligibilityPolicy.js';

// 2026-08-15T22:00 UTC is a SATURDAY in UTC and already SUNDAY 06:00 in Asia/Manila (UTC+8).
const SATURDAY_UTC_SUNDAY_MANILA = new Date('2026-08-15T22:00:00Z');
// 2026-08-16T04:00 UTC == Sunday 12:00 in Asia/Manila. Midday, so it sits inside an ordinary window.
const SUNDAY_MIDDAY_MANILA = new Date('2026-08-16T04:00:00Z');

const WEEKDAY_BIT_SUNDAY = 1;
const WEEKDAY_BIT_SATURDAY = 64;

const makeVoucher = (overrides = {}) => ({
    voucher_id: 1,
    code: 'SAVE10',
    voucher_kind: 'promo_code',
    title: 'Ten percent off',
    benefit_class: 'percent_off',
    percent_off_bps: 1000,
    amount_off_centavos: null,
    fixed_unit_price_centavos: null,
    max_discount_centavos: null,
    min_spend_centavos: null,
    // #1490: the mirror image of min_spend_centavos above.
    max_order_value_centavos: null,
    min_quantity: null,
    valid_from: null,
    valid_until: null,
    valid_time_start: null,
    valid_time_end: null,
    weekday_mask: VOUCHER_WEEKDAY_MASK_ALL,
    channels_mask: 3,
    fulfillment_methods_mask: 3,
    order_timings_mask: 3,
    max_redemptions: null,
    max_total_discount_centavos: null,
    max_benefit_quantity: null,
    redeemed_count: 0,
    redeemed_value_centavos: 0,
    redeemed_quantity: 0,
    status: 'active',
    version: 0,
    ...overrides
});

const baseContext = (overrides = {}) => ({
    now: SUNDAY_MIDDAY_MANILA,
    timezone: DEFAULT_VOUCHER_TIMEZONE,
    channel: 'pos',
    subtotalCentavos: 100000,
    quantity: 5,
    ...overrides
});

const reasonCodes = (result) => result.reasons.map((reason) => reason.reason_code);

describe('hasMaskBit', () => {
    test('matches a set bit and rejects an unset one', () => {
        expect(hasMaskBit(3, 1)).toBe(true);
        expect(hasMaskBit(3, 2)).toBe(true);
        expect(hasMaskBit(1, 2)).toBe(false);
    });

    test('a zero bit never matches, so an unrecognized channel/method blocks', () => {
        expect(hasMaskBit(3, 0)).toBe(false);
        expect(hasMaskBit(0, 1)).toBe(false);
    });

    test('non-numeric input never matches', () => {
        expect(hasMaskBit(undefined, 1)).toBe(false);
        expect(hasMaskBit(3, 'x')).toBe(false);
    });
});

describe('deriveVoucherStatus', () => {
    test('an active voucher past its valid_until reads as expired', () => {
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'active', valid_until: '2026-08-01' }),
            now: SUNDAY_MIDDAY_MANILA,
            timezone: DEFAULT_VOUCHER_TIMEZONE
        })).toBe('expired');
    });

    test('an active voucher on its final day is still active (inclusive bound)', () => {
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'active', valid_until: '2026-08-16' }),
            now: SUNDAY_MIDDAY_MANILA,
            timezone: DEFAULT_VOUCHER_TIMEZONE
        })).toBe('active');
    });

    test('a draft past its window stays draft — drafts do not expire', () => {
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'draft', valid_until: '2020-01-01' }),
            now: SUNDAY_MIDDAY_MANILA,
            timezone: DEFAULT_VOUCHER_TIMEZONE
        })).toBe('draft');
    });

    test('paused and archived are returned unchanged', () => {
        for (const status of ['paused', 'archived']) {
            expect(deriveVoucherStatus({
                voucher: makeVoucher({ status, valid_until: '2020-01-01' }),
                now: SUNDAY_MIDDAY_MANILA
            })).toBe(status);
        }
    });

    test('an unresolvable timezone does NOT derive expiry — lazy expiry writes a real UPDATE', () => {
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'active', valid_until: '2020-01-01' }),
            now: SUNDAY_MIDDAY_MANILA,
            timezone: 'Not/AZone'
        })).toBe('active');
    });

    test('the expiry boundary is evaluated in the tenant timezone, not UTC', () => {
        // 2026-08-15T22:00Z is still 2026-08-15 in UTC but already 2026-08-16 in Manila.
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'active', valid_until: '2026-08-15' }),
            now: SATURDAY_UTC_SUNDAY_MANILA,
            timezone: DEFAULT_VOUCHER_TIMEZONE
        })).toBe('expired');
        expect(deriveVoucherStatus({
            voucher: makeVoucher({ status: 'active', valid_until: '2026-08-15' }),
            now: SATURDAY_UTC_SUNDAY_MANILA,
            timezone: 'UTC'
        })).toBe('active');
    });
});

describe('evaluateVoucherEligibility — happy path', () => {
    test('a fully open active voucher is eligible with no reasons', () => {
        const result = evaluateVoucherEligibility({ voucher: makeVoucher(), context: baseContext() });
        expect(result).toEqual({ eligible: true, reasons: [] });
    });

    test('a missing voucher is ineligible with VOUCHER_NOT_FOUND', () => {
        const result = evaluateVoucherEligibility({ voucher: null, context: baseContext() });
        expect(reasonCodes(result)).toEqual(['VOUCHER_NOT_FOUND']);
    });
});

describe('evaluateVoucherEligibility — status and date window', () => {
    test.each([
        ['draft', 'VOUCHER_NOT_ACTIVE'],
        ['paused', 'VOUCHER_NOT_ACTIVE'],
        ['archived', 'VOUCHER_NOT_ACTIVE'],
        ['expired', 'VOUCHER_EXPIRED']
    ])('a %s voucher reports %s', (status, expectedCode) => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ status }),
            context: baseContext()
        });
        expect(result.eligible).toBe(false);
        expect(reasonCodes(result)).toContain(expectedCode);
    });

    test('a voucher before its valid_from reports VOUCHER_NOT_STARTED', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_from: '2026-12-01' }),
            context: baseContext()
        });
        expect(reasonCodes(result)).toContain('VOUCHER_NOT_STARTED');
    });

    test('a voucher past its valid_until reports VOUCHER_EXPIRED exactly once', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_until: '2026-01-01' }),
            context: baseContext()
        });
        expect(reasonCodes(result).filter((code) => code === 'VOUCHER_EXPIRED')).toHaveLength(1);
    });

    test('valid_from and valid_until are both inclusive bounds', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_from: '2026-08-16', valid_until: '2026-08-16' }),
            context: baseContext()
        });
        expect(result.eligible).toBe(true);
    });
});

describe('evaluateVoucherEligibility — weekday, in the tenant timezone', () => {
    test('a Sunday-only voucher is eligible at a Saturday-UTC instant that is Sunday in Manila', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ weekday_mask: WEEKDAY_BIT_SUNDAY }),
            context: baseContext({ now: SATURDAY_UTC_SUNDAY_MANILA })
        });
        expect(result.eligible).toBe(true);
    });

    test('the same instant evaluated in UTC blocks a Sunday-only voucher — the bug this guards against', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ weekday_mask: WEEKDAY_BIT_SUNDAY }),
            context: baseContext({ now: SATURDAY_UTC_SUNDAY_MANILA, timezone: 'UTC' })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_WEEKDAY_NOT_ELIGIBLE');
    });

    test('a Saturday-only voucher blocks on a Manila Sunday', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ weekday_mask: WEEKDAY_BIT_SATURDAY }),
            context: baseContext({ now: SATURDAY_UTC_SUNDAY_MANILA })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_WEEKDAY_NOT_ELIGIBLE');
    });
});

describe('evaluateVoucherEligibility — time-of-day window (fail closed)', () => {
    test('an ordinary window containing "now" passes', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '11:00', valid_time_end: '14:00' }),
            context: baseContext()
        });
        expect(result.eligible).toBe(true);
    });

    test('an ordinary window not containing "now" reports VOUCHER_TIME_WINDOW_BLOCKED', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '18:00', valid_time_end: '20:00' }),
            context: baseContext()
        });
        expect(reasonCodes(result)).toContain('VOUCHER_TIME_WINDOW_BLOCKED');
    });

    test('both bounds are inclusive, matching the promo engine it is adapted from', () => {
        const startExactly = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '12:00', valid_time_end: '14:00' }),
            context: baseContext()
        });
        const endExactly = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '09:00', valid_time_end: '12:00' }),
            context: baseContext()
        });
        expect(startExactly.eligible).toBe(true);
        expect(endExactly.eligible).toBe(true);
    });

    test('an overnight (wrapping) window is evaluated with wrap arithmetic', () => {
        const insideWrap = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '22:00', valid_time_end: '02:00' }),
            context: baseContext({ now: SATURDAY_UTC_SUNDAY_MANILA }) // 06:00 Manila -- outside
        });
        expect(reasonCodes(insideWrap)).toContain('VOUCHER_TIME_WINDOW_BLOCKED');

        const withinWrap = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '22:00', valid_time_end: '08:00' }),
            context: baseContext({ now: SATURDAY_UTC_SUNDAY_MANILA }) // 06:00 Manila -- inside
        });
        expect(withinWrap.eligible).toBe(true);
    });

    test('a degenerate window (start === end) FAILS CLOSED — the promo engine returns eligible here', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '12:00', valid_time_end: '12:00' }),
            context: baseContext()
        });
        expect(result.eligible).toBe(false);
        expect(reasonCodes(result)).toContain('VOUCHER_TIME_WINDOW_DEGENERATE');
    });

    test('an unresolvable timezone FAILS CLOSED — the promo engine returns eligible here too', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: '11:00', valid_time_end: '14:00' }),
            context: baseContext({ timezone: 'Not/AZone' })
        });
        expect(result.eligible).toBe(false);
        expect(reasonCodes(result)).toContain('VOUCHER_TIMEZONE_UNRESOLVABLE');
    });

    test('an unresolvable timezone blocks even with no time window configured', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher(),
            context: baseContext({ timezone: 'Not/AZone' })
        });
        expect(result.eligible).toBe(false);
        expect(reasonCodes(result)).toContain('VOUCHER_TIMEZONE_UNRESOLVABLE');
    });

    test('no time window configured means no time constraint', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ valid_time_start: null, valid_time_end: null }),
            context: baseContext()
        });
        expect(result.eligible).toBe(true);
    });
});

describe('evaluateVoucherEligibility — channel, fulfillment, and order timing masks', () => {
    test('a storefront-only voucher blocks on POS', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ channels_mask: 1 }),
            context: baseContext({ channel: 'pos' })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_CHANNEL_NOT_ELIGIBLE');
    });

    test('an unrecognized channel blocks rather than passing', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ channels_mask: 3 }),
            context: baseContext({ channel: 'kiosk' })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_CHANNEL_NOT_ELIGIBLE');
    });

    test('fulfillment and order-timing masks apply on storefront', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ fulfillment_methods_mask: 2, order_timings_mask: 2 }),
            context: baseContext({ channel: 'storefront', fulfillmentMethod: 'delivery', orderTiming: 'asap' })
        });
        expect(reasonCodes(result)).toEqual(expect.arrayContaining([
            'VOUCHER_FULFILLMENT_NOT_ELIGIBLE',
            'VOUCHER_ORDER_TIMING_NOT_ELIGIBLE'
        ]));
    });

    test('a storefront request satisfying both masks is eligible', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ fulfillment_methods_mask: 1, order_timings_mask: 1 }),
            context: baseContext({ channel: 'storefront', fulfillmentMethod: 'delivery', orderTiming: 'asap' })
        });
        expect(result.eligible).toBe(true);
    });

    test('fulfillment and order-timing masks are NOT applied on POS, which has neither', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ fulfillment_methods_mask: 1, order_timings_mask: 1 }),
            context: baseContext({ channel: 'pos' })
        });
        expect(result.eligible).toBe(true);
    });
});

describe('evaluateVoucherEligibility — basket minimums', () => {
    test('a subtotal below min_spend_centavos blocks', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_spend_centavos: 200000 }),
            context: baseContext({ subtotalCentavos: 100000 })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_MIN_SPEND_NOT_MET');
    });

    test('a subtotal exactly at min_spend_centavos passes', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_spend_centavos: 100000 }),
            context: baseContext({ subtotalCentavos: 100000 })
        });
        expect(result.eligible).toBe(true);
    });

    test('a quantity below min_quantity blocks', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_quantity: 10 }),
            context: baseContext({ quantity: 5 })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_MIN_QUANTITY_NOT_MET');
    });

    test('null minimums mean no minimum — they are legitimately nullable', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_spend_centavos: null, min_quantity: null }),
            context: baseContext({ subtotalCentavos: 0, quantity: 0 })
        });
        expect(result.eligible).toBe(true);
    });

    test('BIGINT columns arriving as strings still compare numerically', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_spend_centavos: '100000' }),
            context: baseContext({ subtotalCentavos: 99999 })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_MIN_SPEND_NOT_MET');
    });

    // #1490: max_order_value_centavos mirrors every one of min_spend_centavos's own cases above.
    test('a subtotal above max_order_value_centavos blocks', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_order_value_centavos: 100000 }),
            context: baseContext({ subtotalCentavos: 200000 })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_MAX_ORDER_VALUE_EXCEEDED');
    });

    test('a subtotal exactly at max_order_value_centavos passes', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_order_value_centavos: 100000 }),
            context: baseContext({ subtotalCentavos: 100000 })
        });
        expect(result.eligible).toBe(true);
    });

    test('null max_order_value_centavos means no cap', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_order_value_centavos: null }),
            context: baseContext({ subtotalCentavos: 999999999 })
        });
        expect(result.eligible).toBe(true);
    });

    test('a BIGINT max_order_value_centavos arriving as a string still compares numerically', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_order_value_centavos: '100000' }),
            context: baseContext({ subtotalCentavos: 100001 })
        });
        expect(reasonCodes(result)).toContain('VOUCHER_MAX_ORDER_VALUE_EXCEEDED');
    });

    test('min_spend_centavos and max_order_value_centavos can both apply at once, within the window', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ min_spend_centavos: 50000, max_order_value_centavos: 200000 }),
            context: baseContext({ subtotalCentavos: 100000 })
        });
        expect(result.eligible).toBe(true);
    });
});

describe('evaluateVoucherEligibility — exhaustion previews', () => {
    test('redemption limit reached', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_redemptions: 10, redeemed_count: 10 }),
            context: baseContext()
        });
        expect(reasonCodes(result)).toContain('VOUCHER_REDEMPTION_LIMIT_REACHED');
    });

    test('discount budget exhausted', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_total_discount_centavos: 50000, redeemed_value_centavos: 50000 }),
            context: baseContext()
        });
        expect(reasonCodes(result)).toContain('VOUCHER_BUDGET_EXHAUSTED');
    });

    test('benefit quantity limit reached', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ max_benefit_quantity: 100, redeemed_quantity: 100 }),
            context: baseContext()
        });
        expect(reasonCodes(result)).toContain('VOUCHER_QUANTITY_LIMIT_REACHED');
    });

    test('one below each limit still passes', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({
                max_redemptions: 10,
                redeemed_count: 9,
                max_total_discount_centavos: 50000,
                redeemed_value_centavos: 49999,
                max_benefit_quantity: 100,
                redeemed_quantity: 99
            }),
            context: baseContext()
        });
        expect(result.eligible).toBe(true);
    });
});

describe('evaluateVoucherEligibility — collect-all behavior', () => {
    test('every failing condition is reported, not just the first', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({
                status: 'paused',
                valid_from: '2027-01-01',
                weekday_mask: WEEKDAY_BIT_SATURDAY,
                channels_mask: 1,
                min_spend_centavos: 999999,
                min_quantity: 999,
                max_redemptions: 1,
                redeemed_count: 1
            }),
            context: baseContext({ channel: 'pos' })
        });

        expect(result.eligible).toBe(false);
        expect(reasonCodes(result)).toEqual(expect.arrayContaining([
            'VOUCHER_NOT_ACTIVE',
            'VOUCHER_NOT_STARTED',
            'VOUCHER_WEEKDAY_NOT_ELIGIBLE',
            'VOUCHER_CHANNEL_NOT_ELIGIBLE',
            'VOUCHER_MIN_SPEND_NOT_MET',
            'VOUCHER_MIN_QUANTITY_NOT_MET',
            'VOUCHER_REDEMPTION_LIMIT_REACHED'
        ]));
    });

    test('reason codes are never duplicated', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ status: 'active', valid_until: '2020-01-01' }),
            context: baseContext()
        });
        expect(new Set(reasonCodes(result)).size).toBe(reasonCodes(result).length);
    });

    test('every reason carries a reason_code, a message, and a details object', () => {
        const result = evaluateVoucherEligibility({
            voucher: makeVoucher({ status: 'draft' }),
            context: baseContext()
        });
        result.reasons.forEach((reason) => {
            expect(typeof reason.reason_code).toBe('string');
            expect(typeof reason.message).toBe('string');
            expect(typeof reason.details).toBe('object');
        });
    });
});
