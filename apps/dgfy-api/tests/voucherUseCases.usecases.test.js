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
    status: 'draft',
    version: 0
};

const seedVoucher = (overrides = {}) => ({ ...VOUCHER_DEFAULTS, ...overrides });

const makeFakeRepository = ({
    vouchers = [],
    scopes = [],
    itemIds = [1, 2, 3],
    folderIds = [10, 11],
    redemptions = {},
    skipCodePrecheck = false,
    forceUpdateMiss = false
} = {}) => {
    const state = {
        vouchers: vouchers.map((voucher) => ({ ...voucher })),
        scopes: scopes.map((scope) => ({ ...scope })),
        nextVoucherId: vouchers.reduce((max, v) => Math.max(max, v.voucher_id || 0), 0) + 1,
        nextScopeId: scopes.reduce((max, s) => Math.max(max, s.voucher_scope_id || 0), 0) + 1,
        calls: { markExpired: 0, getRedemptionStats: 0, replaceScopes: 0, rollbacks: 0, commits: 0 }
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
        }
    };

    return repository;
};

const reasonCode = (result) => result.error?.details?.reason_code;
const statusCode = (result) => result.error?.statusCode;

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
        const create = buildCreateVoucherUseCase({ repository });

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
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({ payload: percentOffPayload({ code: ' save10 ' }), now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE10');
    });

    test('nulls out benefit columns that do not belong to the chosen class', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

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
        const create = buildCreateVoucherUseCase({ repository });

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
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({ payload: percentOffPayload(), now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_ALREADY_EXISTS');
    });

    test('a fixed_price voucher with no scopes is refused (#584)', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

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
        const create = buildCreateVoucherUseCase({ repository });

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
        const create = buildCreateVoucherUseCase({ repository });

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

    test('an inconsistent benefit configuration is refused', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({
            payload: { code: 'BADCFG', title: 'Broken', benefit_class: 'percent_off' },
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_BENEFIT_CONFIG_INVALID');
    });

    test('valid_until earlier than valid_from is refused', async () => {
        const repository = makeFakeRepository();
        const create = buildCreateVoucherUseCase({ repository });

        const result = await create({
            payload: percentOffPayload({ valid_from: '2026-09-01', valid_until: '2026-08-01' }),
            now: NOW
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_VALIDITY_WINDOW_INVALID');
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
        const update = buildUpdateVoucherUseCase({ repository });

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
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(result.data.voucher.weekday_mask).toBe(65);
        expect(result.data.voucher.channels_mask).toBe(2);
    });

    test('a stale version is a 409 version conflict', async () => {
        const repository = seededRepository({ version: 3 });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 2, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_VERSION_CONFLICT');
        expect(repository.__state.calls.rollbacks).toBe(1);
    });

    test('losing the race at the conditional UPDATE is also a 409, not a silent no-op', async () => {
        const repository = seededRepository({}, { forceUpdateMiss: true });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_VERSION_CONFLICT');
    });

    test('an unknown voucher is a 404', async () => {
        const repository = seededRepository();
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 999, payload: { version: 0, title: 'x' }, now: NOW });

        expect(statusCode(result)).toBe(404);
    });

    test('an archived voucher rejects every write with 409 VOUCHER_ARCHIVED_IMMUTABLE', async () => {
        const repository = seededRepository({ status: 'archived' });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, title: 'Renamed' }, now: NOW });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('VOUCHER_ARCHIVED_IMMUTABLE');
    });

    test('code is mutable while the voucher is a draft with no redemptions', async () => {
        const repository = seededRepository({ status: 'draft', redeemed_count: 0 });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'save20' }, now: NOW });

        expect(result.success).toBe(true);
        expect(result.data.voucher.code).toBe('SAVE20');
    });

    test('code is immutable once the voucher has left draft', async () => {
        const repository = seededRepository({ status: 'active' });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'SAVE20' }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_IMMUTABLE');
    });

    test('code is immutable once the voucher has been redeemed, even as a draft', async () => {
        const repository = seededRepository({ status: 'draft', redeemed_count: 1 });
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, code: 'SAVE20' }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_CODE_IMMUTABLE');
    });

    test('resending the SAME code on a locked voucher is not an immutability violation', async () => {
        const repository = seededRepository({ status: 'active' });
        const update = buildUpdateVoucherUseCase({ repository });

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
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({ voucherId: 1, payload: { version: 0, scopes: [] }, now: NOW });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('VOUCHER_FIXED_PRICE_REQUIRES_SCOPE');
        expect(repository.__state.scopes).toHaveLength(1);
    });

    test('an unresolvable scope reference on update rolls back before any scope write', async () => {
        const repository = seededRepository();
        const update = buildUpdateVoucherUseCase({ repository });

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
        const update = buildUpdateVoucherUseCase({ repository });

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
        const update = buildUpdateVoucherUseCase({ repository });

        const result = await update({
            voucherId: 1,
            payload: { version: 0, title: 'Renamed', redeemed_count: 500, status: 'active' },
            now: NOW
        });

        expect(result.success).toBe(true);
        expect(result.data.voucher.redeemed_count).toBe(0);
        expect(result.data.voucher.status).toBe('draft');
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
