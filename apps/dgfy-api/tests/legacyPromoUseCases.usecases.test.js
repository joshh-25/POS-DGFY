// #2159 Legacy Promos read/revoke use cases.
//
// No database: both builders take `{ repository }`, so an in-memory fake stands in for
// legacyPromoRepository.js. The concurrent-checkout contract itself is exercised by the row-lock
// assertion plus the store/POS checkout suites that already pin `{ transaction, lock: true }` on
// the same setting rows; this file pins the revocation half of that protocol.

import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildListLegacyPromosUseCase,
    buildRevokeLegacyPromoUseCase
} from '../src/modules/vouchers/usecases/legacyPromoUseCases.js';

const pluralRow = (entries, extra = {}) => ({
    setting_key: 'storefront_promos',
    setting_value: JSON.stringify(entries),
    data_type: 'json',
    ...extra
});

const singularRow = (entry, extra = {}) => ({
    setting_key: 'storefront_promo',
    setting_value: JSON.stringify(entry),
    data_type: 'json',
    ...extra
});

const makeFakeRepository = (rows = {}) => {
    const state = {
        rows: { ...rows },
        calls: { updates: [], audits: [], commits: 0, rollbacks: 0, findSettingByKey: [] }
    };
    const transaction = {
        finished: false,
        LOCK: { UPDATE: 'UPDATE' },
        async commit() {
            transaction.finished = 'commit';
            state.calls.commits += 1;
        },
        async rollback() {
            transaction.finished = 'rollback';
            state.calls.rollbacks += 1;
        }
    };
    return {
        state,
        transaction,
        async beginTransaction() {
            return transaction;
        },
        async findSettingByKey(key, options = {}) {
            state.calls.findSettingByKey.push({ key, lock: Boolean(options.lock && options.transaction) });
            const row = state.rows[key];
            return row ? { ...row } : null;
        },
        async findSettingsByKeys(keys = []) {
            return keys.filter((key) => state.rows[key]).map((key) => ({ ...state.rows[key] }));
        },
        async updateSettingValueByKey(key, value, options = {}) {
            state.rows[key] = { ...state.rows[key], setting_value: JSON.stringify(value) };
            state.calls.updates.push({ key, value, options });
            return { ...state.rows[key] };
        },
        async createAuditLog(payload, options = {}) {
            state.calls.audits.push({ payload, options });
            return { log_id: state.calls.audits.length, ...payload };
        }
    };
};

const revokePayload = (overrides = {}) => ({
    source_key: 'storefront_promos',
    ...overrides
});

describe('#2159 list legacy promos', () => {
    test('lists plural and singular entries with server-derived effective state', async () => {
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([
                { id: 'p1', active: true, promo_code: 'SAVE10', title: '10% off', discount_percent: 10, usage_limit: 10, used_count: 10 },
                { id: 'p2', active: true, promo_code: 'REVOKED20', discount_percent: 20, revoked: true, revoked_at: '2026-09-30T00:00:00.000Z', revoked_by: 'owner' }
            ]),
            storefront_promo: singularRow({ active: true, promo_code: 'LEGACY30', discount_percent: 30 })
        });

        const result = await buildListLegacyPromosUseCase({ repository })();

        expect(result.success).toBe(true);
        expect(result.data.promos).toEqual([
            expect.objectContaining({ source_key: 'storefront_promos', source_index: 0, promo_code: 'SAVE10', effective_state: 'exhausted' }),
            expect.objectContaining({ source_key: 'storefront_promos', source_index: 1, promo_code: 'REVOKED20', effective_state: 'revoked', revoked_by: 'owner' }),
            expect.objectContaining({ source_key: 'storefront_promo', source_index: null, promo_code: 'LEGACY30', effective_state: 'available' })
        ]);
    });

    test('dedupes a singular compatibility entry shadowed by the same code in the plural array', async () => {
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([{ active: true, promo_code: 'SAVE10', discount_percent: 10 }]),
            storefront_promo: singularRow({ active: true, promo_code: 'SAVE10', discount_percent: 10 })
        });

        const result = await buildListLegacyPromosUseCase({ repository })();

        expect(result.data.promos).toHaveLength(1);
        expect(result.data.promos[0].source_key).toBe('storefront_promos');
    });

    test('returns an empty list when no legacy settings exist', async () => {
        const repository = makeFakeRepository({});

        const result = await buildListLegacyPromosUseCase({ repository })();

        expect(result.success).toBe(true);
        expect(result.data.promos).toEqual([]);
    });
});

describe('#2159 revoke legacy promo', () => {
    test('locks and re-reads the exact setting row, revokes one plural entry, and preserves counters, siblings, and shape', async () => {
        const sibling = { id: 'p2', active: true, promo_code: 'KEEP20', discount_percent: 20, usage_limit: 5, used_count: 2, custom_flag: 'kept' };
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([
                { id: 'p1', active: true, promo_code: 'SAVE10', discount_percent: 10, usage_limit: 30, used_count: 7, custom_flag: 'preserved' },
                sibling
            ]),
            storefront_hours: { setting_key: 'storefront_hours', setting_value: JSON.stringify({ timezone: 'Asia/Manila' }), data_type: 'json' }
        });
        const syncStorefrontDiscovery = jest.fn().mockResolvedValue({ ok: true });

        const useCase = buildRevokeLegacyPromoUseCase({ repository, syncStorefrontDiscovery });
        const result = await dbStore.run({ tenantId: 'tenant-9' }, () => useCase({
            payload: revokePayload({ promo_id: 'p1' }),
            actorUser: { user_id: 7, username: 'owner' }
        }));
        await Promise.resolve();

        expect(result.success).toBe(true);
        expect(result.data.idempotent_replay).toBe(false);
        expect(result.data.promo).toEqual(expect.objectContaining({
            promo_code: 'SAVE10',
            used_count: 7,
            effective_state: 'revoked',
            revoked_by: 'owner'
        }));

        expect(repository.state.calls.findSettingByKey[0]).toEqual({ key: 'storefront_promos', lock: true });
        expect(repository.state.calls.updates).toHaveLength(1);
        const updatedEntries = repository.state.calls.updates[0].value;
        expect(updatedEntries[0]).toEqual(expect.objectContaining({
            id: 'p1',
            promo_code: 'SAVE10',
            used_count: 7,
            custom_flag: 'preserved',
            revoked: true,
            revoked_by: 'owner'
        }));
        expect(updatedEntries[0].revoked_at).toEqual(expect.any(String));
        expect(updatedEntries[1]).toEqual(sibling);

        expect(repository.state.calls.audits).toHaveLength(1);
        expect(repository.state.calls.audits[0].payload).toEqual(expect.objectContaining({
            user_id: 7,
            actor_username: 'owner',
            entity_type: 'legacy_promo',
            action: 'UPDATE',
            event_type: 'legacy_promo.revoked',
            changes: expect.objectContaining({
                source_key: 'storefront_promos',
                promo_code: 'SAVE10',
                revoked_by: 'owner',
                previous: { active: true, used_count: 7 }
            })
        }));
        expect(repository.state.calls.audits[0].options.transaction).toBe(repository.transaction);
        expect(repository.state.calls.commits).toBe(1);
        expect(repository.state.calls.rollbacks).toBe(0);

        expect(syncStorefrontDiscovery).toHaveBeenCalledWith({ tenantId: 'tenant-9', source: 'legacy_promo_revoke' });
    });

    test('revokes the singular compatibility entry in place', async () => {
        const repository = makeFakeRepository({
            storefront_promo: singularRow({ active: true, promo_code: 'LEGACY30', discount_percent: 30, used_count: 3, title: 'Keep me' })
        });
        const useCase = buildRevokeLegacyPromoUseCase({ repository });

        const result = await useCase({
            payload: { source_key: 'storefront_promo', promo_code: 'legacy30' },
            actorUser: { user_id: 1, username: 'admin' }
        });

        expect(result.success).toBe(true);
        const updated = repository.state.calls.updates[0].value;
        expect(updated).toEqual(expect.objectContaining({
            promo_code: 'LEGACY30',
            used_count: 3,
            title: 'Keep me',
            revoked: true,
            revoked_by: 'admin'
        }));
        expect(repository.state.calls.audits).toHaveLength(1);
    });

    test('repeated revocation is an idempotent no-op with no counter change and no duplicate audit', async () => {
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([
                { id: 'p1', active: true, promo_code: 'SAVE10', discount_percent: 10, revoked: true, revoked_at: '2026-09-30T00:00:00.000Z', revoked_by: 'first' }
            ])
        });
        const useCase = buildRevokeLegacyPromoUseCase({ repository });

        const result = await useCase({
            payload: revokePayload({ promo_code: 'SAVE10' }),
            actorUser: { user_id: 9, username: 'second' }
        });

        expect(result.success).toBe(true);
        expect(result.data.idempotent_replay).toBe(true);
        expect(result.data.promo.revoked_by).toBe('first');
        expect(repository.state.calls.updates).toHaveLength(0);
        expect(repository.state.calls.audits).toHaveLength(0);
        expect(repository.state.calls.commits).toBe(1);
    });

    test('returns 404 without writing when the entry does not exist', async () => {
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([{ active: true, promo_code: 'SAVE10', discount_percent: 10 }])
        });
        const useCase = buildRevokeLegacyPromoUseCase({ repository });

        const result = await useCase({
            payload: revokePayload({ promo_code: 'NOPE' }),
            actorUser: { user_id: 1, username: 'admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
        expect(repository.state.calls.updates).toHaveLength(0);
        expect(repository.state.calls.rollbacks).toBe(1);
    });

    test('refuses to guess between duplicate codes without a disambiguator', async () => {
        const repository = makeFakeRepository({
            storefront_promos: pluralRow([
                { id: 'p1', active: true, promo_code: 'DUP10', discount_percent: 10 },
                { id: 'p2', active: true, promo_code: 'DUP10', discount_percent: 10 }
            ])
        });
        const useCase = buildRevokeLegacyPromoUseCase({ repository });

        const result = await useCase({
            payload: revokePayload({ promo_code: 'DUP10' }),
            actorUser: { user_id: 1, username: 'admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details.reason_code).toBe('LEGACY_PROMO_AMBIGUOUS');
        expect(repository.state.calls.updates).toHaveLength(0);

        const disambiguated = await useCase({
            payload: revokePayload({ promo_code: 'DUP10', source_index: 1 }),
            actorUser: { user_id: 1, username: 'admin' }
        });
        expect(disambiguated.success).toBe(true);
        expect(disambiguated.data.promo.source_index).toBe(1);
        expect(repository.state.calls.updates[0].value[0].revoked).toBeUndefined();
        expect(repository.state.calls.updates[0].value[1].revoked).toBe(true);
    });

    test('rejects an entry shielded by a different source key', async () => {
        const repository = makeFakeRepository({
            storefront_promo: singularRow({ active: true, promo_code: 'SINGLE10', discount_percent: 10 })
        });
        const useCase = buildRevokeLegacyPromoUseCase({ repository });

        const result = await useCase({
            payload: revokePayload({ promo_code: 'SINGLE10' }),
            actorUser: { user_id: 1, username: 'admin' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(repository.state.calls.updates).toHaveLength(0);
    });
});
