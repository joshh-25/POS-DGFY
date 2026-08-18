// Use-case tests for src/modules/vouchers/usecases/pricelistUseCases.js (#696).
//
// No database: `repository` is a plain in-memory fake, same pattern as voucherUseCases.usecases.test.js.
// The fake reproduces the real repository's version-guarded conditional UPDATE (affected-row count,
// not a throw) so the version-conflict tests exercise the same branch logic the use cases use.

import {
    buildArchivePricelistUseCase,
    buildCreatePricelistUseCase,
    buildGetPricelistUseCase,
    buildListPricelistsUseCase,
    buildPublishPricelistUseCase,
    buildReplacePricelistItemsUseCase,
    buildUpdatePricelistUseCase
} from '../src/modules/vouchers/usecases/pricelistUseCases.js';
import { VoucherReasonCode } from '../src/modules/vouchers/domain/voucherErrors.js';

const seedPricelist = (overrides = {}) => ({
    pricelist_id: 1,
    name: 'Wholesale',
    description: null,
    status: 'draft',
    draft_of_pricelist_id: null,
    version: 0,
    ...overrides
});

const makeFakeRepository = ({ pricelists = [], items = [], itemIds = [1, 2, 3], vouchersByPricelistId = {} } = {}) => {
    const state = {
        pricelists: pricelists.map((p) => ({ ...p })),
        items: items.map((i) => ({ ...i })), // { pricelist_item_id, pricelist_id, item_id, unit_price_centavos, is_manual_override }
        nextPricelistId: pricelists.reduce((max, p) => Math.max(max, p.pricelist_id || 0), 0) + 1,
        nextItemId: items.reduce((max, i) => Math.max(max, i.pricelist_item_id || 0), 0) + 1,
        calls: { commits: 0, rollbacks: 0 }
    };

    const find = (id) => state.pricelists.find((p) => p.pricelist_id === Number(id));

    const repository = {
        __state: state,

        async beginTransaction() {
            return {
                finished: false,
                LOCK: { UPDATE: 'UPDATE' },
                async commit() { this.finished = true; state.calls.commits += 1; },
                async rollback() { this.finished = true; state.calls.rollbacks += 1; }
            };
        },

        async findById(id) {
            const row = find(id);
            return row ? { ...row } : null;
        },

        async findDraftOfPublished(publishedId) {
            const row = state.pricelists.find((p) => Number(p.draft_of_pricelist_id) === Number(publishedId));
            return row ? { ...row } : null;
        },

        async listPricelists(filters = {}, pagination = {}) {
            let rows = state.pricelists.filter((p) => filters.excludeDraftRevisions === false || p.draft_of_pricelist_id == null);
            if (Array.isArray(filters.status) && filters.status.length > 0) {
                rows = rows.filter((p) => filters.status.includes(p.status));
            }
            const count = rows.length;
            const page = Number(pagination.page) || 1;
            const limit = Number(pagination.limit) || 20;
            return { rows: rows.slice((page - 1) * limit, page * limit).map((p) => ({ ...p })), count };
        },

        async createPricelist(values) {
            const created = {
                name: values.name,
                description: values.description ?? null,
                status: values.status || 'draft',
                draft_of_pricelist_id: values.draft_of_pricelist_id ?? null,
                pricelist_id: state.nextPricelistId,
                version: 0
            };
            state.nextPricelistId += 1;
            state.pricelists.push(created);
            return { ...created };
        },

        async updatePricelistWithVersion(id, values, expectedVersion) {
            const row = find(id);
            if (!row || Number(row.version) !== Number(expectedVersion)) return 0;
            Object.assign(row, values, { version: Number(row.version) + 1 });
            return 1;
        },

        async listPricelistItems(pricelistId) {
            return state.items.filter((i) => Number(i.pricelist_id) === Number(pricelistId)).map((i) => ({ ...i }));
        },

        async assertItemRefsExist(requestedItemIds = []) {
            const missing = requestedItemIds.filter((id) => !itemIds.includes(Number(id)));
            return { missing };
        },

        async replacePricelistItems(pricelistId, desiredItems = []) {
            state.items = state.items.filter((i) => Number(i.pricelist_id) !== Number(pricelistId));
            desiredItems.forEach((item) => {
                state.items.push({
                    pricelist_item_id: state.nextItemId,
                    pricelist_id: Number(pricelistId),
                    item_id: Number(item.item_id),
                    unit_price_centavos: Number(item.unit_price_centavos),
                    is_manual_override: item.is_manual_override === true
                });
                state.nextItemId += 1;
            });
            return { deleted: 0, inserted: desiredItems.length, updated: 0 };
        },

        async publishDraftIntoParent(draftId, parentId) {
            const draftItems = state.items.filter((i) => Number(i.pricelist_id) === Number(draftId));
            await repository.replacePricelistItems(parentId, draftItems);
            const parent = find(parentId);
            Object.assign(parent, { status: 'active', version: Number(parent.version) + 1 });
            state.pricelists = state.pricelists.filter((p) => Number(p.pricelist_id) !== Number(draftId));
            state.items = state.items.filter((i) => Number(i.pricelist_id) !== Number(draftId));
            return { ...parent };
        },

        async countVouchersUsingPricelist(pricelistId) {
            return vouchersByPricelistId[Number(pricelistId)] || 0;
        }
    };

    return repository;
};

const reasonCode = (result) => result.error?.details?.reason_code;
const statusCode = (result) => result.error?.statusCode;

describe('create pricelist', () => {
    test('happy path persists a draft pricelist with no items', async () => {
        const repository = makeFakeRepository();
        const create = buildCreatePricelistUseCase({ repository });

        const result = await create({ payload: { name: 'Wholesale' } });

        expect(result.success).toBe(true);
        expect(result.data.pricelist.status).toBe('draft');
        expect(result.data.items).toEqual([]);
    });

    test('copy_from_pricelist_id duplicates rows into the new pricelist, not a live link', async () => {
        const repository = makeFakeRepository({
            pricelists: [seedPricelist({ pricelist_id: 5, status: 'active' })],
            items: [{ pricelist_item_id: 1, pricelist_id: 5, item_id: 1, unit_price_centavos: 500, is_manual_override: true }]
        });
        const create = buildCreatePricelistUseCase({ repository });

        const result = await create({ payload: { name: 'Copy', copy_from_pricelist_id: 5 } });

        expect(result.success).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0]).toMatchObject({ item_id: 1, unit_price_centavos: 500 });

        // Mutating the source afterward must not affect the copy -- one-time duplication, not a link.
        const sourceItemsAfter = repository.__state.items.filter((i) => i.pricelist_id === 5);
        expect(sourceItemsAfter).toHaveLength(1);
        const copyItemsAfter = repository.__state.items.filter((i) => i.pricelist_id === result.data.pricelist.pricelist_id);
        expect(copyItemsAfter).toHaveLength(1);
    });

    test('copying from a non-existent pricelist rolls the create back', async () => {
        const repository = makeFakeRepository();
        const create = buildCreatePricelistUseCase({ repository });

        const result = await create({ payload: { name: 'Copy', copy_from_pricelist_id: 999 } });

        // RF-2 (PR #700 review): pricelistNotFound is a resource-not-found, not a validation
        // failure -- 404, mirroring voucherNotFound, not 422.
        expect(statusCode(result)).toBe(404);
        expect(reasonCode(result)).toBe('PRICELIST_NOT_FOUND');
        expect(repository.__state.calls.rollbacks).toBe(1);
    });
});

describe('update pricelist', () => {
    test('happy path patches name/description and bumps version', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist()] });
        const update = buildUpdatePricelistUseCase({ repository });

        const result = await update({ pricelistId: 1, payload: { version: 0, name: 'Wholesale v2' } });

        expect(result.success).toBe(true);
        expect(result.data.pricelist.name).toBe('Wholesale v2');
        expect(result.data.pricelist.version).toBe(1);
    });

    test('a stale version is a 409 conflict', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ version: 3 })] });
        const update = buildUpdatePricelistUseCase({ repository });

        const result = await update({ pricelistId: 1, payload: { version: 0, name: 'x' } });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('PRICELIST_VERSION_CONFLICT');
    });

    test('an archived pricelist rejects every write', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'archived' })] });
        const update = buildUpdatePricelistUseCase({ repository });

        const result = await update({ pricelistId: 1, payload: { version: 0, name: 'x' } });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('PRICELIST_ARCHIVED_IMMUTABLE');
    });
});

describe('replace pricelist items', () => {
    test('writes items directly onto a draft pricelist', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist()] });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        const result = await replaceItems({
            pricelistId: 1,
            payload: { version: 0, items: [{ item_id: 1, unit_price_centavos: 500, is_manual_override: true }] }
        });

        expect(result.success).toBe(true);
        expect(result.data.is_draft).toBe(false);
        expect(result.data.editing_pricelist_id).toBe(1);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.pricelist.version).toBe(1);
    });

    test('an unresolvable item reference rolls back without writing anything', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist()] });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        const result = await replaceItems({
            pricelistId: 1,
            payload: { version: 0, items: [{ item_id: 999, unit_price_centavos: 500 }] }
        });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('PRICELIST_ITEM_REF_NOT_FOUND');
        expect(repository.__state.items).toHaveLength(0);
        expect(repository.__state.calls.rollbacks).toBe(1);
    });

    test('editing an active pricelist transparently creates a draft revision, seeded from the live items', async () => {
        const repository = makeFakeRepository({
            pricelists: [seedPricelist({ status: 'active' })],
            items: [{ pricelist_item_id: 1, pricelist_id: 1, item_id: 1, unit_price_centavos: 500, is_manual_override: false }]
        });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        const result = await replaceItems({
            pricelistId: 1,
            payload: { items: [{ item_id: 1, unit_price_centavos: 400, is_manual_override: true }, { item_id: 2, unit_price_centavos: 900 }] }
        });

        expect(result.success).toBe(true);
        expect(result.data.is_draft).toBe(true);
        expect(result.data.editing_pricelist_id).not.toBe(1);
        expect(result.data.pricelist.draft_of_pricelist_id).toBe(1);
        expect(result.data.items).toHaveLength(2);

        // The published (active) pricelist's own items are untouched -- a buyer mid-checkout must
        // never see prices shift before the draft is explicitly published.
        const publishedItems = repository.__state.items.filter((i) => i.pricelist_id === 1);
        expect(publishedItems).toHaveLength(1);
        expect(publishedItems[0].unit_price_centavos).toBe(500);
    });

    test('a second edit reuses the same open draft rather than creating another', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'active' })] });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        const first = await replaceItems({ pricelistId: 1, payload: { items: [{ item_id: 1, unit_price_centavos: 400 }] } });
        const second = await replaceItems({
            pricelistId: 1,
            payload: { version: first.data.pricelist.version, items: [{ item_id: 1, unit_price_centavos: 350 }] }
        });

        expect(second.success).toBe(true);
        expect(second.data.editing_pricelist_id).toBe(first.data.editing_pricelist_id);
        expect(repository.__state.pricelists.filter((p) => p.draft_of_pricelist_id === 1)).toHaveLength(1);
    });

    test('a stale draft version on the second edit is a 409 conflict', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'active' })] });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        await replaceItems({ pricelistId: 1, payload: { items: [{ item_id: 1, unit_price_centavos: 400 }] } });
        const result = await replaceItems({
            pricelistId: 1,
            payload: { version: 999, items: [{ item_id: 1, unit_price_centavos: 350 }] }
        });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('PRICELIST_VERSION_CONFLICT');
    });

    // RF-3 (PR #700 review): omitting `version` on a second edit against an already-existing draft
    // used to silently bypass the staleness check entirely (`Number.isFinite(NaN)` short-circuited
    // the whole condition to false) -- the exact "concurrent edits are caught, not silently
    // overwritten" guarantee this module's own comment claims. Must now conflict, same as a stale
    // version does, rather than succeed.
    test('an omitted version on the second edit against an existing draft is also a 409 conflict', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'active' })] });
        const replaceItems = buildReplacePricelistItemsUseCase({ repository });

        await replaceItems({ pricelistId: 1, payload: { items: [{ item_id: 1, unit_price_centavos: 400 }] } });
        const result = await replaceItems({
            pricelistId: 1,
            payload: { items: [{ item_id: 1, unit_price_centavos: 350 }] } // no `version` field at all
        });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('PRICELIST_VERSION_CONFLICT');
    });
});

describe('publish pricelist', () => {
    test('a standalone draft (first-time publish) just flips status to active', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'draft' })] });
        const publish = buildPublishPricelistUseCase({ repository });

        const result = await publish({ pricelistId: 1 });

        expect(result.success).toBe(true);
        expect(result.data.pricelist.status).toBe('active');
        expect(result.data.pricelist.pricelist_id).toBe(1);
    });

    test('a draft revision swaps its items into the published parent and deletes itself', async () => {
        const repository = makeFakeRepository({
            pricelists: [
                seedPricelist({ pricelist_id: 1, status: 'active', version: 2 }),
                seedPricelist({ pricelist_id: 2, status: 'draft', draft_of_pricelist_id: 1, version: 0 })
            ],
            items: [
                { pricelist_item_id: 1, pricelist_id: 1, item_id: 1, unit_price_centavos: 500, is_manual_override: false },
                { pricelist_item_id: 2, pricelist_id: 2, item_id: 1, unit_price_centavos: 400, is_manual_override: true }
            ]
        });
        const publish = buildPublishPricelistUseCase({ repository });

        const result = await publish({ pricelistId: 2 });

        expect(result.success).toBe(true);
        // The PARENT's id survives -- vouchers.pricelist_id never has to move.
        expect(result.data.pricelist.pricelist_id).toBe(1);
        expect(result.data.pricelist.status).toBe('active');
        expect(result.data.items).toHaveLength(1);
        expect(result.data.items[0].unit_price_centavos).toBe(400);

        // The draft row itself is gone.
        expect(repository.__state.pricelists.find((p) => p.pricelist_id === 2)).toBeUndefined();
    });

    test('publishing an already-active, non-revision pricelist is refused', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'active' })] });
        const publish = buildPublishPricelistUseCase({ repository });

        const result = await publish({ pricelistId: 1 });

        expect(statusCode(result)).toBe(422);
        expect(reasonCode(result)).toBe('PRICELIST_NOT_PUBLISHABLE');
    });
});

describe('archive pricelist', () => {
    test('happy path archives a draft or active pricelist', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'active' })] });
        const archive = buildArchivePricelistUseCase({ repository });

        const result = await archive({ pricelistId: 1 });

        expect(result.success).toBe(true);
        expect(result.data.pricelist.status).toBe('archived');
    });

    test('archiving an already-archived pricelist is refused, not silently idempotent', async () => {
        const repository = makeFakeRepository({ pricelists: [seedPricelist({ status: 'archived' })] });
        const archive = buildArchivePricelistUseCase({ repository });

        const result = await archive({ pricelistId: 1 });

        expect(statusCode(result)).toBe(409);
        expect(reasonCode(result)).toBe('PRICELIST_ARCHIVED_IMMUTABLE');
    });
});

describe('get / list pricelists', () => {
    test('get returns the pricelist, its items, any open draft id, and attached voucher count', async () => {
        const repository = makeFakeRepository({
            pricelists: [seedPricelist({ status: 'active' }), seedPricelist({ pricelist_id: 2, draft_of_pricelist_id: 1 })],
            items: [{ pricelist_item_id: 1, pricelist_id: 1, item_id: 1, unit_price_centavos: 500, is_manual_override: false }],
            vouchersByPricelistId: { 1: 3 }
        });
        const get = buildGetPricelistUseCase({ repository });

        const result = await get({ pricelistId: 1 });

        expect(result.success).toBe(true);
        expect(result.data.items).toHaveLength(1);
        expect(result.data.draft_pricelist_id).toBe(2);
        expect(result.data.attached_voucher_count).toBe(3);
    });

    test('an unknown pricelist is a 404', async () => {
        const repository = makeFakeRepository();
        const get = buildGetPricelistUseCase({ repository });

        const result = await get({ pricelistId: 999 });

        // RF-2 (PR #700 review): this test's own name said 404 but the assertion said 422 --
        // self-contradictory. pricelistNotFound now actually throws 404, matching voucherNotFound.
        expect(statusCode(result)).toBe(404);
        expect(reasonCode(result)).toBe('PRICELIST_NOT_FOUND');
    });

    test('list excludes draft revisions by default', async () => {
        const repository = makeFakeRepository({
            pricelists: [seedPricelist({ status: 'active' }), seedPricelist({ pricelist_id: 2, draft_of_pricelist_id: 1 })]
        });
        const list = buildListPricelistsUseCase({ repository });

        const result = await list({ query: {} });

        expect(result.success).toBe(true);
        expect(result.data.pricelists).toHaveLength(1);
        expect(result.data.pricelists[0].pricelist_id).toBe(1);
    });
});
