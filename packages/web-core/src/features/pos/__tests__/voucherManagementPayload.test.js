// Regression test for #716: a fixed-price voucher could not be created from the merchant UI at
// all. `buildVoucherPayload` sends the inapplicable fixed-price field as an explicit `null` rather
// than omitting the key -- correct and required for the update path (switching an existing
// fixed_price voucher between "single price" and "pricelist" sub-modes must null out the stale
// field, since the server's applyBenefitConfig sees the merged/stored row and would otherwise
// throw VOUCHER_PRICELIST_CONFLICT if both were present). The actual bug was on the API side
// (voucherValidator.js's createVoucherSchema rejected the key's mere presence, even when null) --
// see apps/dgfy-api/tests/voucherValidator.test.js's "#716" block for that fix.
//
// This test exists because zero frontend tests covered this panel before #716 shipped -- nothing
// here would have caught the create-schema mismatch, but it does lock in the payload shape both
// the create and update paths actually depend on.

import { describe, test, expect } from 'vitest';
import { buildVoucherPayload, blankForm } from '../components/VoucherManagementPanel.jsx';
import { voucherToForm } from '../components/voucherFormModel.js';

describe('#716 buildVoucherPayload — fixed_price XOR payload shape', () => {
    test('single-price sub-mode sends a real price and an explicit null pricelist_id', () => {
        const form = {
            ...blankForm(),
            code: 'PIN1',
            title: 'Single price',
            benefitClass: 'fixed_price',
            fixedPriceSource: 'single',
            fixedUnitPricePesos: '50.00',
            scopes: [{ scope_type: 'item', scope_ref_id: 1 }]
        };
        const payload = buildVoucherPayload(form);
        expect(payload.fixed_unit_price_centavos).toBe(5000);
        expect(payload.pricelist_id).toBeNull();
        expect(payload.scopes).toEqual([{ scope_type: 'item', scope_ref_id: 1 }]);
    });

    test('pricelist sub-mode sends a real pricelist_id, an explicit null price, and no scopes', () => {
        const form = {
            ...blankForm(),
            code: 'WHOLESALE1',
            title: 'Wholesale',
            benefitClass: 'fixed_price',
            fixedPriceSource: 'pricelist',
            pricelistId: '7',
            scopes: [{ scope_type: 'item', scope_ref_id: 1 }] // stale scopes from a prior single-price edit
        };
        const payload = buildVoucherPayload(form);
        expect(payload.pricelist_id).toBe(7);
        expect(payload.fixed_unit_price_centavos).toBeNull();
        // A pricelist IS the scope (#696) -- stale scopes must be cleared, not carried through.
        expect(payload.scopes).toEqual([]);
    });

    test('exactly one of the two fixed-price fields is ever a real (non-null) value', () => {
        for (const source of ['single', 'pricelist']) {
            const form = {
                ...blankForm(),
                code: 'X',
                title: 'X',
                benefitClass: 'fixed_price',
                fixedPriceSource: source,
                fixedUnitPricePesos: '10.00',
                pricelistId: '3'
            };
            const payload = buildVoucherPayload(form);
            const realValues = [payload.fixed_unit_price_centavos, payload.pricelist_id].filter((v) => v !== null);
            expect(realValues).toHaveLength(1);
        }
    });

    test('percent_off and amount_off never emit either fixed-price field', () => {
        for (const benefitClass of ['percent_off', 'amount_off']) {
            const form = {
                ...blankForm(),
                code: 'X',
                title: 'X',
                benefitClass,
                percentOffPercent: '10',
                amountOffPesos: '50.00'
            };
            const payload = buildVoucherPayload(form);
            expect(payload).not.toHaveProperty('fixed_unit_price_centavos');
            expect(payload).not.toHaveProperty('pricelist_id');
        }
    });
});

// #713: is_publicly_listed controls storefront advertising, independent of channels_mask
// (channelFlags). A B2B pricelist voucher can be POS-usable and unadvertised at once -- neither
// implies the other.
describe('#713 buildVoucherPayload — is_publicly_listed independent of channelFlags', () => {
    test('defaults to false on a blank form, matching the backend column default', () => {
        const payload = buildVoucherPayload({ ...blankForm(), code: 'X', title: 'X', benefitClass: 'percent_off', percentOffPercent: '10' });
        expect(payload.is_publicly_listed).toBe(false);
    });

    test('sends true when checked, independent of the channel selection', () => {
        const form = {
            ...blankForm(),
            code: 'WHOLESALE1',
            title: 'Wholesale',
            benefitClass: 'percent_off',
            percentOffPercent: '10',
            isPubliclyListed: false,
            channelFlags: { storefront: true, pos: true }
        };
        const payload = buildVoucherPayload(form);
        expect(payload.is_publicly_listed).toBe(false);
        expect(payload.channels_mask).toBe(3);

        const listedForm = { ...form, isPubliclyListed: true, channelFlags: { storefront: false, pos: true } };
        const listedPayload = buildVoucherPayload(listedForm);
        expect(listedPayload.is_publicly_listed).toBe(true);
        expect(listedPayload.channels_mask).toBe(2);
    });
});

// #1490: max_order_value_centavos round-trips through buildVoucherPayload and voucherToForm, the
// same round-trip min_spend_centavos already gets covered by #713's tests above.
describe('#1490 buildVoucherPayload/voucherToForm — max_order_value_centavos round-tripping', () => {
    test('blank maxOrderValuePesos sends null', () => {
        const payload = buildVoucherPayload({ ...blankForm(), code: 'X', title: 'X', benefitClass: 'percent_off', percentOffPercent: '10' });
        expect(payload.max_order_value_centavos).toBeNull();
    });

    test('a set maxOrderValuePesos sends the equivalent centavos', () => {
        const form = {
            ...blankForm(),
            code: 'X',
            title: 'X',
            benefitClass: 'percent_off',
            percentOffPercent: '10',
            maxOrderValuePesos: '500.00'
        };
        const payload = buildVoucherPayload(form);
        expect(payload.max_order_value_centavos).toBe(50000);
    });

    test('voucherToForm round-trips a stored max_order_value_centavos back to pesos', () => {
        const voucher = {
            voucher_id: 1,
            version: 0,
            status: 'draft',
            derived_status: 'draft',
            benefit_class: 'percent_off',
            max_order_value_centavos: 50000,
            channels_mask: 1,
            fulfillment_methods_mask: 1,
            order_timings_mask: 1,
            weekday_mask: 127
        };
        const form = voucherToForm(voucher);
        expect(form.maxOrderValuePesos).toBe('500');
    });

    test('voucherToForm maps a null max_order_value_centavos to an empty string', () => {
        const voucher = {
            voucher_id: 1,
            version: 0,
            status: 'draft',
            derived_status: 'draft',
            benefit_class: 'percent_off',
            max_order_value_centavos: null,
            channels_mask: 1,
            fulfillment_methods_mask: 1,
            order_timings_mask: 1,
            weekday_mask: 127
        };
        const form = voucherToForm(voucher);
        expect(form.maxOrderValuePesos).toBe('');
    });
});

// #1494: created_by_username/updated_by_username are display-only projections -- voucherToForm
// carries them through, buildVoucherPayload must never emit them.
describe('#1494 voucherToForm/buildVoucherPayload — audit fields are display-only', () => {
    test('voucherToForm carries through the username projections and timestamps', () => {
        const voucher = {
            voucher_id: 1,
            version: 0,
            status: 'draft',
            derived_status: 'draft',
            benefit_class: 'percent_off',
            channels_mask: 1,
            fulfillment_methods_mask: 1,
            order_timings_mask: 1,
            weekday_mask: 127,
            created_by_username: 'alice',
            updated_by_username: 'bob',
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-02T00:00:00.000Z'
        };
        const form = voucherToForm(voucher);
        expect(form.createdByUsername).toBe('alice');
        expect(form.updatedByUsername).toBe('bob');
        expect(form.createdAt).toBe('2026-09-01T00:00:00.000Z');
        expect(form.updatedAt).toBe('2026-09-02T00:00:00.000Z');
    });

    test('buildVoucherPayload never emits created_by/updated_by/username fields', () => {
        const form = {
            ...blankForm(),
            code: 'X',
            title: 'X',
            benefitClass: 'percent_off',
            percentOffPercent: '10',
            createdByUsername: 'alice',
            updatedByUsername: 'bob'
        };
        const payload = buildVoucherPayload(form);
        expect(payload).not.toHaveProperty('created_by');
        expect(payload).not.toHaveProperty('updated_by');
        expect(payload).not.toHaveProperty('created_by_username');
        expect(payload).not.toHaveProperty('updated_by_username');
    });
});
