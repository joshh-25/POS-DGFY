// Direct tests for src/validators/voucherValidator.js (Phase 103, #614).
//
// The validator needs its own coverage rather than being exercised only through the use cases,
// because its most important property is a NEGATIVE one: server-owned fields must ERROR, not be
// silently stripped. `stripUnknown: true` drops-and-succeeds, so "the use case did not write it" is
// not evidence the request was rejected -- only asserting the 422 proves that.

import {
    __testables,
    validateCreateVoucher,
    validateUpdateVoucher,
    validateVoucherIdParam,
    validateVoucherListQuery
} from '../src/validators/voucherValidator.js';

const { createVoucherSchema, updateVoucherSchema, voucherListQuerySchema } = __testables;

const validate = (schema, payload) => schema.validate(payload, { abortEarly: false, stripUnknown: true });

const errorFields = (error) => (error ? error.details.map((detail) => detail.path.join('.')) : []);

const runMiddleware = (middleware, req) => new Promise((resolve) => {
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; resolve({ req, res: this, nextCalled: false }); return this; }
    };
    middleware(req, res, () => resolve({ req, res, nextCalled: true }));
});

const validCreatePayload = (overrides = {}) => ({
    code: 'SAVE10',
    title: 'Ten percent off',
    benefit_class: 'percent_off',
    percent_off_bps: 1000,
    ...overrides
});

describe('create schema — server-owned fields are refused, not stripped', () => {
    test.each([
        'voucher_id',
        'status',
        'conditions',
        'redeemed_count',
        'redeemed_value_centavos',
        'redeemed_quantity',
        'created_at',
        'updated_at',
        'version'
    ])('%s is forbidden on create', (field) => {
        const { error } = validate(createVoucherSchema, validCreatePayload({ [field]: 1 }));
        expect(errorFields(error)).toContain(field);
    });

    test('a genuinely unknown field IS stripped — the contrast that makes the rule above matter', () => {
        const { error, value } = validate(createVoucherSchema, validCreatePayload({ totally_made_up: 'x' }));
        expect(error).toBeUndefined();
        expect(value.totally_made_up).toBeUndefined();
    });
});

describe('update schema — server-owned fields are refused there too', () => {
    test.each([
        'voucher_id',
        'status',
        'conditions',
        'redeemed_count',
        'redeemed_value_centavos',
        'redeemed_quantity',
        'created_at',
        'updated_at'
    ])('%s is forbidden on update', (field) => {
        const { error } = validate(updateVoucherSchema, { version: 0, title: 'Renamed', [field]: 1 });
        expect(errorFields(error)).toContain(field);
    });

    test('version is REQUIRED on update, unlike create where it is forbidden', () => {
        const { error } = validate(updateVoucherSchema, { title: 'Renamed' });
        expect(errorFields(error)).toContain('version');
    });

    test('a version-only body is refused — an update must actually change something', () => {
        const { error } = validate(updateVoucherSchema, { version: 0 });
        expect(error).toBeDefined();
        expect(error.details[0].message).toMatch(/At least one field besides version/);
    });

    test('the update schema injects no defaults, so an omitted mask is never rewritten', () => {
        const { error, value } = validate(updateVoucherSchema, { version: 0, title: 'Renamed' });
        expect(error).toBeUndefined();
        expect(Object.keys(value).sort()).toEqual(['title', 'version']);
    });
});

describe('eligibility masks — null and zero are unrepresentable', () => {
    test.each(['weekday_mask', 'channels_mask', 'fulfillment_methods_mask', 'order_timings_mask'])(
        '%s rejects null',
        (field) => {
            const { error } = validate(createVoucherSchema, validCreatePayload({ [field]: null }));
            expect(errorFields(error)).toContain(field);
        }
    );

    test.each(['weekday_mask', 'channels_mask', 'fulfillment_methods_mask', 'order_timings_mask'])(
        '%s rejects 0 ("eligible nowhere" is not a state)',
        (field) => {
            const { error } = validate(createVoucherSchema, validCreatePayload({ [field]: 0 }));
            expect(errorFields(error)).toContain(field);
        }
    );

    test('masks default to their ADR 0066 values on create', () => {
        const { error, value } = validate(createVoucherSchema, validCreatePayload());
        expect(error).toBeUndefined();
        expect(value.weekday_mask).toBe(127);
        expect(value.channels_mask).toBe(1);
        expect(value.fulfillment_methods_mask).toBe(3);
        expect(value.order_timings_mask).toBe(3);
        expect(value.voucher_kind).toBe('promo_code');
        expect(value.allow_below_cost).toBe(false);
        expect(value.stackable_with_statutory).toBe(false);
        expect(value.is_publicly_listed).toBe(false);
    });

    // #713: independent of channels_mask -- controls storefront advertising, not code usability.
    test('is_publicly_listed accepts an explicit true on create and update', () => {
        const created = validate(createVoucherSchema, validCreatePayload({ is_publicly_listed: true }));
        expect(created.error).toBeUndefined();
        expect(created.value.is_publicly_listed).toBe(true);

        const updated = validate(updateVoucherSchema, { is_publicly_listed: true, version: 0 });
        expect(updated.error).toBeUndefined();
        expect(updated.value.is_publicly_listed).toBe(true);
    });

    test('an out-of-range mask is rejected', () => {
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ weekday_mask: 128 })).error))
            .toContain('weekday_mask');
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ channels_mask: 4 })).error))
            .toContain('channels_mask');
    });
});

describe('benefit-class conditionals on create', () => {
    test('percent_off requires percent_off_bps', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'SAVE10', title: 'Valid title', benefit_class: 'percent_off'
        });
        expect(errorFields(error)).toContain('percent_off_bps');
    });

    test('percent_off forbids the other two amount fields', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            amount_off_centavos: 100,
            fixed_unit_price_centavos: 100
        }));
        expect(errorFields(error)).toEqual(expect.arrayContaining([
            'amount_off_centavos',
            'fixed_unit_price_centavos'
        ]));
    });

    test('percent_off_bps is capped at 10000 basis points', () => {
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ percent_off_bps: 10001 })).error))
            .toContain('percent_off_bps');
        expect(validate(createVoucherSchema, validCreatePayload({ percent_off_bps: 10000 })).error).toBeUndefined();
    });

    test('amount_off requires amount_off_centavos and forbids max_discount_centavos', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'FLAT50', title: 'Valid title', benefit_class: 'amount_off', max_discount_centavos: 100
        });
        expect(errorFields(error)).toEqual(expect.arrayContaining(['amount_off_centavos', 'max_discount_centavos']));
    });

    test('fixed_price requires fixed_unit_price_centavos and at least one scope', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'PIN8', title: 'Valid title', benefit_class: 'fixed_price'
        });
        expect(errorFields(error)).toEqual(expect.arrayContaining(['fixed_unit_price_centavos', 'scopes']));
    });

    test('fixed_price with an empty scopes array is refused', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'PIN8', title: 'Valid title', benefit_class: 'fixed_price', fixed_unit_price_centavos: 800, scopes: []
        });
        expect(errorFields(error)).toContain('scopes');
    });

    test('fixed_price with a scope is accepted, and a pinned price of 0 is legal', () => {
        const { error, value } = validate(createVoucherSchema, {
            code: 'PIN0',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: 0,
            scopes: [{ scope_type: 'item', scope_ref_id: 1 }]
        });
        expect(error).toBeUndefined();
        expect(value.fixed_unit_price_centavos).toBe(0);
    });

    test('an unrecognized benefit class is rejected', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({ benefit_class: 'buy_one_get_one' }));
        expect(errorFields(error)).toContain('benefit_class');
    });
});

describe('#696 pricelist attachment on create', () => {
    test('fixed_price with a pricelist_id needs no fixed_unit_price_centavos and no scopes', () => {
        const { error, value } = validate(createVoucherSchema, {
            code: 'WHOLESALE1', title: 'Valid title', benefit_class: 'fixed_price', pricelist_id: 7
        });
        expect(error).toBeUndefined();
        expect(value.pricelist_id).toBe(7);
        expect(value.fixed_unit_price_centavos).toBeUndefined();
        expect(value.scopes).toEqual([]);
    });

    test('sending both fixed_unit_price_centavos and pricelist_id is rejected', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'PIN8',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: 800,
            pricelist_id: 7,
            scopes: [{ scope_type: 'item', scope_ref_id: 1 }]
        });
        // fixed_unit_price_centavos becomes forbidden the moment pricelist_id is present.
        expect(errorFields(error)).toContain('fixed_unit_price_centavos');
    });

    test('pricelist_id is forbidden for percent_off and amount_off', () => {
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ pricelist_id: 7 })).error))
            .toContain('pricelist_id');
        expect(errorFields(validate(createVoucherSchema, {
            code: 'FLAT50', title: 'Valid title', benefit_class: 'amount_off', amount_off_centavos: 500, pricelist_id: 7
        }).error)).toContain('pricelist_id');
    });
});

describe('#716 create tolerates the real UI payload — an explicit null on the inapplicable field', () => {
    // VoucherManagementPanel.jsx's buildVoucherPayload sends the *other* branch's field as an
    // explicit `null` rather than omitting the key. Both of the next two cases are the real
    // payloads the UI builds -- both 422'd before this fix (`Joi.forbidden()` disallows the key's
    // mere presence, and `Joi.exist()` is satisfied by `null`).
    test('single-price sub-mode: fixed_unit_price_centavos set, pricelist_id explicitly null', () => {
        const { error, value } = validate(createVoucherSchema, {
            code: 'PIN9',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: 5000,
            pricelist_id: null,
            scopes: [{ scope_type: 'item', scope_ref_id: 1 }]
        });
        expect(error).toBeUndefined();
        expect(value.fixed_unit_price_centavos).toBe(5000);
        expect(value.pricelist_id).toBeNull();
    });

    test('pricelist sub-mode: pricelist_id set, fixed_unit_price_centavos explicitly null', () => {
        const { error, value } = validate(createVoucherSchema, {
            code: 'WHOLESALE2',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: null,
            pricelist_id: 7,
            scopes: []
        });
        expect(error).toBeUndefined();
        expect(value.pricelist_id).toBe(7);
        expect(value.fixed_unit_price_centavos).toBeNull();
    });

    test('single-price sub-mode with no scopes is still refused — null pricelist_id must not skip the scope requirement', () => {
        // Regression for the same Joi.exist()-matches-null bug, in the scopes conditional: an
        // explicit `pricelist_id: null` must NOT be read as "a pricelist is attached".
        const { error } = validate(createVoucherSchema, {
            code: 'PIN10',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: 5000,
            pricelist_id: null,
            scopes: []
        });
        expect(errorFields(error)).toContain('scopes');
    });

    test('a real value on the inapplicable field is still rejected, even alongside the correct one', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'PIN11',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: 5000,
            pricelist_id: 7,
            scopes: []
        });
        expect(errorFields(error)).toContain('fixed_unit_price_centavos');
    });

    test('both fields null on fixed_price is still rejected — one of the two is mandatory', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'PIN12',
            title: 'Valid title',
            benefit_class: 'fixed_price',
            fixed_unit_price_centavos: null,
            pricelist_id: null
        });
        expect(errorFields(error)).toContain('fixed_unit_price_centavos');
    });

    test('pricelist_id: null on percent_off is accepted as a no-op', () => {
        const { error, value } = validate(createVoucherSchema, validCreatePayload({ pricelist_id: null }));
        expect(error).toBeUndefined();
        expect(value.pricelist_id).toBeNull();
    });

    test('fixed_unit_price_centavos: null on amount_off is accepted as a no-op', () => {
        const { error } = validate(createVoucherSchema, {
            code: 'FLAT51', title: 'Valid title', benefit_class: 'amount_off', amount_off_centavos: 500,
            fixed_unit_price_centavos: null
        });
        expect(error).toBeUndefined();
    });
});

describe('scopes', () => {
    test('duplicate (scope_type, scope_ref_id) pairs are rejected', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            scopes: [
                { scope_type: 'item', scope_ref_id: 1 },
                { scope_type: 'item', scope_ref_id: 1 }
            ]
        }));
        expect(error).toBeDefined();
        expect(errorFields(error).join(',')).toMatch(/scopes/);
    });

    test('the same ref id under a different scope_type is NOT a duplicate', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            scopes: [
                { scope_type: 'item', scope_ref_id: 1 },
                { scope_type: 'item_folder', scope_ref_id: 1 }
            ]
        }));
        expect(error).toBeUndefined();
    });

    test('an unrecognized scope_type is rejected', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            scopes: [{ scope_type: 'category', scope_ref_id: 1 }]
        }));
        expect(error).toBeDefined();
    });

    test('more than 500 scopes is rejected', () => {
        const scopes = Array.from({ length: 501 }, (_, index) => ({ scope_type: 'item', scope_ref_id: index + 1 }));
        const { error } = validate(createVoucherSchema, validCreatePayload({ scopes }));
        expect(errorFields(error)).toContain('scopes');
    });
});

describe('code', () => {
    test.each(['AB', 'save 10', '-LEADING', 'WITH$SIGN', ''])('rejects %p', (code) => {
        const { error } = validate(createVoucherSchema, validCreatePayload({ code }));
        expect(errorFields(error)).toContain('code');
    });

    test('normalizes to trimmed upper case', () => {
        const { error, value } = validate(createVoucherSchema, validCreatePayload({ code: '  save-10_a.b  ' }));
        expect(error).toBeUndefined();
        expect(value.code).toBe('SAVE-10_A.B');
    });

    test('is required on create', () => {
        const { error } = validate(createVoucherSchema, { title: 'Valid title', benefit_class: 'percent_off', percent_off_bps: 1 });
        expect(errorFields(error)).toContain('code');
    });
});

describe('date and time fields', () => {
    test('rejects a non ISO-date valid_from', () => {
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ valid_from: '08/16/2026' })).error))
            .toContain('valid_from');
    });

    test('rejects an out-of-range clock time', () => {
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ valid_time_start: '24:00' })).error))
            .toContain('valid_time_start');
        expect(errorFields(validate(createVoucherSchema, validCreatePayload({ valid_time_end: '12:60' })).error))
            .toContain('valid_time_end');
    });

    test('accepts nulls for every optional window field', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            valid_from: null, valid_until: null, valid_time_start: null, valid_time_end: null
        }));
        expect(error).toBeUndefined();
    });

    test('min_spend_centavos and min_quantity are legitimately nullable', () => {
        const { error } = validate(createVoucherSchema, validCreatePayload({
            min_spend_centavos: null, min_quantity: null
        }));
        expect(error).toBeUndefined();
    });
});

describe('cross-field rules via the middleware', () => {
    test('valid_until earlier than valid_from is a 422', async () => {
        const { res, nextCalled } = await runMiddleware(validateCreateVoucher, {
            body: validCreatePayload({ valid_from: '2026-09-01', valid_until: '2026-08-01' })
        });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('valid_until');
    });

    test('a half-configured time window is a 422 on create', async () => {
        const { res } = await runMiddleware(validateCreateVoucher, {
            body: validCreatePayload({ valid_time_start: '09:00' })
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('valid_time_end');
    });

    test('a degenerate time window (start === end) is a 422', async () => {
        const { res } = await runMiddleware(validateCreateVoucher, {
            body: validCreatePayload({ valid_time_start: '09:00', valid_time_end: '09:00' })
        });
        expect(res.statusCode).toBe(422);
    });

    test('an overnight window is accepted — wrap-around is legal', async () => {
        const { req, nextCalled } = await runMiddleware(validateCreateVoucher, {
            body: validCreatePayload({ valid_time_start: '22:00', valid_time_end: '02:00' })
        });
        expect(nextCalled).toBe(true);
        expect(req.validatedData.valid_time_start).toBe('22:00');
    });

    test('an update sending a benefit amount without benefit_class is a 422', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, percent_off_bps: 2000 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('benefit_class');
    });

    test('an update sending a mismatched benefit amount for the stated class is a 422', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, benefit_class: 'percent_off', percent_off_bps: 2000, amount_off_centavos: 500 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('amount_off_centavos');
    });

    test('an update sending max_discount_centavos with amount_off is a 422', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, benefit_class: 'amount_off', amount_off_centavos: 500, max_discount_centavos: 100 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('max_discount_centavos');
    });

    test('an update sending pricelist_id without benefit_class is a 422 (#696)', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, pricelist_id: 7 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('benefit_class');
    });

    test('an update sending pricelist_id for a non-fixed_price class is a 422 (#696)', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, benefit_class: 'percent_off', percent_off_bps: 1000, pricelist_id: 7 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('pricelist_id');
    });

    test('an update sending both fixed_unit_price_centavos and pricelist_id is a 422 (#696)', async () => {
        const { res } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, benefit_class: 'fixed_price', fixed_unit_price_centavos: 800, pricelist_id: 7 }
        });
        expect(res.statusCode).toBe(422);
        expect(res.body.errors.map((row) => row.field)).toContain('pricelist_id');
    });

    test('an update attaching only pricelist_id (with benefit_class resent) passes through', async () => {
        const { nextCalled, req } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, benefit_class: 'fixed_price', pricelist_id: 7 }
        });
        expect(nextCalled).toBe(true);
        expect(req.validatedData.pricelist_id).toBe(7);
    });

    test('an update sending only one half of the time window is allowed through to the use case', async () => {
        const { nextCalled } = await runMiddleware(validateUpdateVoucher, {
            body: { version: 0, valid_time_start: '09:00' }
        });
        expect(nextCalled).toBe(true);
    });

    test('a valid create passes and lands on req.validatedData', async () => {
        const { req, nextCalled } = await runMiddleware(validateCreateVoucher, { body: validCreatePayload() });
        expect(nextCalled).toBe(true);
        expect(req.validatedData.code).toBe('SAVE10');
        expect(req.validatedData.scopes).toEqual([]);
    });

    test('the 422 body carries the shared validation shape', async () => {
        const { res } = await runMiddleware(validateCreateVoucher, { body: { title: 'Valid title' } });
        expect(res.body.success).toBe(false);
        expect(res.body.data).toBeNull();
        expect(res.body.message).toBe('Validation failed');
        expect(Array.isArray(res.body.errors)).toBe(true);
        expect(typeof res.body.timestamp).toBe('string');
    });
});

describe('list query schema', () => {
    test('applies defaults', () => {
        const { error, value } = validate(voucherListQuerySchema, {});
        expect(error).toBeUndefined();
        expect(value).toEqual({ page: 1, limit: 20, include_stats: false, sort: 'created_at', direction: 'desc' });
    });

    test('parses a CSV status filter into an array', () => {
        const { error, value } = validate(voucherListQuerySchema, { status: 'draft, active' });
        expect(error).toBeUndefined();
        expect(value.status).toEqual(['draft', 'active']);
    });

    test('rejects an unknown status', () => {
        const { error } = validate(voucherListQuerySchema, { status: 'draft,nonsense' });
        expect(errorFields(error)).toContain('status');
    });

    test('caps limit at 100', () => {
        expect(errorFields(validate(voucherListQuerySchema, { limit: 101 }).error)).toContain('limit');
    });

    test('coerces include_stats from a query string', () => {
        expect(validate(voucherListQuerySchema, { include_stats: 'true' }).value.include_stats).toBe(true);
        expect(validate(voucherListQuerySchema, { include_stats: '0' }).value.include_stats).toBe(false);
    });

    test('rejects an unsupported sort column', () => {
        expect(errorFields(validate(voucherListQuerySchema, { sort: 'redeemed_count' }).error)).toContain('sort');
    });

    test('lands on req.validatedQuery', async () => {
        const { req, nextCalled } = await runMiddleware(validateVoucherListQuery, { query: { limit: '5' } });
        expect(nextCalled).toBe(true);
        expect(req.validatedQuery.limit).toBe(5);
    });
});

describe('voucher id param', () => {
    test('accepts a positive integer and coerces it from the path string', async () => {
        const { req, nextCalled } = await runMiddleware(validateVoucherIdParam, { params: { voucher_id: '42' } });
        expect(nextCalled).toBe(true);
        expect(req.validatedParams.voucher_id).toBe(42);
    });

    test.each(['0', '-1', 'abc'])('rejects %p', async (voucher_id) => {
        const { res } = await runMiddleware(validateVoucherIdParam, { params: { voucher_id } });
        expect(res.statusCode).toBe(422);
    });
});
