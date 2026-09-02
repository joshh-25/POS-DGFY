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
        // #1332 (Phase 244): explicit `!== undefined`, not truthy -- `auto_apply: false` is a
        // meaningful filter value (list the code-entered-only vouchers), not "no filter given".
        if (filters.auto_apply !== undefined) where.auto_apply = Boolean(filters.auto_apply);
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

    /**
     * #1332 (Phase 244, epic #1321 decision 9): candidate fetch for the auto-applied delivery
     * campaign selector. Deliberately a MINIMAL SQL filter -- `auto_apply` + `benefit_target` +
     * stored `status` only. Every semantic filter (date window, time-of-day, weekday, channel,
     * fulfillment method, order timing, min spend, min quantity, exhaustion) stays in
     * `autoAppliedCampaignPolicy.js`'s pure selector, which is the ONE place quote and checkout can
     * provably share an implementation. Pushing any of those into SQL would create a second filter
     * that could disagree with the first -- do not "optimize" this by adding one.
     *
     * `status: 'active'` in SQL is a safe narrowing, not a semantic filter: `deriveVoucherStatus`
     * can only make a stored-`active` row LESS eligible (an elapsed `valid_until` derives to
     * `expired`), never promote a non-`active` stored status to `active`. So this predicate is a
     * strict superset-preserving prefilter of what the selector would do anyway -- this becomes
     * WRONG the moment `deriveVoucherStatus` ever gains a promoting branch, so re-check this comment
     * against that function before changing either.
     *
     * `ORDER BY voucher_id ASC LIMIT 200` -- the limit is defensive against an unbounded read; the
     * explicit ORDER BY makes the truncation itself deterministic (an unordered LIMIT would be a
     * nondeterminism source, exactly the class of bug this phase exists to prevent). A realistic
     * tenant has far fewer than 200 auto-apply delivery campaigns; the caller logs a warning if this
     * limit is ever actually hit.
     *
     * NO CACHING. EVER. Any cache between the quote call and the checkout call lets the two paths
     * see different candidate sets at slightly different times -- precisely the quote/checkout
     * divergence this whole phase exists to prevent. A future performance-minded refactor will
     * otherwise look at an unindexed-seeming N-row query on a hot checkout path and add a cache in
     * good faith -- don't.
     *
     * `options.transaction` MUST be threaded on the checkout path, so the candidate read and the
     * subsequent `reserveRedemption` see one consistent snapshot inside the same open transaction.
     */
    async listAutoApplyDeliveryCampaigns(options = {}) {
        const Voucher = dbStore.get('Voucher');
        const rows = await Voucher.findAll({
            where: { auto_apply: true, benefit_target: 'delivery', status: 'active' },
            order: [['voucher_id', 'ASC']],
            limit: 200,
            transaction: options.transaction
        });
        return rows.map(toPlain);
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
    },

    // ---------------------------------------------------------------------------------------
    // Phase 105 (#455) additions -- storefront redemption. ADR 0066 decision 4: the ledger
    // (`voucher_redemptions` / `voucher_redemption_lines`) is authoritative; `vouchers.redeemed_*`
    // is a derived cache maintained by the guarded UPDATE below so the atomic reservation stays a
    // single conditional statement, same idiom as `companyRegistrationRepository.markProvisioningStarted`.
    // ---------------------------------------------------------------------------------------

    /**
     * The single atomic reservation. One conditional UPDATE guards all three exhaustion limits
     * (redemption count / peso budget / benefit quantity) plus bumps `version` -- affected-row
     * count `0` means at least one guard failed OR the voucher row is gone; the caller re-reads to
     * tell which and map it to the specific reason code (ADR 0066 decision 3: fail closed, never
     * cap at the remainder).
     *
     * `quantity` is rounded to the nearest integer before being written: `redeemed_quantity` and
     * `max_benefit_quantity` are both `INTEGER` columns (a pre-existing schema decision, not
     * something this phase revisits), while `voucher_redemption_lines.quantity` keeps full
     * (weighed-goods) precision separately.
     */
    async reserveRedemption(voucherId, { discountCentavos, quantity } = {}, options = {}) {
        const Voucher = dbStore.get('Voucher');
        const id = Number(voucherId);
        if (!Number.isInteger(id) || id <= 0) return 0;

        const rawDiscount = Number(discountCentavos);
        const rawQty = Number(quantity);
        const discount = Number.isFinite(rawDiscount) ? Math.max(0, Math.round(rawDiscount)) : 0;
        const qty = Number.isFinite(rawQty) ? Math.max(0, Math.round(rawQty)) : 0;

        const [affectedCount] = await Voucher.update(
            {
                redeemed_count: literal('redeemed_count + 1'),
                redeemed_value_centavos: literal(`redeemed_value_centavos + ${discount}`),
                redeemed_quantity: literal(`redeemed_quantity + ${qty}`),
                version: literal('version + 1')
            },
            {
                where: {
                    voucher_id: id,
                    [Op.and]: [
                        literal('(max_redemptions IS NULL OR redeemed_count < max_redemptions)'),
                        literal(
                            `(max_total_discount_centavos IS NULL OR redeemed_value_centavos + ${discount} <= max_total_discount_centavos)`
                        ),
                        literal(
                            `(max_benefit_quantity IS NULL OR redeemed_quantity + ${qty} <= max_benefit_quantity)`
                        )
                    ]
                },
                transaction: options.transaction
            }
        );
        return affectedCount;
    },

    /**
     * Symmetric decrement for a reversal, floored at zero -- never negative, matching the
     * validation this ADR names ("reversal must not go negative on a double-reversal or a stale
     * read"). Unconditional (no exhaustion guard): a reversal always frees capacity back up.
     */
    async reverseRedemptionCounters(voucherId, { discountCentavos, quantity } = {}, options = {}) {
        const Voucher = dbStore.get('Voucher');
        const id = Number(voucherId);
        if (!Number.isInteger(id) || id <= 0) return 0;

        const rawDiscount = Number(discountCentavos);
        const rawQty = Number(quantity);
        const discount = Number.isFinite(rawDiscount) ? Math.max(0, Math.round(rawDiscount)) : 0;
        const qty = Number.isFinite(rawQty) ? Math.max(0, Math.round(rawQty)) : 0;

        const [affectedCount] = await Voucher.update(
            {
                redeemed_count: literal('GREATEST(redeemed_count - 1, 0)'),
                redeemed_value_centavos: literal(`GREATEST(redeemed_value_centavos - ${discount}, 0)`),
                redeemed_quantity: literal(`GREATEST(redeemed_quantity - ${qty}, 0)`),
                version: literal('version + 1')
            },
            {
                where: { voucher_id: id },
                transaction: options.transaction
            }
        );
        return affectedCount;
    },

    async createRedemptionLedgerEntry(values, options = {}) {
        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const created = await VoucherRedemption.create(values, { transaction: options.transaction });
        return toPlain(created);
    },

    async createRedemptionLines(values, options = {}) {
        const VoucherRedemptionLine = dbStore.get('VoucherRedemptionLine');
        const rows = Array.isArray(values) ? values : [values];
        if (rows.length === 0) return [];
        await VoucherRedemptionLine.bulkCreate(rows, { transaction: options.transaction });
        return rows;
    },

    /**
     * #1390: back-links already-written redemption ledger rows to the order they belong to.
     * `pos_transaction_id` has existed on `voucher_redemptions` (and been indexed) since #455, but
     * was written by nothing -- the redemption necessarily happens inside `resolveCheckoutContext`,
     * before the checkout transaction has an order id. A separate write from
     * `createRedemptionLedgerEntry` rather than a param on it, for exactly that reason. Idempotent:
     * a replayed checkout re-sets the same value, and a redemption with `entry_type: 'reversal'`
     * never reaches this call (only fresh/replayed redemption ids are collected at the call site).
     */
    async attachRedemptionsToTransaction(voucherRedemptionIds, posTransactionId, options = {}) {
        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const ids = (Array.isArray(voucherRedemptionIds) ? voucherRedemptionIds : [voucherRedemptionIds])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0);
        const orderId = Number(posTransactionId);
        if (ids.length === 0 || !Number.isInteger(orderId) || orderId <= 0) return 0;

        const [affectedCount] = await VoucherRedemption.update(
            { pos_transaction_id: orderId },
            { where: { voucher_redemption_id: ids }, transaction: options.transaction }
        );
        return affectedCount;
    },

    /**
     * List of a redemption's allocated lines, needed to mirror them (quantities/prices, discount
     * negated) into a reversal's own lines -- not part of the task's explicitly-named repository
     * key list, added because `buildReverseVoucherRedemptionUseCase` has no other way to read what
     * the original redemption actually allocated.
     */
    async listRedemptionLines(voucherRedemptionId, options = {}) {
        const VoucherRedemptionLine = dbStore.get('VoucherRedemptionLine');
        const rows = await VoucherRedemptionLine.findAll({
            where: { voucher_redemption_id: voucherRedemptionId },
            order: [['voucher_redemption_line_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async findRedemptionByIdempotencyKey(key, options = {}) {
        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const normalized = String(key ?? '').trim();
        if (!normalized) return null;
        const row = await VoucherRedemption.findOne({
            where: { idempotency_key: normalized },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findRedemptionById(voucherRedemptionId, options = {}) {
        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const row = await VoucherRedemption.findByPk(voucherRedemptionId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    /**
     * #1390: the read half of `attachRedemptionsToTransaction` -- index-backed on
     * `idx_voucher_redemptions_transaction`, scoped to `channel: 'storefront'` as a cheap, explicit
     * guard against ever reversing a POS-channel redemption through this storefront-only path (no
     * POS writer of this column exists today, but the filter costs nothing and removes the
     * assumption). Ordered ascending by id -- deliberate, not incidental: reversing in a
     * deterministic order is what keeps two concurrent cancels sharing both a delivery and an item
     * voucher from crossing lock order (see the PR's own plan, "Lock ordering").
     */
    async listRedemptionsByTransactionId(posTransactionId, options = {}) {
        const VoucherRedemption = dbStore.get('VoucherRedemption');
        const orderId = Number(posTransactionId);
        if (!Number.isInteger(orderId) || orderId <= 0) return [];
        const rows = await VoucherRedemption.findAll({
            where: { pos_transaction_id: orderId, channel: 'storefront' },
            order: [['voucher_redemption_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    /**
     * Folder-adjacency read feeding `voucherFolderScope.js`'s descendant BFS. Whole-tenant-tree,
     * not scoped to the vouchers's own folder scopes -- the descendant walk needs every folder's
     * `parent_id` to find children regardless of which folders were directly scoped.
     */
    async listItemFolderAdjacency(options = {}) {
        const ItemFolder = dbStore.get('ItemFolder');
        const rows = await ItemFolder.findAll({
            attributes: ['folder_id', 'parent_id'],
            where: { deleted_at: null },
            transaction: options.transaction,
            raw: true
        });
        return rows;
    },

    /**
     * Item -> folder links, scoped to the cart's own item ids only (never a full-table scan) --
     * feeds the same resolver's "which of these items sit under an eligible folder" half.
     */
    async listItemFolderLinksForItems(itemIds, options = {}) {
        const ids = (Array.isArray(itemIds) ? itemIds : [itemIds])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) return [];

        const Item = dbStore.get('Item');
        const rows = await Item.findAll({
            where: { item_id: { [Op.in]: ids } },
            attributes: ['item_id', 'folder_id'],
            transaction: options.transaction,
            raw: true
        });
        return rows;
    },

    // ---------------------------------------------------------------------------------------
    // #696 addition -- the one pricelist read the voucher domain itself needs. Pricelist CRUD/
    // lifecycle lives in its own pricelistRepository.js (a distinct aggregate), but resolving a
    // pricelist-backed voucher's benefit is a voucher-domain concern, so this lookup stays here
    // rather than threading a second repository dependency into voucherRedemptionUseCases.js /
    // voucherDisplayUseCases.js.
    // ---------------------------------------------------------------------------------------

    /**
     * Existence + status only, for `voucherUseCases.js`'s attach-time validation (mirrors
     * `assertScopeRefsExist`'s own existence-only, attach-time-only contract).
     */
    async findPricelistStatus(pricelistId, options = {}) {
        const id = Number(pricelistId);
        if (!Number.isInteger(id) || id <= 0) return null;

        const Pricelist = dbStore.get('Pricelist');
        const row = await Pricelist.findByPk(id, {
            attributes: ['pricelist_id', 'status'],
            transaction: options.transaction,
            // #717: `raw: true` + `lock` don't combine cleanly in every Sequelize/dialect pairing,
            // but `options.lock` was previously dropped here entirely (contrast pricelistRepository.js,
            // which honors it) -- no FOR UPDATE was ever taken on this read despite the redemption
            // path passing `lock: true` in good faith. Locking only matters with a transaction present.
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined,
            raw: true
        });
        return row || null;
    },

    /**
     * `{ [item_id]: unitPriceCentavos }` for every row on a pricelist. The map's keys ARE the
     * eligible item-id set for a pricelist-backed voucher -- when attached, the pricelist is the
     * scope and `voucher_scopes` is not consulted (#696).
     */
    async listPricelistItemPrices(pricelistId, options = {}) {
        const id = Number(pricelistId);
        if (!Number.isInteger(id) || id <= 0) return {};

        const PricelistItem = dbStore.get('PricelistItem');
        const rows = await PricelistItem.findAll({
            where: { pricelist_id: id },
            attributes: ['item_id', 'unit_price_centavos'],
            transaction: options.transaction,
            // #717: same lock-drop as findPricelistStatus above -- the redemption path already
            // builds `{ transaction, lock: true }` (voucherRedemptionUseCases.js) specifically so a
            // concurrent publish (publishDraftIntoParent's delete-and-reinsert) can't shift prices
            // mid-redemption; this method silently discarded that intent.
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined,
            raw: true
        });
        return rows.reduce((map, row) => {
            map[Number(row.item_id)] = Number(row.unit_price_centavos);
            return map;
        }, {});
    }
};

export default voucherRepository;
