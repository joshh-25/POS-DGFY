// Use-case tests for src/modules/vouchers/usecases/voucherUseCases.js (Phase 103, #614).
//
// No database: every builder takes `{ repository }`, so a plain in-memory fake stands in for
// voucherRepository.js -- the same pattern as dgfyAffiliatePriceRuleUseCases.unit.test.js. The fake
// reproduces the two behaviors the real repository owns that the use cases depend on: the
// version-guarded conditional UPDATE (affected-row count, not a throw) and the `uq_vouchers_code`
// unique violation surfacing as a 409.

import {
    ALLOWED_STATUS_TRANSITIONS,
    buildActivateVoucherUseCase,
    buildArchiveVoucherUseCase,
    buildCreateVoucherUseCase,
    buildGetVoucherUseCase,
    buildListVouchersUseCase,
    buildPauseVoucherUseCase,
    buildUpdateVoucherUseCase
} from '../src/modules/vouchers/usecases/voucherUseCases.js';
import { voucherConflict, VoucherReasonCode } from '../src/modules/vouchers/domain/voucherErrors.js';

const NOW = new Date('2026-08-16T04:00:00Z'); // Sunday 12:00 Asia/Manila
const TIMEZONE = 'Asia/Manila';

const VOUCHER_DEFAULTS = {
    voucher_kind: 'promo_code',
    subtitle: null,
    badge: null,
    validity_text: null,
    percent_off_bps: null,
    amount_off_centavos: null,
    fixed_unit_price_centavos: null,
    max_discount_centavos: null,
    min_spend_centavos: null,
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
    redeemed_count: 0,
    redeemed_value_centavos: 0,
    redeemed_quantity: 0,
    conditions: null,
    // #788 (Phase 269): derived server-side from account_grant_ids, never client-writable.
    is_account_restricted: false,
    status: 'draft',
    version: 0
};

const seedVoucher = (overrides = {}) => ({ ...VOUCHER_DEFAULTS, ...overrides });

const makeFakeRepository = ({
    vouchers = [],
    scopes = [],
    // #788: [{ voucher_account_grant_id, voucher_id, dgfy_account_id }]
    accountGrants = [],
    itemIds = [1, 2, 3],
    folderIds = [10, 11],
    redemptions = {},
    skipCodePrecheck = false,
    forceUpdateMiss = false,
    // #696: { [pricelist_id]: 'draft' | 'active' | 'archived' }. Absent id => "does not exist".
    pricelistStatusById = {}
} = {}) => {
    const state = {
        vouchers: vouchers.map((voucher) => ({ ...voucher })),
        scopes: scopes.map((scope) => ({ ...scope })),
        accountGrants: accountGrants.map((grant) => ({ ...grant })),
        nextVoucherId: vouchers.reduce((max, v) => Math.max(max, v.voucher_id || 0), 0) + 1,
        nextScopeId: scopes.reduce((max, s) => Math.max(max, s.voucher_scope_id || 0), 0) + 1,
        nextGrantId: accountGrants.reduce((max, g) => Math.max(max, g.voucher_account_grant_id || 0), 0) + 1,
        calls: { markExpired: 0, getRedemptionStats: 0, replaceScopes: 0, replaceAccountGrants: 0, rollbacks: 0, commits: 0 }
    };

    const find = (voucherId) => state.vouchers.find((voucher) => voucher.voucher_id === Number(voucherId));

    const repository = {
        __state: state,

        async beginTransaction() {
            const transaction = {
                finished: false,
                LOCK: { UPDATE: 'UPDATE' },
                async commit() { this.finished = true; state.calls.commits += 1; },
                async rollback() { this.finished = true; state.calls.rollbacks += 1; }
            };
            return transaction;
        },

        async findById(voucherId) {
            const row = find(voucherId);
            return row ? { ...row } : null;
        },

        async findByCode(code) {
            if (skipCodePrecheck) return null;
            const row = state.vouchers.find((voucher) => voucher.code === String(code || '').toUpperCase());
            return row ? { ...row } : null;
        },

        async listVouchers(filters = {}, pagination = {}) {
            let rows = [...state.vouchers];
            if (Array.isArray(filters.status) && filters.status.length > 0) {
                rows = rows.filter((row) => filters.status.includes(row.status));
            }
            if (filters.benefit_class) rows = rows.filter((row) => row.benefit_class === filters.benefit_class);
            if (filters.search) {
                const needle = String(filters.search).toUpperCase();
                rows = rows.filter((row) => row.code.includes(needle) || String(row.title).toUpperCase().includes(needle));
            }
            const count = rows.length;
            const page = Number(pagination.page) || 1;
            const limit = Number(pagination.limit) || 20;
            return {
                rows: rows.slice((page - 1) * limit, page * limit).map((row) => ({ ...row })),
                count
            };
        },

        async createVoucher(values) {
            if (state.vouchers.some((voucher) => voucher.code === values.code)) {
                voucherConflict(
                    'A voucher with this code already exists.',
                    VoucherReasonCode.VOUCHER_CODE_ALREADY_EXISTS,
                    { code: values.code }
                );
            }
            const created = {
                ...VOUCHER_DEFAULTS,
                ...values,
                voucher_id: state.nextVoucherId,
                status: 'draft',
                version: 0
            };
            state.nextVoucherId += 1;
            state.vouchers.push(created);
            return { ...created };
        },

        async updateVoucherWithVersion(voucherId, values, expectedVersion) {
            if (forceUpdateMiss) return 0;
            const row = find(voucherId);
            if (!row || Number(row.version) !== Number(expectedVersion)) return 0;
            Object.assign(row, values, { version: Number(row.version) + 1 });
            return 1;
        },

        async markExpired(voucherIds) {
            state.calls.markExpired += 1;
            let affected = 0;
            voucherIds.forEach((voucherId) => {
                const row = find(voucherId);
                if (row && row.status === 'active') {
                    row.status = 'expired';
                    row.version = Number(row.version) + 1;
                    affected += 1;
                }
            });
            return affected;
        },

        async listScopes(voucherIds) {
            const ids = voucherIds.map(Number);
            return state.scopes
                .filter((scope) => ids.includes(Number(scope.voucher_id)))
                .map((scope) => ({ ...scope }));
        },

        // #788: mirrors the real repository's contract exactly -- a voucher with no rows is ABSENT
        // from the returned map rather than mapped to [], which is what lets a caller tell
        // "restricted with an empty allowlist" from "never queried".
        async listAccountGrants(voucherIds) {
            const ids = voucherIds.map(Number);
            return state.accountGrants
                .filter((grant) => ids.includes(Number(grant.voucher_id)))
                .reduce((accumulator, grant) => {
                    const voucherId = Number(grant.voucher_id);
                    if (!accumulator[voucherId]) accumulator[voucherId] = [];
                    accumulator[voucherId].push(String(grant.dgfy_account_id));
                    return accumulator;
                }, {});
        },

        async replaceAccountGrants(voucherId, accountIds = []) {
            state.calls.replaceAccountGrants += 1;
            state.accountGrants = state.accountGrants.filter((grant) => Number(grant.voucher_id) !== Number(voucherId));
            accountIds.forEach((accountId) => {
                state.accountGrants.push({
                    voucher_account_grant_id: state.nextGrantId,
                    voucher_id: Number(voucherId),
                    dgfy_account_id: String(accountId)
                });
                state.nextGrantId += 1;
            });
            return { deleted: 0, inserted: accountIds.length };
        },

        async assertScopeRefsExist(requested = []) {
            const missing = requested.filter((scope) => (
                scope.scope_type === 'item'
                    ? !itemIds.includes(Number(scope.scope_ref_id))
                    : !folderIds.includes(Number(scope.scope_ref_id))
            )).map((scope) => ({ scope_type: scope.scope_type, scope_ref_id: Number(scope.scope_ref_id) }));
            return { missing };
        },

        async replaceScopes(voucherId, requested = []) {
            state.calls.replaceScopes += 1;
            state.scopes = state.scopes.filter((scope) => Number(scope.voucher_id) !== Number(voucherId));
            requested.forEach((scope) => {
                state.scopes.push({
                    voucher_scope_id: state.nextScopeId,
                    voucher_id: Number(voucherId),
                    scope_type: scope.scope_type,
                    scope_ref_id: Number(scope.scope_ref_id)
                });
                state.nextScopeId += 1;
            });
            return { deleted: 0, inserted: requested.length };
        },

        async getRedemptionStats(voucherIds) {
            state.calls.getRedemptionStats += 1;
            return voucherIds.reduce((accumulator, voucherId) => {
                if (redemptions[voucherId]) accumulator[voucherId] = redemptions[voucherId];
                return accumulator;
            }, {});
        },

        async findPricelistStatus(pricelistId) {
            const status = pricelistStatusById[Number(pricelistId)];
            return status ? { pricelist_id: Number(pricelistId), status } : null;
        }
    };

    return repository;
};

const reasonCode = (result) => result.error?.details?.reason_code;
const statusCode = (result) => result.error?.statusCode;

// #1494: every existing test in this file predates the create/update actor requirement and calls
// the returned function with no `user` at all -- these two wrappers default it to a real actor so
// none of them have to be individually touched to add one. Tests that specifically exercise the
// missing-actor 401 (below) call `buildCreateVoucherUseCase`/`buildUpdateVoucherUseCase` directly,
// bypassing this default.
const DEFAULT_ACTOR = { user_id: 501 };
const buildCreate = (repository) => {
    const create = buildCreateVoucherUseCase({ repository });
    return (args = {}) => create({ user: DEFAULT_ACTOR, ...args });
};
const buildUpdate = (repository) => {
    const update = buildUpdateVoucherUseCase({ repository });
    return (args = {}) => update({ user: DEFAULT_ACTOR, ...args });
};

const percentOffPayload = (overrides = {}) => ({
    code: 'SAVE10',
    title: 'Ten percent off',
    benefit_class: 'percent_off',
    percent_off_bps: 1000,
    weekday_mask: 127,
    channels_mask: 1,
    fulfillment_methods_mask: 3,
    order_timings_mask: 3,
    ...overrides
});

describe('create voucher', () => {
    test('happy path persists the voucher and returns its derived status', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({ payload: percentOffPayload(), now: NOW, timezone: TIMEZONE });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE10');
        expect(result.data.voucher.status).toBe('draft');
        expect(result.data.voucher.derived_status).toBe('draft');
        expect(result.data.scopes).toEqual([]);
        expect(repository.__state.calls.commits).toBe(1);
    });

    test('normalizes the code to upper case before writing', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({ payload: percentOffPayload({ code: ' save10 ' }), now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE10');
    });

    test('nulls out benefit columns that do not belong to the chosen class', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: {
                code: 'FLAT50',
                title: 'Fifty pesos off',
                benefit_class: 'amount_off',
                amount_off_centavos: 5000,
                max_discount_centavos: 999
            },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.percent_off_bps).toBeNull();
        expect(result.data.voucher.fixed_unit_price_centavos).toBeNull();
        // A cap on an already-absolute amount is meaningless and is dropped rather than honored.
        expect(result.data.voucher.max_discount_centavos).toBeNull();
    });

    test('a duplicate code is a 409 CONFLICT, not a 422 — caught by the in-transaction pre-check', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({ voucher_id: 1, code: 'SAVE10', title: 'Existing', benefit_class: 'percent_off', percent_off_bps: 500 })]
        });
        const create = buildCreate(repository);

        const result = await create({ payload: percentOffPayload(), now: NOW });

        expect(result.success).toBe(false);
        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_ALREADY_EXISTS');
        expect(repository.__state.calls.rollbacks).toBe(1);
    });

    test('a duplicate code that slips past the pre-check still surfaces as 409 from the unique index', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({ voucher_id: 1, code: 'SAVE10', title: 'Existing', benefit_class: 'percent_off', percent_off_bps: 500 })],
            skipCodePrecheck: true
        });
        const create = buildCreate(repository);

        const result = await create({ payload: percentOffPayload(), now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_ALREADY_EXISTS');
    });

    test('a fixed_price voucher with no scopes is refused (#584)', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: {
                code: 'PIN8',
                title: 'Pinned at eight pesos',
                benefit_class: 'fixed_price',
                fixed_unit_price_centavos: 800,
                scopes: []
            },
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_FIXED_PRICE_REQUIRES_SCOPE');
        expect(repository.__state.vouchers).toHaveLength(0);
    });

    test('an unresolvable scope reference rolls the whole create back', async () => {
        const repository = makeFakeRepository({ itemIds: [1, 2, 3] });
        const create = buildCreate(repository);

        const result = await create({
            payload: percentOffPayload({ scopes: [{ scope_type: 'item', scope_ref_id: 999 }] }),
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_SCOPE_REF_NOT_FOUND');
        expect(result.error.details.missing).toEqual([{ scope_type: 'item', scope_ref_id: 999 }]);
        // Validated BEFORE the voucher row is written, so nothing is persisted and nothing is scoped.
        expect(repository.__state.vouchers).toHaveLength(0);
        expect(repository.__state.scopes).toHaveLength(0);
        expect(repository.__state.calls.rollbacks).toBe(1);
    });

    test('valid scopes are persisted alongside the voucher', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: {
                code: 'PIN8',
                title: 'Pinned at eight pesos',
                benefit_class: 'fixed_price',
                fixed_unit_price_centavos: 800,
                scopes: [{ scope_type: 'item', scope_ref_id: 1 }, { scope_type: 'item_folder', scope_ref_id: 10 }]
            },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.scopes).toHaveLength(2);
        expect(result.data.scopes.map((scope) => scope.scope_type)).toEqual(['item', 'item_folder']);
    });

    describe('#696 pricelist attachment', () => {
        const pricelistPayload = (overrides = {}) => ({
            code: 'WHOLESALE1',
            title: 'Wholesale pricelist',
            benefit_class: 'fixed_price',
            pricelist_id: 7,
            ...overrides
        });

        test('a fixed_price voucher with an attached pricelist needs no scopes', async () => {
            const repository = makeFakeRepository({ pricelistStatusById: { 7: 'active' } });
            const create = buildCreate(repository);

            const result = await create({ payload: pricelistPayload(), now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.pricelist_id).toBe(7);
            expect(result.data.voucher.fixed_unit_price_centavos).toBeNull();
            expect(result.data.scopes).toHaveLength(0);
        });

        test('carrying both fixed_unit_price_centavos and pricelist_id is refused', async () => {
            const repository = makeFakeRepository({ pricelistStatusById: { 7: 'active' } });
            const create = buildCreate(repository);

            const result = await create({
                payload: pricelistPayload({ fixed_unit_price_centavos: 500 }),
                now: NOW
            });

            expect(statusCode(result)).toBe(422);
            expect(reasonCode(result)).toBe('VOUCHER_PRICELIST_CONFLICT');
            expect(repository.__state.vouchers).toHaveLength(0);
        });

        test('a fixed_price voucher with a scope but neither a price nor a pricelist is refused', async () => {
            // A scope alone satisfies assertFixedPriceHasScope (checked first); this isolates
            // applyBenefitConfig's own "neither" branch rather than the scope-requirement check.
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({
                payload: {
                    code: 'PIN0',
                    title: 'No price',
                    benefit_class: 'fixed_price',
                    scopes: [{ scope_type: 'item', scope_ref_id: 1 }]
                },
                now: NOW
            });

            expect(statusCode(result)).toBe(422);
            expect(reasonCode(result)).toBe('VOUCHER_BENEFIT_CONFIG_INVALID');
        });

        test('a non-existent pricelist reference rolls the create back', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({ payload: pricelistPayload(), now: NOW });

            expect(statusCode(result)).toBe(422);
            expect(reasonCode(result)).toBe('VOUCHER_PRICELIST_REF_NOT_FOUND');
            expect(repository.__state.vouchers).toHaveLength(0);
            expect(repository.__state.calls.rollbacks).toBe(1);
        });

        test('a draft (unpublished) pricelist cannot be attached', async () => {
            const repository = makeFakeRepository({ pricelistStatusById: { 7: 'draft' } });
            const create = buildCreate(repository);

            const result = await create({ payload: pricelistPayload(), now: NOW });

            expect(statusCode(result)).toBe(422);
            expect(reasonCode(result)).toBe('VOUCHER_PRICELIST_NOT_ACTIVE');
        });

        test('an archived pricelist cannot be attached', async () => {
            const repository = makeFakeRepository({ pricelistStatusById: { 7: 'archived' } });
            const create = buildCreate(repository);

            const result = await create({ payload: pricelistPayload(), now: NOW });

            expect(statusCode(result)).toBe(422);
            expect(reasonCode(result)).toBe('VOUCHER_PRICELIST_NOT_ACTIVE');
        });

        test('switching benefit_class away from fixed_price clears a stale pricelist_id', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            // pricelist_id is silently irrelevant here since benefit_class is percent_off; the use
            // case must null it out rather than persist stale cross-class data.
            const result = await create({ payload: percentOffPayload({ pricelist_id: 7 }), now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.pricelist_id).toBeNull();
        });
    });

    test('an inconsistent benefit configuration is refused', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: { code: 'BADCFG', title: 'Broken', benefit_class: 'percent_off' },
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_BENEFIT_CONFIG_INVALID');
    });

    test('valid_until earlier than valid_from is refused', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: percentOffPayload({ valid_from: '2026-09-01', valid_until: '2026-08-01' }),
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_VALIDITY_WINDOW_INVALID');
    });

    // #1494: create requires an authenticated actor -- hard-fail 401 on a missing/invalid
    // user_id, matching deliveryRunUseCases.js's stricter behavior.
    test('a missing req.user is a 401, not a silently-null created_by', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({ payload: percentOffPayload(), now: NOW });

        expect(statusCode(result)).toBe(401);
        expect(reasonCode(result)).toBe('VOUCHER_ACTOR_REQUIRED');
        expect(repository.__state.vouchers).toHaveLength(0);
    });

    test('stamps created_by and updated_by from the authenticated actor', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({ payload: percentOffPayload(), user: { user_id: 42 }, now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.voucher.created_by).toBe(42);
        expect(result.data.voucher.updated_by).toBe(42);
    });

    // #1490: min_spend_centavos/max_order_value_centavos deadlock guard, checked against the
    // merged row (assertOrderValueRangeInvariant) -- distinct from the validator's own
    // same-request-only check (voucherValidator.test.js).
    test('max_order_value_centavos below min_spend_centavos is refused', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: percentOffPayload({ min_spend_centavos: 100000, max_order_value_centavos: 50000 }),
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_ORDER_VALUE_RANGE_INVALID');
    });

    test('max_order_value_centavos equal to min_spend_centavos is accepted', async () => {
        const repository = makeFakeRepository();
        const create = buildCreate(repository);

        const result = await create({
            payload: percentOffPayload({ min_spend_centavos: 100000, max_order_value_centavos: 100000 }),
            now: NOW
        });

        expect(result.success).toBe(true);
    });
});

describe('update voucher', () => {
    const seededRepository = (voucherOverrides = {}, options = {}) => makeFakeRepository({
        vouchers: [seedVoucher({
            voucher_id: 1,
            code: 'SAVE10',
            title: 'Ten percent off',
            benefit_class: 'percent_off',
            percent_off_bps: 1000,
            ...voucherOverrides
        })],
        ...options
    });

    test('happy path applies the patch and bumps the version', async () => {
        const repository = seededRepository();
        const update = buildUpdate(repository);

        const result = await update({
            voucherId: 1,
            payload: { version: 0, title: 'Renamed', min_spend_centavos: 50000 },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.title).toBe('Renamed');
        expect(result.data.voucher.min_spend_centavos).toBe(50000);
        expect(result.data.voucher.version).toBe(1);
    });

    test('a field the patch omits keeps its stored value', async () => {
        const repository = seededRepository({ weekday_mask: 65, channels_mask: 2 });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(result.data.voucher.weekday_mask).toBe(65);
        expect(result.data.voucher.channels_mask).toBe(2);
    });

    test('a stale version is a 409 version conflict', async () => {
        const repository = seededRepository({ version: 3 });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 2, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_VERSION_CONFLICT');
        expect(repository.__state.calls.rollbacks).toBe(1);
    });

    test('losing the race at the conditional UPDATE is also a 409, not a silent no-op', async () => {
        const repository = seededRepository({}, { forceUpdateMiss: true });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_VERSION_CONFLICT');
    });

    test('an unknown voucher is a 404', async () => {
        const repository = seededRepository();
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 999, payload: { version: 0, title: 'x' }, now: NOW });

        expect(statusCode(result)).toBe(404);
    });

    test('an archived voucher rejects every write with 409 VOUCHER_ARCHIVED_IMMUTABLE', async () => {
        const repository = seededRepository({ status: 'archived' });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_ARCHIVED_IMMUTABLE');
    });

    test('code is mutable while the voucher is a draft with no redemptions', async () => {
        const repository = seededRepository({ status: 'draft', redeemed_count: 0 });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'save20' }, now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE20');
    });

    test('code is immutable once the voucher has left draft', async () => {
        const repository = seededRepository({ status: 'active' });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'SAVE20' }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_IMMUTABLE');
    });

    test('code is immutable once the voucher has been redeemed, even as a draft', async () => {
        const repository = seededRepository({ status: 'draft', redeemed_count: 1 });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'SAVE20' }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_IMMUTABLE');
    });

    test('resending the SAME code on a locked voucher is not an immutability violation', async () => {
        const repository = seededRepository({ status: 'active' });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'save10', title: 'Renamed' }, now: NOW });

        expect(result.success).toBe(true);
    });

    test('stripping the last scope off a fixed_price voucher is refused', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({
                voucher_id: 1,
                code: 'PIN8',
                title: 'Pinned',
                benefit_class: 'fixed_price',
                fixed_unit_price_centavos: 800
            })],
            scopes: [{ voucher_scope_id: 1, voucher_id: 1, scope_type: 'item', scope_ref_id: 1 }]
        });
        const update = buildUpdate(repository);

        const result = await update({ voucherId: 1, payload: { version: 0, scopes: [] }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_FIXED_PRICE_REQUIRES_SCOPE');
        expect(repository.__state.scopes).toHaveLength(1);
    });

    test('an unresolvable scope reference on update rolls back before any scope write', async () => {
        const repository = seededRepository();
        const update = buildUpdate(repository);

        const result = await update({
            voucherId: 1,
            payload: { version: 0, scopes: [{ scope_type: 'item_folder', scope_ref_id: 77 }] },
            now: NOW
        });

        expect(reasonCode(result)).toBe('VOUCHER_SCOPE_REF_NOT_FOUND');
        expect(repository.__state.calls.replaceScopes).toBe(0);
    });

    test('changing benefit_class rewrites the whole benefit configuration', async () => {
        const repository = seededRepository();
        const update = buildUpdate(repository);

        const result = await update({
            voucherId: 1,
            payload: { version: 0, benefit_class: 'amount_off', amount_off_centavos: 2500 },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.benefit_class).toBe('amount_off');
        expect(result.data.voucher.amount_off_centavos).toBe(2500);
        expect(result.data.voucher.percent_off_bps).toBeNull();
    });

    test('server-owned counters in the payload are ignored, never written', async () => {
        const repository = seededRepository();
        const update = buildUpdate(repository);

        const result = await update({
            voucherId: 1,
            payload: { version: 0, title: 'Renamed', redeemed_count: 500, status: 'active' },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.redeemed_count).toBe(0);
        expect(result.data.voucher.status).toBe('draft');
    });

    // #1494: update requires an authenticated actor -- hard-fail 401, same as create.
    test('a missing req.user is a 401, not a silently-null updated_by', async () => {
        const repository = seededRepository();
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(401);
        expect(reasonCode(result)).toBe('VOUCHER_ACTOR_REQUIRED');
    });

    test('stamps updated_by from the authenticated actor, leaving created_by untouched', async () => {
        const repository = seededRepository({ created_by: 7 });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({
            voucherId: 1,
            payload: { version: 0, title: 'Renamed' },
            user: { user_id: 99 },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.created_by).toBe(7);
        expect(result.data.voucher.updated_by).toBe(99);
    });

    // #1490: checked against the *merged* row -- a PATCH sending only one of the two fields is
    // still caught against the stored value of the other.
    test('a PATCH that only sends max_order_value_centavos is checked against the stored min_spend_centavos', async () => {
        const repository = seededRepository({ min_spend_centavos: 100000 });
        const update = buildUpdate(repository);

        const result = await update({
            voucherId: 1,
            payload: { version: 0, max_order_value_centavos: 50000 },
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_ORDER_VALUE_RANGE_INVALID');
    });
});

describe('status transitions', () => {
    const makeRepository = (voucherOverrides = {}, scopes = []) => makeFakeRepository({
        vouchers: [seedVoucher({
            voucher_id: 1,
            code: 'SAVE10',
            title: 'Ten percent off',
            benefit_class: 'percent_off',
            percent_off_bps: 1000,
            ...voucherOverrides
        })],
        scopes
    });

    const runTransition = async (target, repository) => {
        const build = {
            active: buildActivateVoucherUseCase,
            paused: buildPauseVoucherUseCase,
            archived: buildArchiveVoucherUseCase
        }[target];
        return build({ repository })({ voucherId: 1, now: NOW, timezone: TIMEZONE });
    };

    test('the declared machine matches ADR 0066 lifecycle expectations', () => {
        expect(ALLOWED_STATUS_TRANSITIONS).toEqual({
            draft: ['active', 'archived'],
            active: ['paused', 'archived'],
            paused: ['active', 'archived'],
            expired: ['active', 'archived'],
            archived: []
        });
    });

    test.each([
        ['draft', 'active'],
        ['draft', 'archived'],
        ['active', 'paused'],
        ['active', 'archived'],
        ['paused', 'active'],
        ['paused', 'archived'],
        ['expired', 'archived']
    ])('%s -> %s is allowed', async (from, to) => {
        const repository = makeRepository({ status: from });
        const result = await runTransition(to, repository);

        expect(result.success).toBe(true);
        expect(result.data.voucher.status).toBe(to);
        expect(result.data.voucher.version).toBe(1);
    });

    test.each([
        ['draft', 'paused'],
        ['active', 'active'],
        ['paused', 'paused'],
        ['expired', 'paused']
    ])('%s -> %s is a 409 invalid transition naming the allowed set', async (from, to) => {
        const repository = makeRepository({ status: from });
        const result = await runTransition(to, repository);

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_INVALID_STATUS_TRANSITION');
        expect(result.error.details.from).toBe(from);
        expect(result.error.details.to).toBe(to);
        expect(result.error.details.allowed).toEqual([...ALLOWED_STATUS_TRANSITIONS[from]]);
    });

    test.each(['active', 'paused', 'archived'])('archived -> %s is 409 VOUCHER_ARCHIVED_IMMUTABLE, terminal', async (to) => {
        const repository = makeRepository({ status: 'archived' });
        const result = await runTransition(to, repository);

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_ARCHIVED_IMMUTABLE');
    });

    test('activating a fixed_price voucher whose last scope was stripped is refused', async () => {
        const repository = makeRepository({
            status: 'draft',
            benefit_class: 'fixed_price',
            percent_off_bps: null,
            fixed_unit_price_centavos: 800
        }, []);

        const result = await runTransition('active', repository);

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_FIXED_PRICE_REQUIRES_SCOPE');
    });

    test('activating a fixed_price voucher that still has a scope succeeds', async () => {
        const repository = makeRepository({
            status: 'draft',
            benefit_class: 'fixed_price',
            percent_off_bps: null,
            fixed_unit_price_centavos: 800
        }, [{ voucher_scope_id: 1, voucher_id: 1, scope_type: 'item', scope_ref_id: 1 }]);

        const result = await runTransition('active', repository);

        expect(result.success).toBe(true);
        expect(result.data.voucher.status).toBe('active');
    });

    test('activating past valid_until is refused with VOUCHER_VALIDITY_WINDOW_ELAPSED', async () => {
        const repository = makeRepository({ status: 'draft', valid_until: '2026-01-01' });
        const result = await runTransition('active', repository);

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_VALIDITY_WINDOW_ELAPSED');
    });

    test('an expired voucher can be reactivated once valid_until has been moved forward', async () => {
        const repository = makeRepository({ status: 'expired', valid_until: '2027-01-01' });
        const result = await runTransition('active', repository);

        expect(result.success).toBe(true);
        expect(result.data.voucher.status).toBe('active');
    });

    test('an active-but-elapsed voucher is materialized to expired before the transition is judged', async () => {
        const repository = makeRepository({ status: 'active', valid_until: '2026-01-01' });

        const result = await runTransition('paused', repository);

        expect(repository.__state.calls.markExpired).toBe(1);
        expect(repository.__state.vouchers[0].status).toBe('expired');
        // expired -> paused is not in the machine, so this is a 409 rather than a silent pause.
        expect(reasonCode(result)).toBe('VOUCHER_INVALID_STATUS_TRANSITION');
        expect(result.error.details.from).toBe('expired');
    });

    test('archiving an unknown voucher is a 404', async () => {
        const repository = makeRepository();
        const result = await buildArchiveVoucherUseCase({ repository })({ voucherId: 42, now: NOW });
        expect(statusCode(result)).toBe(404);
    });
});

describe('list vouchers', () => {
    const manyVouchers = () => Array.from({ length: 25 }, (_, index) => seedVoucher({
        voucher_id: index + 1,
        code: `CODE${index + 1}`,
        title: `Voucher ${index + 1}`,
        benefit_class: 'percent_off',
        percent_off_bps: 1000
    }));

    test('paginates and reports total pages', async () => {
        const repository = makeFakeRepository({ vouchers: manyVouchers() });
        const list = buildListVouchersUseCase({ repository });

        const result = await list({ query: { page: 2, limit: 10 }, now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.vouchers).toHaveLength(10);
        expect(result.data.pagination).toEqual({ page: 2, limit: 10, total: 25, total_pages: 3 });
    });

    test('does not query the ledger unless include_stats is requested', async () => {
        const repository = makeFakeRepository({ vouchers: manyVouchers() });
        const list = buildListVouchersUseCase({ repository });

        await list({ query: { page: 1, limit: 5 }, now: NOW });
        expect(repository.__state.calls.getRedemptionStats).toBe(0);

        await list({ query: { page: 1, limit: 5, include_stats: true }, now: NOW });
        expect(repository.__state.calls.getRedemptionStats).toBe(1);
    });

    test('lazily materializes expiry in one guarded UPDATE and reports the fresh status', async () => {
        const repository = makeFakeRepository({
            vouchers: [
                seedVoucher({ voucher_id: 1, code: 'OLD1', title: 'Elapsed', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'active', valid_until: '2026-01-01' }),
                seedVoucher({ voucher_id: 2, code: 'OLD2', title: 'Elapsed too', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'active', valid_until: '2026-02-01' }),
                seedVoucher({ voucher_id: 3, code: 'LIVE', title: 'Still live', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'active', valid_until: '2027-01-01' })
            ]
        });
        const list = buildListVouchersUseCase({ repository });

        const result = await list({ query: {}, now: NOW, timezone: TIMEZONE });

        expect(repository.__state.calls.markExpired).toBe(1);
        expect(result.data.vouchers.map((voucher) => voucher.status)).toEqual(['expired', 'expired', 'active']);
        expect(result.data.vouchers.map((voucher) => voucher.derived_status)).toEqual(['expired', 'expired', 'active']);
        expect(repository.__state.vouchers.map((voucher) => voucher.status)).toEqual(['expired', 'expired', 'active']);
    });

    test('does not issue an expiry UPDATE when nothing has elapsed', async () => {
        const repository = makeFakeRepository({ vouchers: manyVouchers() });
        const list = buildListVouchersUseCase({ repository });

        await list({ query: {}, now: NOW });

        expect(repository.__state.calls.markExpired).toBe(0);
    });

    test('applies status and search filters', async () => {
        const repository = makeFakeRepository({
            vouchers: [
                seedVoucher({ voucher_id: 1, code: 'ALPHA', title: 'Alpha', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'draft' }),
                seedVoucher({ voucher_id: 2, code: 'BETA', title: 'Beta', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'paused' })
            ]
        });
        const list = buildListVouchersUseCase({ repository });

        const byStatus = await list({ query: { status: ['paused'] }, now: NOW });
        expect(byStatus.data.vouchers.map((voucher) => voucher.code)).toEqual(['BETA']);

        const bySearch = await list({ query: { search: 'alph' }, now: NOW });
        expect(bySearch.data.vouchers.map((voucher) => voucher.code)).toEqual(['ALPHA']);
    });
});

describe('get voucher', () => {
    test('returns the voucher, its scopes, and reconciled redemption stats', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({
                voucher_id: 1,
                code: 'SAVE10',
                title: 'Ten percent off',
                benefit_class: 'percent_off',
                percent_off_bps: 1000,
                status: 'active',
                redeemed_count: 2,
                redeemed_value_centavos: 5000,
                redeemed_quantity: 4
            })],
            scopes: [{ voucher_scope_id: 1, voucher_id: 1, scope_type: 'item', scope_ref_id: 1 }],
            redemptions: {
                1: {
                    redemption_count: 2,
                    total_discount_centavos: 5000,
                    total_benefit_quantity: 4,
                    last_redeemed_at: '2026-08-10T02:00:00.000Z'
                }
            }
        });
        const get = buildGetVoucherUseCase({ repository });

        const result = await get({ voucherId: 1, now: NOW, timezone: TIMEZONE });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE10');
        expect(result.data.scopes).toEqual([
            { voucher_scope_id: 1, voucher_id: 1, scope_type: 'item', scope_ref_id: 1 }
        ]);
        expect(result.data.redemption_stats).toEqual({
            redemption_count: 2,
            total_discount_centavos: 5000,
            total_benefit_quantity: 4,
            last_redeemed_at: '2026-08-10T02:00:00.000Z',
            cached: { redeemed_count: 2, redeemed_value_centavos: 5000, redeemed_quantity: 4 },
            cache_in_sync: true
        });
    });

    test('reports cache_in_sync false when the cache disagrees with the ledger', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({
                voucher_id: 1,
                code: 'SAVE10',
                title: 'Ten percent off',
                benefit_class: 'percent_off',
                percent_off_bps: 1000,
                redeemed_count: 5
            })],
            redemptions: { 1: { redemption_count: 2, total_discount_centavos: 0, total_benefit_quantity: 0, last_redeemed_at: null } }
        });
        const get = buildGetVoucherUseCase({ repository });

        const result = await get({ voucherId: 1, now: NOW });

        expect(result.data.redemption_stats.cache_in_sync).toBe(false);
    });

    test('a voucher with no ledger rows reports zeroed stats rather than nulls', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({ voucher_id: 1, code: 'NEW', title: 'New', benefit_class: 'percent_off', percent_off_bps: 1000 })]
        });
        const get = buildGetVoucherUseCase({ repository });

        const result = await get({ voucherId: 1, now: NOW });

        expect(result.data.redemption_stats.redemption_count).toBe(0);
        expect(result.data.redemption_stats.last_redeemed_at).toBeNull();
        expect(result.data.redemption_stats.cache_in_sync).toBe(true);
    });

    test('lazily materializes expiry on a single get', async () => {
        const repository = makeFakeRepository({
            vouchers: [seedVoucher({ voucher_id: 1, code: 'OLD', title: 'Elapsed', benefit_class: 'percent_off', percent_off_bps: 1000, status: 'active', valid_until: '2026-01-01' })]
        });
        const get = buildGetVoucherUseCase({ repository });

        const result = await get({ voucherId: 1, now: NOW, timezone: TIMEZONE });

        expect(result.data.voucher.status).toBe('expired');
        expect(repository.__state.vouchers[0].status).toBe('expired');
    });

    test('an unknown voucher is a 404', async () => {
        const repository = makeFakeRepository();
        const get = buildGetVoucherUseCase({ repository });

        const result = await get({ voucherId: 99, now: NOW });

        expect(statusCode(result)).toBe(404);
        expect(result.error.details.reason_code).toBe('VOUCHER_NOT_FOUND');
    });
});

describe('failure mapping', () => {
    test('an unexpected repository error becomes a 500 INTERNAL_ERROR rather than leaking', async () => {
        const repository = makeFakeRepository();
        repository.listVouchers = async () => { throw new Error('connection lost'); };
        const list = buildListVouchersUseCase({ repository });

        const result = await list({ query: {}, now: NOW });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('INTERNAL_ERROR');
        expect(result.error.statusCode).toBe(500);
        expect(result.error.cause?.message).toBe('connection lost');
    });
});

// #788 (Phase 269): account-restricted issuance, authoring half.
//
// The property under test throughout is that `is_account_restricted` is DERIVED and can never
// disagree with the child rows -- a client cannot set it, an omitted key cannot clear it, and only
// an explicit empty array removes a restriction.
describe('account-restricted issuance (#788)', () => {
    const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
    const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

    describe('create', () => {
        test('grants persist and is_account_restricted is derived to true', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({
                payload: percentOffPayload({ account_grant_ids: [ACCOUNT_A, ACCOUNT_B] }),
                now: NOW
            });

            expect(result.success).toBe(true);
            expect(result.data.voucher.is_account_restricted).toBe(true);
            expect(result.data.account_grant_ids).toEqual([ACCOUNT_A, ACCOUNT_B]);
        });

        test('no grants means an unrestricted voucher and no child-table write at all', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({ payload: percentOffPayload(), now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.is_account_restricted).toBe(false);
            expect(result.data.account_grant_ids).toEqual([]);
            expect(repository.__state.calls.replaceAccountGrants).toBe(0);
        });

        test('duplicate and mixed-case ids collapse to one normalized grant', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({
                payload: percentOffPayload({ account_grant_ids: [ACCOUNT_A, ACCOUNT_A.toUpperCase(), ` ${ACCOUNT_A} `] }),
                now: NOW
            });

            expect(result.data.account_grant_ids).toEqual([ACCOUNT_A]);
        });

        test('account-restricted + publicly listed is refused, not silently coerced', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({
                payload: percentOffPayload({ account_grant_ids: [ACCOUNT_A], is_publicly_listed: true }),
                now: NOW
            });

            expect(result.success).toBe(false);
            expect(reasonCode(result)).toBe('VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE');
            expect(statusCode(result)).toBe(422);
            // Nothing was written, and -- like every other pre-transaction assert in create -- the
            // guard fires before `beginTransaction`, so there is no transaction to roll back.
            expect(repository.__state.vouchers).toHaveLength(0);
            expect(repository.__state.calls.commits).toBe(0);
            expect(repository.__state.calls.rollbacks).toBe(0);
        });

        test('publicly listed WITHOUT a restriction is still allowed', async () => {
            const repository = makeFakeRepository();
            const create = buildCreate(repository);

            const result = await create({ payload: percentOffPayload({ is_publicly_listed: true }), now: NOW });

            expect(result.success).toBe(true);
        });
    });

    describe('update', () => {
        const seedRestricted = () => makeFakeRepository({
            vouchers: [seedVoucher({
                voucher_id: 1,
                code: 'B2BONLY',
                title: 'B2B only',
                benefit_class: 'percent_off',
                percent_off_bps: 1000,
                is_account_restricted: true,
                status: 'active',
                version: 3
            })],
            accountGrants: [{ voucher_account_grant_id: 1, voucher_id: 1, dgfy_account_id: ACCOUNT_A }]
        });

        test('an OMITTED account_grant_ids leaves the allowlist and the flag untouched', async () => {
            const repository = seedRestricted();
            const update = buildUpdate(repository);

            const result = await update({ voucherId: 1, payload: { version: 3, title: 'Renamed' }, now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.is_account_restricted).toBe(true);
            expect(result.data.account_grant_ids).toEqual([ACCOUNT_A]);
            expect(repository.__state.calls.replaceAccountGrants).toBe(0);
        });

        test('an EXPLICIT empty array removes the restriction and every grant', async () => {
            const repository = seedRestricted();
            const update = buildUpdate(repository);

            const result = await update({ voucherId: 1, payload: { version: 3, account_grant_ids: [] }, now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.is_account_restricted).toBe(false);
            expect(result.data.account_grant_ids).toEqual([]);
            expect(repository.__state.accountGrants).toHaveLength(0);
        });

        test('replacing the allowlist swaps the grants and keeps the flag set', async () => {
            const repository = seedRestricted();
            const update = buildUpdate(repository);

            const result = await update({ voucherId: 1, payload: { version: 3, account_grant_ids: [ACCOUNT_B] }, now: NOW });

            expect(result.data.voucher.is_account_restricted).toBe(true);
            expect(result.data.account_grant_ids).toEqual([ACCOUNT_B]);
        });

        test('adding a restriction to a voucher that is already publicly listed is refused', async () => {
            const repository = makeFakeRepository({
                vouchers: [seedVoucher({
                    voucher_id: 1,
                    code: 'PUBLIC',
                    title: 'Public',
                    benefit_class: 'percent_off',
                    percent_off_bps: 1000,
                    is_publicly_listed: true,
                    status: 'active',
                    version: 0
                })]
            });
            const update = buildUpdate(repository);

            const result = await update({ voucherId: 1, payload: { version: 0, account_grant_ids: [ACCOUNT_A] }, now: NOW });

            expect(result.success).toBe(false);
            expect(reasonCode(result)).toBe('VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE');
        });

        test('turning ON public listing for an already-restricted voucher is refused too (the other direction)', async () => {
            const repository = seedRestricted();
            const update = buildUpdate(repository);

            // account_grant_ids omitted -- the guard must read the STORED allowlist, not just the
            // payload, or this direction slips through.
            const result = await update({ voucherId: 1, payload: { version: 3, is_publicly_listed: true }, now: NOW });

            expect(result.success).toBe(false);
            expect(reasonCode(result)).toBe('VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE');
        });

        test('a normal update self-heals a flag that disagrees with the child rows', async () => {
            // A row whose flag says "unrestricted" while grants exist would be an unenforced
            // restriction. Not reachable through this use case, but the write is unconditional
            // precisely so it repairs rather than perpetuates such a row.
            const repository = makeFakeRepository({
                vouchers: [seedVoucher({
                    voucher_id: 1,
                    code: 'DRIFT',
                    title: 'Drifted',
                    benefit_class: 'percent_off',
                    percent_off_bps: 1000,
                    is_account_restricted: false,
                    status: 'active',
                    version: 0
                })],
                accountGrants: [{ voucher_account_grant_id: 1, voucher_id: 1, dgfy_account_id: ACCOUNT_A }]
            });
            const update = buildUpdate(repository);

            const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.voucher.is_account_restricted).toBe(true);
        });
    });

    describe('get and activate', () => {
        test('GET returns the allowlist alongside scopes', async () => {
            const repository = makeFakeRepository({
                vouchers: [seedVoucher({ voucher_id: 1, code: 'B2BONLY', title: 'B2B', benefit_class: 'percent_off', percent_off_bps: 1000, is_account_restricted: true })],
                accountGrants: [{ voucher_account_grant_id: 1, voucher_id: 1, dgfy_account_id: ACCOUNT_A }]
            });

            const result = await buildGetVoucherUseCase({ repository })({ voucherId: 1, now: NOW });

            expect(result.success).toBe(true);
            expect(result.data.account_grant_ids).toEqual([ACCOUNT_A]);
        });

        test('GET on an unrestricted voucher returns an empty allowlist, never undefined', async () => {
            const repository = makeFakeRepository({
                vouchers: [seedVoucher({ voucher_id: 1, code: 'OPEN', title: 'Open', benefit_class: 'percent_off', percent_off_bps: 1000 })]
            });

            const result = await buildGetVoucherUseCase({ repository })({ voucherId: 1, now: NOW });

            expect(result.data.account_grant_ids).toEqual([]);
        });

        test('activation re-checks the restricted/publicly-listed conflict on a drifted draft', async () => {
            const repository = makeFakeRepository({
                vouchers: [seedVoucher({
                    voucher_id: 1,
                    code: 'BADCOMBO',
                    title: 'Bad combo',
                    benefit_class: 'percent_off',
                    percent_off_bps: 1000,
                    is_account_restricted: true,
                    is_publicly_listed: true,
                    status: 'draft',
                    version: 0
                })],
                accountGrants: [{ voucher_account_grant_id: 1, voucher_id: 1, dgfy_account_id: ACCOUNT_A }]
            });

            const result = await buildActivateVoucherUseCase({ repository })({ voucherId: 1, now: NOW });

            expect(result.success).toBe(false);
            expect(reasonCode(result)).toBe('VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE');
        });
    });
});
