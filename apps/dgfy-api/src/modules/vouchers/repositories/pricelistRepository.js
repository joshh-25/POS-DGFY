// The ONLY file in the voucher module (besides voucherRepository.js) that touches Sequelize or the
// tenant model store for the pricelist aggregate. Every model is resolved through `dbStore.get(...)`,
// never imported from `../../../models/...` -- same reasoning as `voucherRepository.js`: `pricelists`
// and `pricelist_items` are TENANT-SCOPED, and a static import would bind to the landlord connection.

import { Op, literal } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (value && typeof value.get === 'function' ? value.get({ plain: true }) : value);

const itemKey = (row) => Number(row.item_id);

export const pricelistRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findById(pricelistId, options = {}) {
        const Pricelist = dbStore.get('Pricelist');
        const row = await Pricelist.findByPk(pricelistId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    /**
     * The open draft revision of a published pricelist, if one exists -- `draft_of_pricelist_id` is
     * unique, so there is at most one.
     */
    async findDraftOfPublished(publishedPricelistId, options = {}) {
        const Pricelist = dbStore.get('Pricelist');
        const row = await Pricelist.findOne({
            where: { draft_of_pricelist_id: publishedPricelistId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listPricelists(filters = {}, pagination = {}) {
        const Pricelist = dbStore.get('Pricelist');
        const where = {};
        if (Array.isArray(filters.status) && filters.status.length > 0) {
            where.status = { [Op.in]: filters.status };
        }
        if (filters.search) {
            where.name = { [Op.like]: `%${String(filters.search).trim()}%` };
        }
        // The list surface is for attaching to a voucher / picking one to edit -- a draft revision
        // exists only to be reached through its published parent (GET /:id), never as its own list row.
        if (filters.excludeDraftRevisions !== false) {
            where.draft_of_pricelist_id = null;
        }

        const page = Math.max(1, Number(pagination.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 20));

        const { rows, count } = await Pricelist.findAndCountAll({
            where,
            order: [['created_at', 'DESC'], ['pricelist_id', 'DESC']],
            offset: (page - 1) * limit,
            limit
        });
        return { rows: rows.map(toPlain), count };
    },

    async createPricelist(values, options = {}) {
        const Pricelist = dbStore.get('Pricelist');
        const created = await Pricelist.create(values, { transaction: options.transaction });
        return toPlain(created);
    },

    /**
     * Conditional UPDATE implementing manual optimistic locking, same convention as
     * `voucherRepository.updateVoucherWithVersion`.
     */
    async updatePricelistWithVersion(pricelistId, values, expectedVersion, options = {}) {
        const Pricelist = dbStore.get('Pricelist');
        const [affectedCount] = await Pricelist.update(
            { ...values, version: literal('version + 1') },
            {
                where: { pricelist_id: pricelistId, version: expectedVersion },
                transaction: options.transaction
            }
        );
        return affectedCount;
    },

    async listPricelistItems(pricelistId, options = {}) {
        const PricelistItem = dbStore.get('PricelistItem');
        const rows = await PricelistItem.findAll({
            where: { pricelist_id: pricelistId },
            order: [['pricelist_item_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    /**
     * Friendly pre-check before an insert -- `pricelist_items.item_id` DOES carry a real FK (unlike
     * `voucher_scopes.scope_ref_id`, which is polymorphic), so this exists purely to return a clean
     * 422 instead of a raw FK-constraint database error. Existence + soft-delete only, matching
     * `assertScopeRefsExist`'s own contract.
     */
    async assertItemRefsExist(itemIds = [], options = {}) {
        const ids = [...new Set((Array.isArray(itemIds) ? itemIds : []).map((id) => Number(id)))];
        if (ids.length === 0) return { missing: [] };

        const rows = await dbStore.get('Item').findAll({
            where: { item_id: { [Op.in]: ids }, deleted_at: null },
            attributes: ['item_id'],
            transaction: options.transaction,
            raw: true
        });
        const found = new Set(rows.map((row) => Number(row.item_id)));
        return { missing: ids.filter((id) => !found.has(id)) };
    },

    /**
     * Reconcile `pricelist_items` to the supplied set: delete what is no longer wanted, insert what
     * is new, UPDATE a row whose price or override flag changed -- unlike
     * `voucherRepository.replaceScopes` (which has no update branch, because a voucher scope has no
     * payload beyond its own existence), a pricelist row's price is exactly the payload that changes,
     * so a bare delete+insert diff would silently no-op every price edit.
     */
    async replacePricelistItems(pricelistId, items = [], options = {}) {
        const PricelistItem = dbStore.get('PricelistItem');
        const desired = (Array.isArray(items) ? items : []).map((item) => ({
            item_id: Number(item.item_id),
            unit_price_centavos: Number(item.unit_price_centavos),
            is_manual_override: item.is_manual_override === true
        }));
        const desiredByItemId = new Map(desired.map((item) => [itemKey(item), item]));

        const existing = await PricelistItem.findAll({
            where: { pricelist_id: pricelistId },
            transaction: options.transaction,
            raw: true
        });
        const existingByItemId = new Map(existing.map((row) => [itemKey(row), row]));

        const staleIds = existing
            .filter((row) => !desiredByItemId.has(itemKey(row)))
            .map((row) => row.pricelist_item_id);
        if (staleIds.length > 0) {
            await PricelistItem.destroy({
                where: { pricelist_item_id: { [Op.in]: staleIds } },
                transaction: options.transaction
            });
        }

        const toInsert = [];
        const toUpdate = [];
        desired.forEach((item) => {
            const existingRow = existingByItemId.get(itemKey(item));
            if (!existingRow) {
                toInsert.push(item);
                return;
            }
            if (
                Number(existingRow.unit_price_centavos) !== item.unit_price_centavos
                || Boolean(existingRow.is_manual_override) !== item.is_manual_override
            ) {
                toUpdate.push({ pricelist_item_id: existingRow.pricelist_item_id, ...item });
            }
        });

        if (toInsert.length > 0) {
            await PricelistItem.bulkCreate(
                toInsert.map((item) => ({ pricelist_id: pricelistId, ...item })),
                { transaction: options.transaction }
            );
        }
        for (const item of toUpdate) {
            await PricelistItem.update(
                { unit_price_centavos: item.unit_price_centavos, is_manual_override: item.is_manual_override },
                { where: { pricelist_item_id: item.pricelist_item_id }, transaction: options.transaction }
            );
        }

        return { deleted: staleIds.length, inserted: toInsert.length, updated: toUpdate.length };
    },

    /**
     * Publish a draft revision into its published parent: the parent's `pricelist_items` are
     * replaced with the draft's (inside the caller's transaction), the draft row is deleted, and the
     * parent's `version` is bumped. The parent's `pricelist_id` never changes, so
     * `vouchers.pricelist_id` is never rewritten and no voucher FK moves.
     */
    async publishDraftIntoParent(draftPricelistId, parentPricelistId, options = {}) {
        const draftItems = await this.listPricelistItems(draftPricelistId, options);
        await this.replacePricelistItems(parentPricelistId, draftItems, options);

        const Pricelist = dbStore.get('Pricelist');
        await Pricelist.update(
            { status: 'active', version: literal('version + 1') },
            { where: { pricelist_id: parentPricelistId }, transaction: options.transaction }
        );
        await Pricelist.destroy({ where: { pricelist_id: draftPricelistId }, transaction: options.transaction });

        return this.findById(parentPricelistId, options);
    },

    /**
     * Count of vouchers currently attached to a pricelist -- used to give a merchant a clear signal
     * before archiving one out from under a live voucher, rather than a silent later checkout failure.
     */
    async countVouchersUsingPricelist(pricelistId, options = {}) {
        const Voucher = dbStore.get('Voucher');
        return Voucher.count({
            where: { pricelist_id: pricelistId },
            transaction: options.transaction
        });
    }
};

export default pricelistRepository;
