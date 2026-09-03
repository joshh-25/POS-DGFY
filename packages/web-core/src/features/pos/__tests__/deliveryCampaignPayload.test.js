// #1334/Phase 245: delivery_campaign authoring payload -- mirrors voucherManagementPayload.test.js's
// shape exactly (pure, no jsdom, imports from the extracted voucherFormModel.js). Locks in the
// payload/kind-defaulting contract voucherFormModel.js's buildVoucherPayload/applyVoucherKindDefaults
// actually depend on, the same way #716's test locks in the fixed_price XOR shape.

import { describe, test, expect } from 'vitest';
import {
    VOUCHER_CODE_PATTERN,
    applyVoucherKindDefaults,
    blankForm,
    buildVoucherPayload,
    suggestVoucherCode,
    validateFormLocally
} from '../components/voucherFormModel.js';

const deliveryForm = (overrides = {}) => ({
    ...applyVoucherKindDefaults(blankForm(), 'delivery_campaign'),
    code: 'FREEDEL500',
    title: 'Free delivery over 500',
    ...overrides
});

describe('#1334 buildVoucherPayload -- delivery_campaign implicit kind/benefit fields', () => {
    test('sets voucher_kind, benefit_class, and benefit_target implicitly', () => {
        const payload = buildVoucherPayload(deliveryForm());
        expect(payload.voucher_kind).toBe('delivery_campaign');
        expect(payload.benefit_class).toBe('free_delivery');
        expect(payload.benefit_target).toBe('delivery');
    });

    test('"whole fee" waiver mode sends delivery_amount_off_centavos: null', () => {
        const payload = buildVoucherPayload(deliveryForm({ deliveryWaiverMode: 'whole', deliveryAmountOffPesos: '999' }));
        expect(payload.delivery_amount_off_centavos).toBeNull();
    });

    test('"waive up to" mode converts pesos to centavos', () => {
        const payload = buildVoucherPayload(deliveryForm({ deliveryWaiverMode: 'partial', deliveryAmountOffPesos: '50' }));
        expect(payload.delivery_amount_off_centavos).toBe(5000);
    });

    test('the payload carries none of the item-benefit fields at all', () => {
        const payload = buildVoucherPayload(deliveryForm());
        expect(payload).not.toHaveProperty('percent_off_bps');
        expect(payload).not.toHaveProperty('amount_off_centavos');
        expect(payload).not.toHaveProperty('fixed_unit_price_centavos');
        expect(payload).not.toHaveProperty('pricelist_id');
        expect(payload).not.toHaveProperty('max_discount_centavos');
    });

    test('scopes are always empty, even from a form draft carrying stale scopes', () => {
        const payload = buildVoucherPayload(deliveryForm({ scopes: [{ scope_type: 'item', scope_ref_id: 7 }] }));
        expect(payload.scopes).toEqual([]);
    });

    test('auto_apply round-trips true and false', () => {
        expect(buildVoucherPayload(deliveryForm({ autoApply: true })).auto_apply).toBe(true);
        expect(buildVoucherPayload(deliveryForm({ autoApply: false })).auto_apply).toBe(false);
    });

    test('fulfillment_methods_mask is always locked to delivery-only (1), regardless of local flags', () => {
        const payload = buildVoucherPayload(deliveryForm({ fulfillmentFlags: { delivery: false, pickup: true } }));
        expect(payload.fulfillment_methods_mask).toBe(1);
    });

    test('channels_mask force-includes storefront whenever auto_apply is true, and forces POS off', () => {
        const payload = buildVoucherPayload(deliveryForm({ autoApply: true, channelFlags: { storefront: false, pos: true } }));
        expect(payload.channels_mask).toBe(1); // storefront bit only
    });

    test('channels_mask stays freely editable when auto_apply is false (code-entered)', () => {
        const payload = buildVoucherPayload(deliveryForm({ autoApply: false, channelFlags: { storefront: true, pos: true } }));
        expect(payload.channels_mask).toBe(3); // storefront + pos
    });

    test('max_benefit_quantity is always null', () => {
        const payload = buildVoucherPayload(deliveryForm({ maxBenefitQuantity: '10' }));
        expect(payload.max_benefit_quantity).toBeNull();
    });

    test('R6: is_publicly_listed is forced false whenever auto_apply is true', () => {
        const payload = buildVoucherPayload(deliveryForm({ autoApply: true, isPubliclyListed: true }));
        expect(payload.is_publicly_listed).toBe(false);
    });

    test('is_publicly_listed is honored for a code-entered (auto_apply: false) delivery campaign', () => {
        const payload = buildVoucherPayload(deliveryForm({ autoApply: false, isPubliclyListed: true }));
        expect(payload.is_publicly_listed).toBe(true);
    });

    test('min_spend_centavos converts pesos to centavos the same as a promo code', () => {
        expect(buildVoucherPayload(deliveryForm({ minSpendPesos: '500' })).min_spend_centavos).toBe(50000);
        expect(buildVoucherPayload(deliveryForm({ minSpendPesos: '' })).min_spend_centavos).toBeNull();
    });

    test('allow_below_cost and stackable_with_statutory are always sent false', () => {
        const payload = buildVoucherPayload(deliveryForm({ allowBelowCost: true, stackableWithStatutory: true }));
        expect(payload.allow_below_cost).toBe(false);
        expect(payload.stackable_with_statutory).toBe(false);
    });
});

describe('#1334 buildVoucherPayload -- promo_code regression (shared buildVoucherPayload refactor)', () => {
    test('an unchanged item-voucher form still produces the byte-identical payload it does today', () => {
        const form = {
            ...blankForm(),
            code: 'SAVE10',
            title: 'Save 10%',
            benefitClass: 'percent_off',
            percentOffPercent: '10'
        };
        const payload = buildVoucherPayload(form);
        expect(payload).toEqual({
            code: 'SAVE10',
            voucher_kind: 'promo_code',
            title: 'Save 10%',
            subtitle: null,
            badge: null,
            validity_text: null,
            benefit_class: 'percent_off',
            min_spend_centavos: null,
            // #1490 (Phase 262): this exhaustive assertion was not updated when
            // max_order_value_centavos was added to buildVoucherPayload, so it has been failing on
            // `develop` since that phase merged. Added here because #788 touches the same
            // assertion -- fixing one key and leaving the other red would have been worse.
            max_order_value_centavos: null,
            min_quantity: null,
            allow_below_cost: false,
            stackable_with_statutory: false,
            is_publicly_listed: false,
            valid_from: null,
            valid_until: null,
            valid_time_start: null,
            valid_time_end: null,
            weekday_mask: 127,
            channels_mask: 1,
            fulfillment_methods_mask: 3,
            order_timings_mask: 3,
            max_redemptions: null,
            max_total_discount_centavos: null,
            max_benefit_quantity: null,
            scopes: [],
            // #788 (Phase 269): always sent, including as an empty array -- the server reads
            // presence with hasOwnProperty on update, so an omitted key would leave a stored
            // allowlist in place instead of clearing it.
            account_grant_ids: [],
            percent_off_bps: 1000,
            max_discount_centavos: null
        });
    });
});

describe('#1334 applyVoucherKindDefaults', () => {
    test('switching to delivery_campaign resets the kind-dependent slice of the form', () => {
        const promoForm = { ...blankForm(), benefitClass: 'fixed_price', scopes: [{ scope_type: 'item', scope_ref_id: 1 }] };
        const result = applyVoucherKindDefaults(promoForm, 'delivery_campaign');
        expect(result.voucherKind).toBe('delivery_campaign');
        expect(result.benefitClass).toBe('free_delivery');
        expect(result.scopes).toEqual([]);
        expect(result.fulfillmentFlags).toEqual({ delivery: true, pickup: false });
        expect(result.maxBenefitQuantity).toBe('');
        expect(result.allowBelowCost).toBe(false);
    });

    test('switching back to promo_code clears delivery-only state', () => {
        const deliveryForm2 = applyVoucherKindDefaults(blankForm(), 'delivery_campaign');
        const result = applyVoucherKindDefaults({ ...deliveryForm2, autoApply: true, deliveryAmountOffPesos: '50' }, 'promo_code');
        expect(result.voucherKind).toBe('promo_code');
        expect(result.benefitClass).toBe('percent_off');
        expect(result.autoApply).toBe(false);
        expect(result.fulfillmentFlags).toEqual({ delivery: true, pickup: true });
    });

    test('R6: forces is_publicly_listed false when already switching in with auto_apply on', () => {
        const result = applyVoucherKindDefaults({ ...blankForm(), autoApply: true, isPubliclyListed: true }, 'delivery_campaign');
        expect(result.isPubliclyListed).toBe(false);
    });
});

describe('#1506 validateFormLocally -- min_spend_centavos validates for promo_code too', () => {
    // Mirrors deliveryForm() above, but for a minimally-valid promo_code voucher -- otherwise
    // validateFormLocally would flag the unrelated benefit-class fields and drown out the
    // min_spend_centavos assertions these tests actually care about.
    const validPromoForm = (overrides = {}) => ({
        ...blankForm(),
        code: 'SAVE10',
        title: 'Save 10%',
        benefitClass: 'percent_off',
        percentOffPercent: '10',
        ...overrides
    });

    test('flags a negative min_spend_centavos on a promo_code voucher (the #1506 gap)', () => {
        const errors = validateFormLocally(validPromoForm({ minSpendPesos: '-50' }));
        expect(errors).toContainEqual({ field: 'min_spend_centavos', message: 'Minimum item subtotal cannot be negative.' });
    });

    test('does not flag a valid, non-negative min_spend_centavos on a promo_code voucher', () => {
        const errors = validateFormLocally(validPromoForm({ minSpendPesos: '500' }));
        expect(errors.some((error) => error.field === 'min_spend_centavos')).toBe(false);
    });

    test('an empty minSpendPesos never flags, for either voucher kind', () => {
        expect(validateFormLocally(validPromoForm({ minSpendPesos: '' })).some((error) => error.field === 'min_spend_centavos')).toBe(false);
        expect(validateFormLocally(deliveryForm({ minSpendPesos: '' })).some((error) => error.field === 'min_spend_centavos')).toBe(false);
    });

    test('still flags a negative min_spend_centavos on a delivery_campaign voucher (pre-existing coverage, unchanged)', () => {
        const errors = validateFormLocally(deliveryForm({ minSpendPesos: '-1' }));
        expect(errors).toContainEqual({ field: 'min_spend_centavos', message: 'Minimum item subtotal cannot be negative.' });
    });
});

describe('#1334 suggestVoucherCode', () => {
    test('derives a pattern-valid code from a campaign title', () => {
        expect(suggestVoucherCode('Free delivery over 500')).toBe('FREE-DELIVERY-OVER-500');
    });

    test('falls back to a generic but pattern-valid suggestion for a degenerate title', () => {
        expect(suggestVoucherCode('')).toBe('DELIVERY');
        expect(suggestVoucherCode('!!!')).toBe('DELIVERY');
        expect(VOUCHER_CODE_PATTERN.test(suggestVoucherCode(''))).toBe(true);
    });
});
