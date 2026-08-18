// Direct tests for src/validators/pricelistValidator.js (#696). Conventions and structure mirror
// voucherValidator.test.js.

import { __testables, validateReplacePricelistItems, validateUpdatePricelist } from '../src/validators/pricelistValidator.js';

const { createPricelistSchema, replacePricelistItemsSchema, updatePricelistSchema } = __testables;

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

describe('create schema', () => {
    test('name is required', () => {
        const { error } = validate(createPricelistSchema, {});
        expect(errorFields(error)).toContain('name');
    });

    test('server-owned fields are refused, not stripped', () => {
        for (const field of ['pricelist_id', 'status', 'draft_of_pricelist_id']) {
            const { error } = validate(createPricelistSchema, { name: 'Wholesale', [field]: 1 });
            expect(errorFields(error)).toContain(field);
        }
    });

    test('a valid create with copy_from_pricelist_id passes', () => {
        const { error, value } = validate(createPricelistSchema, { name: 'Wholesale', copy_from_pricelist_id: 5 });
        expect(error).toBeUndefined();
        expect(value.copy_from_pricelist_id).toBe(5);
    });
});

describe('update schema', () => {
    test('version is required', () => {
        const { error } = validate(updatePricelistSchema, { name: 'Renamed' });
        expect(errorFields(error)).toContain('version');
    });

    test('version alone with no other field is rejected', () => {
        const { error } = validate(updatePricelistSchema, { version: 0 });
        expect(error).toBeDefined();
    });

    test('a valid patch passes', async () => {
        const { nextCalled, req } = await runMiddleware(validateUpdatePricelist, {
            body: { version: 0, name: 'Renamed' }
        });
        expect(nextCalled).toBe(true);
        expect(req.validatedData.name).toBe('Renamed');
    });
});

describe('replace items schema', () => {
    test('items is required', () => {
        const { error } = validate(replacePricelistItemsSchema, {});
        expect(errorFields(error)).toContain('items');
    });

    test('duplicate item_id entries are rejected', () => {
        const { error } = validate(replacePricelistItemsSchema, {
            items: [
                { item_id: 1, unit_price_centavos: 500 },
                { item_id: 1, unit_price_centavos: 400 }
            ]
        });
        expect(error).toBeDefined();
    });

    test('is_manual_override defaults to false and version is optional', async () => {
        const { nextCalled, req } = await runMiddleware(validateReplacePricelistItems, {
            body: { items: [{ item_id: 1, unit_price_centavos: 500 }] }
        });
        expect(nextCalled).toBe(true);
        expect(req.validatedData.items[0].is_manual_override).toBe(false);
        expect(req.validatedData.version).toBeUndefined();
    });

    test('a negative price is rejected', () => {
        const { error } = validate(replacePricelistItemsSchema, {
            items: [{ item_id: 1, unit_price_centavos: -1 }]
        });
        expect(error).toBeDefined();
    });

    test('more than 2000 items is rejected', () => {
        const items = Array.from({ length: 2001 }, (_, index) => ({ item_id: index + 1, unit_price_centavos: 100 }));
        const { error } = validate(replacePricelistItemsSchema, { items });
        expect(error).toBeDefined();
    });
});
