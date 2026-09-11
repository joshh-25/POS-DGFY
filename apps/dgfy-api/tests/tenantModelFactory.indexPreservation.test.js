/**
 * PR #1830 review, RF-7 — regression coverage for the tenantModelFactory index-dedup fix
 * (issue #1825, corrected per RF-1).
 *
 * Root cause: on the landlord connection, Sequelize's define() normalizes any column-level
 * `unique: true` into a synthesized single-column entry in `options.indexes`. getTenantModels
 * cloned that entry alongside `rawAttributes` (which still carries the same `unique: true`) onto
 * every fresh tenant connection, so Sequelize processed the same unique constraint twice —
 * emitting duplicate indexes (e.g. `username`/`username_2`) on every newly provisioned tenant.
 *
 * The first version of this fix stripped `options.indexes` wholesale, which also silently
 * dropped every genuinely hand-authored composite/explicit index (Item, Employee, StoreCustomer,
 * PosPaymentSession, and others all declare their own `indexes: [...]` block — none of it
 * Sequelize-synthesized, most of it not duplicating anything in `rawAttributes`). This test
 * exercises the real landlord model definitions (no live DB needed — Sequelize's own `.define()`
 * call performs no I/O) against a fake tenant connection whose `.define()` just records what it
 * was called with, so the assertions are against real model shapes, not a hand-rolled fixture
 * that could drift from the actual models.
 */

import { jest } from '@jest/globals';

const { getTenantModels } = await import('../src/utils/tenantModelFactory.js');

const buildRecordingSequelize = () => {
    const recorded = {};
    const fakeSequelize = {
        models: {},
        define: jest.fn((name, attributes, options) => {
            // addHook/hasMany/hasOne/belongsTo/belongsToMany are no-ops here -- this test is
            // only about the options/indexes shape passed to define() (Part A/D), not hook
            // re-application or association re-mapping (Part A/B, already covered elsewhere by
            // the fact that every existing provisioning test exercises the real getTenantModels
            // against a real Sequelize instance without issue).
            const definedModel = {
                name,
                rawAttributes: attributes,
                options,
                addHook: () => {},
                hasMany: () => {},
                hasOne: () => {},
                belongsTo: () => {},
                belongsToMany: () => {}
            };
            recorded[name] = definedModel;
            fakeSequelize.models[name] = definedModel;
            return definedModel;
        })
    };
    return { fakeSequelize, recorded };
};

describe('tenantModelFactory — index preservation (issue #1825, RF-1)', () => {
    test('drops only the synthesized single-column unique duplicate on User (username/email/invitation_token)', () => {
        const { fakeSequelize, recorded } = buildRecordingSequelize();
        getTenantModels(fakeSequelize);

        const userIndexes = recorded.User?.options?.indexes;
        // Either no indexes survive (User has no genuinely explicit indexes: block — confirmed
        // by reading User.js — everything there was the synthesized duplicate this fix removes)
        // or, if present, none of them may be a single-column unique entry duplicating a
        // rawAttributes unique column.
        if (Array.isArray(userIndexes)) {
            const duplicatedSingleColumnUniques = userIndexes.filter((index) => (
                index?.unique === true
                && Array.isArray(index.fields)
                && index.fields.length === 1
                && recorded.User.rawAttributes?.[index.fields[0]]?.unique === true
            ));
            expect(duplicatedSingleColumnUniques).toHaveLength(0);
        }
    });

    test('preserves every explicit index declared on Item (non-unique, no rawAttributes duplication)', () => {
        const { fakeSequelize, recorded } = buildRecordingSequelize();
        getTenantModels(fakeSequelize);

        // Item.js declares indexes: [{fields:['sku_code']}, {fields:['category']},
        // {fields:['mode_item_preset']}, {fields:['folder_id']}, {fields:['deleted_at']},
        // {fields:['status']}] — none unique, none Sequelize-synthesized. All 6 must survive
        // untouched; this is exactly what the wholesale-strip version of the fix broke (6 -> 0).
        expect(Array.isArray(recorded.Item?.options?.indexes)).toBe(true);
        expect(recorded.Item.options.indexes).toHaveLength(6);
        const fieldSets = recorded.Item.options.indexes.map((index) => index.fields.join(','));
        expect(fieldSets).toEqual(
            expect.arrayContaining(['sku_code', 'category', 'mode_item_preset', 'folder_id', 'deleted_at', 'status'])
        );
    });

    test('preserves StoreCustomer\'s non-unique explicit indexes while still deduping its own duplicate unique(email)', () => {
        const { fakeSequelize, recorded } = buildRecordingSequelize();
        getTenantModels(fakeSequelize);

        // StoreCustomer.js declares three explicit indexes: {fields:['email'], unique:true} (a
        // genuine duplicate of email's own column-level unique:true — correctly dropped),
        // {fields:['dgfy_account_id']}, and {fields:['is_active']} (both non-unique — must survive).
        const indexes = recorded.StoreCustomer?.options?.indexes || [];
        const fieldSets = indexes.map((index) => index.fields.join(','));
        expect(fieldSets).toEqual(expect.arrayContaining(['dgfy_account_id', 'is_active']));
        expect(fieldSets).not.toContain('email');
    });

    test('uniqueKeys is always stripped (Sequelize-synthesized only, regenerated by define() itself)', () => {
        const { fakeSequelize, recorded } = buildRecordingSequelize();
        getTenantModels(fakeSequelize);

        expect(recorded.User?.options?.uniqueKeys).toBeUndefined();
        expect(recorded.Item?.options?.uniqueKeys).toBeUndefined();
    });
});
