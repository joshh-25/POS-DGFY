// Pricelist admin use cases (#696, extends #584/ADR 0066). Same contract as voucherUseCases.js:
// every builder takes `{ repository }`, returns `ok`/`fail`, and never throws past its own boundary.
//
// Draft -> publish lifecycle (#698 depends on this):
//   - A pricelist is created `draft`. `POST /:id/publish` on a standalone draft (no
//     `draft_of_pricelist_id`) is a first-time publish -- just flips status to `active`.
//   - `PUT /:id/items` on an `active` pricelist transparently creates-or-reuses an open draft
//     revision (copying the published row's current items as the starting point) and writes there
//     instead -- the response tells the caller it is now editing a draft, not the live row.
//   - `POST /:id/publish` on a draft revision (`draft_of_pricelist_id` set) swaps its items into the
//     published parent inside one transaction, deletes the draft, and bumps the parent's version.
//     The parent's `pricelist_id` never changes, so `vouchers.pricelist_id` is never rewritten.
// This is what keeps a buyer mid-checkout from ever seeing prices shift, and a half-finished bulk
// edit from leaking to the storefront before the merchant explicitly publishes it.

import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { VoucherReasonCode, voucherConflict, voucherError, pricelistNotFound } from '../domain/voucherErrors.js';

const toFailure = (error, fallbackMessage) => {
    if (error instanceof DomainError) return fail(error, error.message);
    return fail(
        new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, { statusCode: 500, cause: error }),
        fallbackMessage
    );
};

const rollbackQuietly = async (transaction) => {
    if (!transaction || transaction.finished) return;
    try {
        await transaction.rollback();
    } catch {
        // A rollback failure must not mask the original error.
    }
};

const presentPricelist = (pricelist) => (pricelist ? { ...pricelist, version: Number(pricelist.version ?? 0) } : null);

const presentItem = (item) => ({
    pricelist_item_id: item.pricelist_item_id,
    item_id: Number(item.item_id),
    unit_price_centavos: Number(item.unit_price_centavos),
    is_manual_override: Boolean(item.is_manual_override)
});

const normalizeItemsPayload = (items = []) => (Array.isArray(items) ? items : []).map((item) => ({
    item_id: Number(item.item_id),
    unit_price_centavos: Number(item.unit_price_centavos),
    is_manual_override: item.is_manual_override === true
}));

const assertItemRefs = async (repository, items, transaction) => {
    const { missing } = await repository.assertItemRefsExist(items.map((item) => item.item_id), { transaction });
    if (missing.length > 0) {
        voucherError(
            'One or more pricelist item references do not exist.',
            VoucherReasonCode.PRICELIST_ITEM_REF_NOT_FOUND,
            { missing }
        );
    }
};

export const buildListPricelistsUseCase = ({ repository }) => async ({ query = {} } = {}) => {
    try {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
        const { rows, count } = await repository.listPricelists(
            { status: query.status, search: query.search },
            { page, limit }
        );
        return ok({
            pricelists: rows.map(presentPricelist),
            pagination: { page, limit, total: count, total_pages: limit > 0 ? Math.ceil(count / limit) : 0 }
        });
    } catch (error) {
        return toFailure(error, 'Failed to list pricelists');
    }
};

export const buildGetPricelistUseCase = ({ repository }) => async ({ pricelistId } = {}) => {
    try {
        const stored = await repository.findById(pricelistId);
        if (!stored) pricelistNotFound('Pricelist not found', { pricelist_id: pricelistId });

        const [items, draft, attachedVoucherCount] = await Promise.all([
            repository.listPricelistItems(stored.pricelist_id),
            stored.draft_of_pricelist_id == null ? repository.findDraftOfPublished(stored.pricelist_id) : Promise.resolve(null),
            repository.countVouchersUsingPricelist(stored.pricelist_id)
        ]);

        return ok({
            pricelist: presentPricelist(stored),
            items: items.map(presentItem),
            draft_pricelist_id: draft ? draft.pricelist_id : null,
            attached_voucher_count: attachedVoucherCount
        });
    } catch (error) {
        return toFailure(error, 'Failed to retrieve pricelist');
    }
};

/**
 * `copy_from_pricelist_id`, if supplied, is a one-time row duplication into the new pricelist --
 * explicitly NOT a live link (#698's own scope note). The new pricelist always starts `draft`
 * regardless of the source's status.
 */
export const buildCreatePricelistUseCase = ({ repository }) => async ({ payload = {} } = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const created = await repository.createPricelist({
            name: payload.name,
            description: payload.description ?? null,
            status: 'draft'
        }, { transaction });

        if (payload.copy_from_pricelist_id != null) {
            const source = await repository.findById(payload.copy_from_pricelist_id, { transaction });
            if (!source) pricelistNotFound('Pricelist not found', { pricelist_id: payload.copy_from_pricelist_id });
            const sourceItems = await repository.listPricelistItems(source.pricelist_id, { transaction });
            if (sourceItems.length > 0) {
                await repository.replacePricelistItems(created.pricelist_id, normalizeItemsPayload(sourceItems), { transaction });
            }
        }

        const items = await repository.listPricelistItems(created.pricelist_id, { transaction });

        await transaction.commit();
        transaction = null;

        return ok({ pricelist: presentPricelist(created), items: items.map(presentItem) });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to create pricelist');
    }
};

export const buildUpdatePricelistUseCase = ({ repository }) => async ({ pricelistId, payload = {} } = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const stored = await repository.findById(pricelistId, { transaction, lock: true });
        if (!stored) pricelistNotFound('Pricelist not found', { pricelist_id: pricelistId });
        if (stored.status === 'archived') {
            voucherConflict(
                'Archived pricelists cannot be modified.',
                VoucherReasonCode.PRICELIST_ARCHIVED_IMMUTABLE,
                { pricelist_id: stored.pricelist_id }
            );
        }

        const expectedVersion = Number(payload.version);
        if (expectedVersion !== Number(stored.version)) {
            voucherConflict(
                'Pricelist was modified by someone else. Reload and try again.',
                VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                { expected_version: expectedVersion, current_version: Number(stored.version) }
            );
        }

        const values = {};
        if (Object.prototype.hasOwnProperty.call(payload, 'name')) values.name = payload.name;
        if (Object.prototype.hasOwnProperty.call(payload, 'description')) values.description = payload.description ?? null;

        const affected = await repository.updatePricelistWithVersion(stored.pricelist_id, values, expectedVersion, { transaction });
        if (affected === 0) {
            voucherConflict(
                'Pricelist was modified by someone else. Reload and try again.',
                VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                { expected_version: expectedVersion }
            );
        }

        const updated = await repository.findById(stored.pricelist_id, { transaction });
        await transaction.commit();
        transaction = null;

        return ok({ pricelist: presentPricelist(updated) });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to update pricelist');
    }
};

/**
 * Replace a pricelist's items. On an `active` (published) pricelist, transparently creates or
 * reuses an open draft revision and writes there instead -- the live pricelist a voucher may already
 * be resolving against is never touched mid-edit. Returns `editing_pricelist_id` so the caller knows
 * which row it actually wrote (the target id itself, or a newly-surfaced draft id).
 */
export const buildReplacePricelistItemsUseCase = ({ repository }) => async ({ pricelistId, payload = {} } = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const stored = await repository.findById(pricelistId, { transaction, lock: true });
        if (!stored) pricelistNotFound('Pricelist not found', { pricelist_id: pricelistId });
        if (stored.status === 'archived') {
            voucherConflict(
                'Archived pricelists cannot be modified.',
                VoucherReasonCode.PRICELIST_ARCHIVED_IMMUTABLE,
                { pricelist_id: stored.pricelist_id }
            );
        }

        const items = normalizeItemsPayload(payload.items);
        await assertItemRefs(repository, items, transaction);

        let targetId = stored.pricelist_id;
        let editingIsDraft = false;
        let versionBeforeItemsWrite;

        if (stored.status === 'active') {
            editingIsDraft = true;
            let draft = await repository.findDraftOfPublished(stored.pricelist_id, { transaction, lock: true });
            if (!draft) {
                draft = await repository.createPricelist({
                    name: stored.name,
                    description: stored.description,
                    status: 'draft',
                    draft_of_pricelist_id: stored.pricelist_id
                }, { transaction });
                const publishedItems = await repository.listPricelistItems(stored.pricelist_id, { transaction });
                if (publishedItems.length > 0) {
                    await repository.replacePricelistItems(draft.pricelist_id, normalizeItemsPayload(publishedItems), { transaction });
                }
            } else {
                // RF-3 (PR #700 review): no `Number.isFinite` carve-out here -- an omitted `version`
                // on a second write to an already-existing draft must not silently bypass the
                // staleness check. `Number(undefined)` is `NaN`, which never equals a real version,
                // so omitting it now fails closed (a conflict), matching the non-active-status
                // branch below rather than the accidental skip this guard used to allow.
                const expectedVersion = Number(payload.version);
                if (expectedVersion !== Number(draft.version)) {
                    voucherConflict(
                        'This pricelist draft was modified by someone else. Reload and try again.',
                        VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                        { expected_version: expectedVersion, current_version: Number(draft.version) }
                    );
                }
            }
            targetId = draft.pricelist_id;
            // Re-read: the draft may have just been created (and possibly seeded with items) in this
            // same transaction, so `draft.version` above can be stale by the time items are written.
            versionBeforeItemsWrite = Number((await repository.findById(targetId, { transaction })).version);
        } else {
            const expectedVersion = Number(payload.version);
            if (expectedVersion !== Number(stored.version)) {
                voucherConflict(
                    'Pricelist was modified by someone else. Reload and try again.',
                    VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                    { expected_version: expectedVersion, current_version: Number(stored.version) }
                );
            }
            versionBeforeItemsWrite = expectedVersion;
        }

        await repository.replacePricelistItems(targetId, items, { transaction });
        // Bump the optimistic-lock version on whichever row was actually written -- draft or not --
        // so a second concurrent PUT against the same draft is caught, not silently overwritten.
        await repository.updatePricelistWithVersion(targetId, {}, versionBeforeItemsWrite, { transaction });

        const editingPricelist = await repository.findById(targetId, { transaction });
        const persistedItems = await repository.listPricelistItems(targetId, { transaction });

        await transaction.commit();
        transaction = null;

        return ok({
            pricelist: presentPricelist(editingPricelist),
            items: persistedItems.map(presentItem),
            is_draft: editingIsDraft,
            editing_pricelist_id: targetId
        });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to update pricelist items');
    }
};

export const buildPublishPricelistUseCase = ({ repository }) => async ({ pricelistId } = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const stored = await repository.findById(pricelistId, { transaction, lock: true });
        if (!stored) pricelistNotFound('Pricelist not found', { pricelist_id: pricelistId });

        let published;
        if (stored.draft_of_pricelist_id != null) {
            published = await repository.publishDraftIntoParent(stored.pricelist_id, stored.draft_of_pricelist_id, { transaction });
        } else if (stored.status === 'draft') {
            const affected = await repository.updatePricelistWithVersion(
                stored.pricelist_id,
                { status: 'active' },
                Number(stored.version),
                { transaction }
            );
            if (affected === 0) {
                voucherConflict(
                    'Pricelist was modified by someone else. Reload and try again.',
                    VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                    { expected_version: Number(stored.version) }
                );
            }
            published = await repository.findById(stored.pricelist_id, { transaction });
        } else {
            voucherError(
                'This pricelist is already published and is not a draft revision.',
                VoucherReasonCode.PRICELIST_NOT_PUBLISHABLE,
                { pricelist_id: stored.pricelist_id, status: stored.status }
            );
        }

        const items = await repository.listPricelistItems(published.pricelist_id, { transaction });

        await transaction.commit();
        transaction = null;

        return ok({ pricelist: presentPricelist(published), items: items.map(presentItem) });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to publish pricelist');
    }
};

export const buildArchivePricelistUseCase = ({ repository }) => async ({ pricelistId } = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const stored = await repository.findById(pricelistId, { transaction, lock: true });
        if (!stored) pricelistNotFound('Pricelist not found', { pricelist_id: pricelistId });
        if (stored.status === 'archived') {
            voucherConflict(
                'Pricelist is already archived.',
                VoucherReasonCode.PRICELIST_ARCHIVED_IMMUTABLE,
                { pricelist_id: stored.pricelist_id }
            );
        }

        const affected = await repository.updatePricelistWithVersion(
            stored.pricelist_id,
            { status: 'archived' },
            Number(stored.version),
            { transaction }
        );
        if (affected === 0) {
            voucherConflict(
                'Pricelist was modified by someone else. Reload and try again.',
                VoucherReasonCode.PRICELIST_VERSION_CONFLICT,
                { expected_version: Number(stored.version) }
            );
        }

        const updated = await repository.findById(stored.pricelist_id, { transaction });
        await transaction.commit();
        transaction = null;

        return ok({ pricelist: presentPricelist(updated) });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to archive pricelist');
    }
};
