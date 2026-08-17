// The ONLY file in the voucher module that touches Sequelize or the tenant model store.
//
// Every model is resolved through `dbStore.get(...)`, never imported from `../../../models/...`.
// That is not stylistic: the four voucher tables are TENANT-SCOPED, and a static model import binds
// to the landlord/default connection, so a direct import would read and write the wrong database the
// moment a request carries a tenant context. `tenantLocationRepository.js` is the idiom this follows.

import { Op, col, fn, literal } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { voucherConflict, VoucherReasonCode } from '../domain/voucherErrors.js';

const toPlain = (value) => (value && typeof value.get === 'function' ? value.get({ plain: true }) : value);

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();

const scopeKey = (scope) => `${scope.scope_type}:${Number(scope.scope_ref_id)}`;

const LIST_SORT_COLUMNS = Object.freeze({
    created_at: 'created_at',
    code: 'code',
    valid_until: 'valid_until'
});

// MySQL reports a duplicate-key error with the offending index name in the driver message. Matching
// the index name specifically (rather than "is this an ER_DUP_ENTRY?") keeps a future unique index on
// some other voucher column from being mislabeled as a duplicate code.
const isVoucherCodeUniqueViolation = (error) => {
    if (!error) return false;
    if (error.name !== 'SequelizeUniqueConstraintError') return false;
    const indexName = error.parent?.sqlMessage || error.original?.sqlMessage || error.message || '';
    if (indexName.includes('uq_vouchers_code')) return true;
    // Sequelize normalizes some drivers into `error.fields`; a single-column `code` conflict on the
    // vouchers table can only be uq_vouchers_code.
    return Boolean(error.fields && Object.keys(error.fields).includes('code'));
};

export const voucherRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async findById(voucherId, options = {}) {
        const Voucher = dbStore.get('Voucher');
        const row = await Voucher.findByPk(voucherId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findByCode(code, options = {}) {
        const Voucher = dbStore.get('Voucher');
        const normalized = normalizeCode(code);
        if (!normalized) return null;
        const row = await Voucher.findOne({
            where: { code: normalized },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listVouchers(filters = {}, pagination = {}) {
        const Voucher = dbStore.get('Voucher');
        const where = {};

        if (Array.isArray(filters.status) && filters.status.length > 0) {
            where.status = { [Op.in]: filters.status };
        }
        if (filters.benefit_class) where.benefit_class = filters.benefit_class;
        if (filters.voucher_kind) where.voucher_kind = filters.voucher_kind;
        if (filters.search) {
            const pattern = `%${String(filters.search).trim()}%`;
            where[Op.or] = [
                { code: { [Op.like]: pattern } },
                { title: { [Op.like]: pattern } }
            ];
        }

        const page = Math.max(1, Number(pagination.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(pagination.limit) || 20));
        const sortColumn = LIST_SORT_COLUMNS[pagination.sort] || LIST_SORT_COLUMNS.created_at;
        const direction = String(pagination.direction || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

        const { rows, count } = await Voucher.findAndCountAll({
            where,
            order: [[sortColumn, direction], ['voucher_id', 'DESC']],
            offset: (page - 1) * limit,
            limit
        });

        return { rows: rows.map(toPlain), count };
    },

    async createVoucher(values, options = {}) {
        const Voucher = dbStore.get('Voucher');
        try {
            const created = await Voucher.create(values, { transaction: options.transaction });
            return toPlain(created);
        } catch (error) {
            if (isVoucherCodeUniqueViolation(error)) {
                voucherConflict(
                    'A voucher with this code already exists.',
                    VoucherReasonCode.VOUCHER_CODE_ALREADY_EXISTS,
                    { code: normalizeCode(values?.code) }
                );
            }
            throw error;
        }
    },

    /**
     * Conditional UPDATE implementing manual optimistic locking (same convention as
     * `EmployeeCreditAccount.version`).
     *
     * Returns the affected-row count rather than throwing, so the caller distinguishes "row gone" from
     * "someone else wrote first" -- both produce 0 here, and only the caller knows which it is after
     * its own read.
     */
    async updateVoucherWithVersion(voucherId, values, expectedVersion, options = {}) {
        const Voucher = dbStore.get('Voucher');
        try {
            const [affectedCount] = await Voucher.update(
                { ...values, version: literal('version + 1') },
                {
                    where: { voucher_id: voucherId, version: expectedVersion },
                    transaction: options.transaction
                }
            );
            return affectedCount;
        } catch (error) {
            if (isVoucherCodeUniqueViolation(error)) {
                voucherConflict(
                    'A voucher with this code already exists.',
                    VoucherReasonCode.VOUCHER_CODE_ALREADY_EXISTS,
                    { code: normalizeCode(values?.code) }
                );
            }
            throw error;
        }
    },

    /**
     * Idempotent lazy expiry. Guarded on `status = 'active'` so a concurrent pause/archive is never
     * clobbered, and so re-running it is a no-op rather than a second version bump.
     */
    async markExpired(voucherIds, options = {}) {
        const ids = (Array.isArray(voucherIds) ? voucherIds : [voucherIds])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) return 0;

        const Voucher = dbStore.get('Voucher');
        const [affectedCount] = await Voucher.update(
            { status: 'expired', version: literal('version + 1') },
            {
                where: { voucher_id: { [Op.in]: ids }, status: 'active' },
                transaction: options.transaction
            }
        );
        return affectedCount;
    },

    async listScopes(voucherIds, options = {}) {
        const ids = (Array.isArray(voucherIds) ? voucherIds : [voucherIds])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) return [];

        const VoucherScope = dbStore.get('VoucherScope');
        const rows = await VoucherScope.findAll({
            where: { voucher_id: { [Op.in]: ids } },
            order: [['voucher_scope_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    /**
     * Validate the polymorphic `voucher_scopes.scope_ref_id` references.
     *
     * `scope_ref_id` deliberately carries no foreign key (Phase 102 deviation 2: it points at
     * `items(item_id)` or `item_folders(folder_id)` depending on `scope_type`, so a real FK is
     * impossible), which makes this the only integrity check that exists for it.
     *
     * Two queries maximum regardless of how many scopes are supplied.
     *
     * Existence and soft-delete only -- deliberately NOT filtered by `Item.status` or
     * `ItemFolder.is_active`. Scoping a campaign to a draft or currently-inactive item is legitimate
     * campaign prep; the eligibility check at redemption time is what decides whether it actually
     * applies.
     *
     * @returns {{missing: Array<{scope_type: string, scope_ref_id: number}>}}
     */
    async assertScopeRefsExist(scopes = [], options = {}) {
        const list = Array.isArray(scopes) ? scopes : [];
        if (list.length === 0) return { missing: [] };

        const itemIds = [...new Set(
            list.filter((scope) => scope.scope_type === 'item').map((scope) => Number(scope.scope_ref_id))
        )];
        const folderIds = [...new Set(
            list.filter((scope) => scope.scope_type === 'item_folder').map((scope) => Number(scope.scope_ref_id))
        )];

        const foundItemIds = new Set();
        const foundFolderIds = new Set();

        if (itemIds.length > 0) {
            const rows = await dbStore.get('Item').findAll({
                where: { item_id: { [Op.in]: itemIds }, deleted_at: null },
                attributes: ['item_id'],
                transaction: options.transaction,
                raw: true
            });
            rows.forEach((row) => foundItemIds.add(Number(row.item_id)));
        }

        if (folderIds.length > 0) {
            const rows = await dbStore.get('ItemFolder').findAll({
                where: { folder_id: { [Op.in]: folderIds }, deleted_at: null },
                attributes: ['folder_id'],
                transaction: options.transaction,
                raw: true
            });
            rows.forEach((row) => foundFolderIds.add(Number(row.folder_id)));
        }

        const missing = [];
        itemIds.forEach((id) => {
            if (!foundItemIds.has(id)) missing.push({ scope_type: 'item', scope_ref_id: id });
        });
        folderIds.forEach((id) => {
            if (!foundFolderIds.has(id)) missing.push({ scope_type: 'item_folder', scope_ref_id: id });
        });

        return { missing };
    },

    /**
     * Reconcile `voucher_scopes` to the supplied set: delete what is no longer wanted, insert what is
     * new, leave untouched rows alone. Not a delete-all-then-reinsert, so `voucher_scope_id` values
     * stay stable for rows that did not change.
     */
    async replaceScopes(voucherId, scopes = [], options = {}) {
        const VoucherScope = dbStore.get('VoucherScope');
        const desired = (Array.isArray(scopes) ? scopes : []).map((scope) => ({
            scope_type: scope.scope_type,
            scope_ref_id: Number(scope.scope_ref_id)
        }));
        const desiredKeys = new Set(desired.map(scopeKey));

        const existing = await VoucherScope.findAll({
            where: { voucher_id: voucherId },
            transaction: options.transaction,
            raw: true
        });

        const staleIds = existing
            .filter((row) => !desiredKeys.has(scopeKey(row)))
            .map((row) => row.voucher_scope_id);

        if (staleIds.length > 0) {
            await VoucherScope.destroy({
                where: { voucher_scope_id: { [Op.in]: staleIds } },
                transaction: options.transaction
            });
        }

        const existingKeys = new Set(existing.map(scopeKey));
        const toInsert = desired.filter((scope) => !existingKeys.has(scopeKey(scope)));

        if (toInsert.length > 0) {
            await VoucherScope.bulkCreate(
                toInsert.map((scope) => ({ voucher_id: voucherId, ...scope })),
                { transaction: options.transaction }
            );
        }

        return { deleted: staleIds.length, inserted: toInsert.length };
    },

    /**
     * Read-only aggregate over the redemption ledger, which ADR 0066 decision 4 makes authoritative.
     * `vouchers.redeemed_*` is the derived cache; the caller compares the two and reports whether they
     * agree rather than silently trusting either.
     *
     * The ledger has no `redeemed_at` column -- `created_at` is the redemption instant (the table is
     * append-only, `updatedAt: false`), so `last_redeemed_at` is `MAX(created_at)`.
     */
    async getRedemptionStats(voucherIds, options = {}) {
        const ids = (Array.isArray(voucherIds) ? voucherIds : [voucherIds])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) return {};

        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const rows = await VoucherRedemption.findAll({
            where: { voucher_id: { [Op.in]: ids } },
            attributes: [
                'voucher_id',
                [fn('COUNT', col('voucher_redemption_id')), 'redemption_count'],
                [fn('COALESCE', fn('SUM', col('discount_centavos')), 0), 'total_discount_centavos'],
                [fn('COALESCE', fn('SUM', col('benefit_quantity')), 0), 'total_benefit_quantity'],
                [fn('MAX', col('created_at')), 'last_redeemed_at']
            ],
            group: ['voucher_id'],
            transaction: options.transaction,
            raw: true
        });

        return rows.reduce((accumulator, row) => {
            accumulator[Number(row.voucher_id)] = {
                redemption_count: Number(row.redemption_count) || 0,
                total_discount_centavos: Number(row.total_discount_centavos) || 0,
                total_benefit_quantity: Number(row.total_benefit_quantity) || 0,
                last_redeemed_at: row.last_redeemed_at || null
            };
            return accumulator;
        }, {});
    }
};

export default voucherRepository;
