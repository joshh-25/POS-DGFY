// Voucher admin use cases. Every builder takes `{ repository }` so the whole layer is testable
// against a plain in-memory fake -- the pattern `dgfyAffiliateUseCases.js` already uses.
//
// Contract: each use case returns an `ApplicationResult` (`ok`/`fail`) and never throws past its own
// boundary; the domain helpers in `../domain/voucherErrors.js` throw `DomainError`s that are caught
// here and converted, so the HTTP layer stays a `sendUseCaseResult` one-liner.

import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { DEFAULT_VOUCHER_TIMEZONE, deriveVoucherStatus } from '../domain/voucherEligibilityPolicy.js';
import {
    VoucherReasonCode,
    voucherConflict,
    voucherError,
    voucherNotFound
} from '../domain/voucherErrors.js';

/**
 * The voucher status machine.
 *
 * `expired` is derived, never client-settable -- it is reachable only through lazy expiry, and
 * `expired -> active` is legal (reactivating a campaign whose `valid_until` a prior PUT moved
 * forward). `archived` is terminal: every write to an archived voucher is a 409, which is also why
 * there is no DELETE endpoint -- `voucher_redemptions.voucher_id` has no `onDelete`, and the ledger's
 * parent campaign row has to survive for the redemption history to stay auditable.
 */
export const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
    draft: Object.freeze(['active', 'archived']),
    active: Object.freeze(['paused', 'archived']),
    paused: Object.freeze(['active', 'archived']),
    expired: Object.freeze(['active', 'archived']),
    archived: Object.freeze([])
});

const WRITABLE_VOUCHER_COLUMNS = Object.freeze([
    'code',
    'voucher_kind',
    'title',
    'subtitle',
    'badge',
    'validity_text',
    'benefit_class',
    'percent_off_bps',
    'amount_off_centavos',
    'fixed_unit_price_centavos',
    // #696: fixed_price carries EITHER fixed_unit_price_centavos above OR this, never both -- see
    // applyBenefitConfig. The update path writes every allowlisted column with `?? null`
    // (buildUpdateVoucherUseCase, below), so including it here is also what makes "detach the
    // pricelist" expressible on a PUT.
    'pricelist_id',
    'max_discount_centavos',
    'min_spend_centavos',
    'min_quantity',
    'allow_below_cost',
    'stackable_with_statutory',
    // #713: a plain boolean, like the two flags above -- not in NUMERIC_VOUCHER_COLUMNS below,
    // which is specifically for MySQL's BIGINT-returned-as-string normalization.
    'is_publicly_listed',
    'valid_from',
    'valid_until',
    'valid_time_start',
    'valid_time_end',
    'weekday_mask',
    'channels_mask',
    'fulfillment_methods_mask',
    'order_timings_mask',
    'max_redemptions',
    'max_total_discount_centavos',
    'max_benefit_quantity'
]);

const BENEFIT_COLUMNS = Object.freeze({
    percent_off: 'percent_off_bps',
    amount_off: 'amount_off_centavos',
    fixed_price: 'fixed_unit_price_centavos'
});

// MySQL returns BIGINT as a string. Normalizing here means the API answers with numbers and the
// eligibility policy never has to guess whether it is comparing a string to a number.
const NUMERIC_VOUCHER_COLUMNS = Object.freeze([
    'voucher_id',
    'percent_off_bps',
    'amount_off_centavos',
    'fixed_unit_price_centavos',
    'pricelist_id',
    'max_discount_centavos',
    'min_spend_centavos',
    'min_quantity',
    'weekday_mask',
    'channels_mask',
    'fulfillment_methods_mask',
    'order_timings_mask',
    'max_redemptions',
    'max_total_discount_centavos',
    'max_benefit_quantity',
    'redeemed_count',
    'redeemed_value_centavos',
    'redeemed_quantity',
    'version'
]);

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();

const normalizeNumerics = (voucher) => {
    const normalized = { ...voucher };
    NUMERIC_VOUCHER_COLUMNS.forEach((column) => {
        if (normalized[column] === null || normalized[column] === undefined) return;
        const numeric = Number(normalized[column]);
        if (Number.isFinite(numeric)) normalized[column] = numeric;
    });
    return normalized;
};

const presentVoucher = (voucher, { now, timezone }) => {
    if (!voucher) return null;
    const normalized = normalizeNumerics(voucher);
    return {
        ...normalized,
        derived_status: deriveVoucherStatus({ voucher: normalized, now, timezone })
    };
};

const presentScope = (scope) => ({
    voucher_scope_id: scope.voucher_scope_id,
    voucher_id: scope.voucher_id,
    scope_type: scope.scope_type,
    scope_ref_id: Number(scope.scope_ref_id)
});

const pickWritableColumns = (payload = {}) => WRITABLE_VOUCHER_COLUMNS.reduce((accumulator, column) => {
    if (Object.prototype.hasOwnProperty.call(payload, column)) {
        accumulator[column] = payload[column];
    }
    return accumulator;
}, {});

const toDateOnly = (value) => {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    const text = String(value).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/**
 * Assert the benefit configuration is internally consistent, and null out the columns that do not
 * belong to the resulting `benefit_class`.
 *
 * Runs against the MERGED row (existing values plus the patch), not the patch alone -- a PUT that
 * flips `benefit_class` without resending the matching amount would otherwise leave a percent-off
 * voucher carrying only a `fixed_unit_price_centavos`.
 *
 * #696: `fixed_price` is the one benefit class with two mutually-exclusive ways to express a price
 * -- the original single `fixed_unit_price_centavos` scalar, or a `pricelist_id` (N prices for N
 * items). This is the single choke point for that XOR, same as it already is for the base
 * benefit-column validation: re-run on create, update, AND activation (`assertActivationAllowed`
 * below), so a PUT or an activate cannot leave a voucher with both, or neither.
 */
const applyBenefitConfig = (merged) => {
    const benefitClass = merged.benefit_class;
    const requiredColumn = BENEFIT_COLUMNS[benefitClass];
    if (!requiredColumn) {
        voucherError(
            `Unknown voucher benefit class: ${benefitClass}`,
            VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID,
            { benefit_class: benefitClass ?? null }
        );
    }

    const applied = { ...merged };
    Object.values(BENEFIT_COLUMNS).forEach((column) => {
        if (column !== requiredColumn) applied[column] = null;
    });
    // A percentage-of-subtotal cap on an already-absolute amount is meaningless; the schema allows it,
    // so this is where it is refused.
    if (benefitClass === 'amount_off') applied.max_discount_centavos = null;

    if (benefitClass !== 'fixed_price') {
        // pricelist_id is fixed_price-only; any other class carrying one is stale data from a prior
        // benefit_class switch, cleared the same way the other benefit columns above already are.
        applied.pricelist_id = null;

        const value = merged[requiredColumn];
        const numeric = Number(value);
        const missing = value == null || !Number.isFinite(numeric);
        if (missing || numeric <= 0) {
            voucherError(
                `${benefitClass} vouchers require a valid ${requiredColumn}.`,
                VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID,
                { benefit_class: benefitClass, [requiredColumn]: value ?? null }
            );
        }
        return applied;
    }

    const scalarValue = merged.fixed_unit_price_centavos;
    const hasScalar = scalarValue != null && Number.isFinite(Number(scalarValue));
    const hasPricelist = merged.pricelist_id != null;

    if (hasScalar && hasPricelist) {
        voucherError(
            'fixed_price vouchers cannot carry both fixed_unit_price_centavos and pricelist_id.',
            VoucherReasonCode.VOUCHER_PRICELIST_CONFLICT,
            { fixed_unit_price_centavos: scalarValue, pricelist_id: merged.pricelist_id }
        );
    }
    if (!hasScalar && !hasPricelist) {
        voucherError(
            'fixed_price vouchers require either fixed_unit_price_centavos or pricelist_id.',
            VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID,
            { benefit_class: benefitClass, fixed_unit_price_centavos: null, pricelist_id: null }
        );
    }
    // fixed_price legitimately allows a scalar of 0 (a giveaway); a pricelist's own rows are
    // validated per-item elsewhere (pricelistUseCases.js), not here.
    if (hasScalar && Number(scalarValue) < 0) {
        voucherError(
            'fixed_price vouchers require a valid fixed_unit_price_centavos.',
            VoucherReasonCode.VOUCHER_BENEFIT_CONFIG_INVALID,
            { benefit_class: benefitClass, fixed_unit_price_centavos: scalarValue }
        );
    }

    applied.fixed_unit_price_centavos = hasScalar ? scalarValue : null;
    applied.pricelist_id = hasPricelist ? merged.pricelist_id : null;
    return applied;
};

const assertValidityInvariants = (merged) => {
    const validFrom = toDateOnly(merged.valid_from);
    const validUntil = toDateOnly(merged.valid_until);
    if (validFrom && validUntil && validUntil < validFrom) {
        voucherError(
            'valid_until cannot be earlier than valid_from.',
            VoucherReasonCode.VOUCHER_VALIDITY_WINDOW_INVALID,
            { valid_from: validFrom, valid_until: validUntil }
        );
    }

    const start = merged.valid_time_start ?? null;
    const end = merged.valid_time_end ?? null;
    if ((start == null) !== (end == null)) {
        voucherError(
            'valid_time_start and valid_time_end must be set together or both left empty.',
            VoucherReasonCode.VOUCHER_TIME_WINDOW_INCOMPLETE,
            { valid_time_start: start, valid_time_end: end }
        );
    }
    if (start != null && end != null && start === end) {
        voucherError(
            'valid_time_start and valid_time_end cannot be equal.',
            VoucherReasonCode.VOUCHER_TIME_WINDOW_DEGENERATE,
            { valid_time_start: start, valid_time_end: end }
        );
    }
};

/**
 * #696: a pricelist-backed voucher needs no `voucher_scopes` rows -- the pricelist's own item rows
 * ARE the scope. `pricelistId` is `applyBenefitConfig`'s already-resolved value (never both a
 * pricelist and a scalar price at this point), so this check runs after that one.
 */
const assertFixedPriceHasScope = (benefitClass, scopes, pricelistId = null) => {
    if (benefitClass !== 'fixed_price') return;
    if (pricelistId != null) return;
    if (Array.isArray(scopes) && scopes.length > 0) return;
    voucherError(
        'fixed_price vouchers require at least one item or item folder scope, or an attached pricelist.',
        VoucherReasonCode.VOUCHER_FIXED_PRICE_REQUIRES_SCOPE
    );
};

const assertScopeRefs = async (repository, scopes, transaction) => {
    if (!Array.isArray(scopes) || scopes.length === 0) return;
    const { missing } = await repository.assertScopeRefsExist(scopes, { transaction });
    if (missing.length > 0) {
        voucherError(
            'One or more voucher scope references do not exist.',
            VoucherReasonCode.VOUCHER_SCOPE_REF_NOT_FOUND,
            { missing }
        );
    }
};

/**
 * #696: validate a voucher's `pricelist_id` reference the same way `assertScopeRefs` validates
 * scope references -- inside the transaction, before the write, so a bad reference rolls the whole
 * create/update back. A voucher may only attach an `active` pricelist: `draft` rows may be
 * mid-autosave, and `archived` ones are retired. Checked here at attach-time, matching
 * `assertScopeRefsExist`'s own attach-time-only contract -- but #717 ALSO re-checks status at use
 * time now (voucherRedemptionUseCases.js, fail-closed; voucherDisplayUseCases.js, fail-open), so a
 * pricelist archived after a voucher already attached it is no longer silently honored forever.
 */
const assertPricelistRef = async (repository, pricelistId, transaction) => {
    if (pricelistId == null) return;
    const row = await repository.findPricelistStatus(pricelistId, { transaction });
    if (!row) {
        voucherError(
            'The referenced pricelist does not exist.',
            VoucherReasonCode.VOUCHER_PRICELIST_REF_NOT_FOUND,
            { pricelist_id: pricelistId }
        );
    }
    if (row.status !== 'active') {
        voucherError(
            'A voucher may only attach an active pricelist.',
            VoucherReasonCode.VOUCHER_PRICELIST_NOT_ACTIVE,
            { pricelist_id: pricelistId, status: row.status }
        );
    }
};

const buildRedemptionStats = (voucher, stats) => {
    const ledger = stats || {
        redemption_count: 0,
        total_discount_centavos: 0,
        total_benefit_quantity: 0,
        last_redeemed_at: null
    };
    const cached = {
        redeemed_count: Number(voucher.redeemed_count ?? 0),
        redeemed_value_centavos: Number(voucher.redeemed_value_centavos ?? 0),
        redeemed_quantity: Number(voucher.redeemed_quantity ?? 0)
    };
    return {
        ...ledger,
        cached,
        // ADR 0066 decision 4: the ledger is authoritative and `redeemed_*` is a derived cache, so
        // this is a reconciliation signal, not an error condition. It compares raw ledger sums against
        // the cache, which means `false` is EXPECTED once reversal/adjustment rows exist -- Phase 105
        // owns those sign conventions. Informational until then.
        cache_in_sync: ledger.redemption_count === cached.redeemed_count
            && ledger.total_discount_centavos === cached.redeemed_value_centavos
            && ledger.total_benefit_quantity === cached.redeemed_quantity
    };
};

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

/**
 * Lazy expiry: materialize `expired` for any row whose `valid_until` has elapsed while it was still
 * stored `active`. One guarded UPDATE for the whole page, so list and get responses stay honest
 * without a cron job. The guard (`WHERE status = 'active'`) makes it idempotent.
 */
const materializeExpiry = async (repository, vouchers, { now, timezone, transaction } = {}) => {
    const expiredIds = vouchers
        .filter((voucher) => voucher.status === 'active'
            && deriveVoucherStatus({ voucher, now, timezone }) === 'expired')
        .map((voucher) => voucher.voucher_id);

    if (expiredIds.length === 0) return vouchers;

    await repository.markExpired(expiredIds, { transaction });

    const expiredIdSet = new Set(expiredIds);
    return vouchers.map((voucher) => (
        expiredIdSet.has(voucher.voucher_id)
            ? { ...voucher, status: 'expired', version: Number(voucher.version ?? 0) + 1 }
            : voucher
    ));
};

export const buildListVouchersUseCase = ({ repository }) => async ({
    query = {},
    now = new Date(),
    timezone = DEFAULT_VOUCHER_TIMEZONE
} = {}) => {
    try {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

        const { rows, count } = await repository.listVouchers(
            {
                status: query.status,
                benefit_class: query.benefit_class,
                voucher_kind: query.voucher_kind,
                search: query.search
            },
            { page, limit, sort: query.sort, direction: query.direction }
        );

        const refreshed = await materializeExpiry(repository, rows, { now, timezone });

        let statsByVoucherId = {};
        if (query.include_stats === true) {
            statsByVoucherId = await repository.getRedemptionStats(refreshed.map((row) => row.voucher_id));
        }

        const vouchers = refreshed.map((row) => {
            const presented = presentVoucher(row, { now, timezone });
            if (query.include_stats !== true) return presented;
            return {
                ...presented,
                redemption_stats: buildRedemptionStats(row, statsByVoucherId[row.voucher_id])
            };
        });

        return ok({
            vouchers,
            pagination: {
                page,
                limit,
                total: count,
                total_pages: limit > 0 ? Math.ceil(count / limit) : 0
            }
        });
    } catch (error) {
        return toFailure(error, 'Failed to list vouchers');
    }
};

export const buildGetVoucherUseCase = ({ repository }) => async ({
    voucherId,
    now = new Date(),
    timezone = DEFAULT_VOUCHER_TIMEZONE
} = {}) => {
    try {
        const stored = await repository.findById(voucherId);
        if (!stored) voucherNotFound('Voucher not found', { voucher_id: voucherId });

        const [refreshed] = await materializeExpiry(repository, [stored], { now, timezone });
        const [scopes, statsByVoucherId] = await Promise.all([
            repository.listScopes([refreshed.voucher_id]),
            repository.getRedemptionStats([refreshed.voucher_id])
        ]);

        return ok({
            voucher: presentVoucher(refreshed, { now, timezone }),
            scopes: scopes.map(presentScope),
            redemption_stats: buildRedemptionStats(refreshed, statsByVoucherId[refreshed.voucher_id])
        });
    } catch (error) {
        return toFailure(error, 'Failed to retrieve voucher');
    }
};

export const buildCreateVoucherUseCase = ({ repository }) => async ({
    payload = {},
    now = new Date(),
    timezone = DEFAULT_VOUCHER_TIMEZONE
} = {}) => {
    let transaction = null;
    try {
        const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
        const values = pickWritableColumns(payload);
        values.code = normalizeCode(values.code);

        assertValidityInvariants(values);
        assertFixedPriceHasScope(values.benefit_class, scopes, values.pricelist_id);
        const preparedValues = applyBenefitConfig(values);

        transaction = await repository.beginTransaction();

        // Pre-check for the clean error in the common (non-race) case. `uq_vouchers_code` is still the
        // real guarantee -- `createVoucher` translates that violation into the same 409.
        const existing = await repository.findByCode(preparedValues.code, { transaction });
        if (existing) {
            voucherConflict(
                'A voucher with this code already exists.',
                VoucherReasonCode.VOUCHER_CODE_ALREADY_EXISTS,
                { code: preparedValues.code }
            );
        }

        // Scope and pricelist references are validated INSIDE the transaction and BEFORE the write,
        // so a bad reference rolls the whole create back rather than leaving a half-scoped voucher.
        await assertScopeRefs(repository, scopes, transaction);
        await assertPricelistRef(repository, preparedValues.pricelist_id, transaction);

        const created = await repository.createVoucher(preparedValues, { transaction });
        if (scopes.length > 0) {
            await repository.replaceScopes(created.voucher_id, scopes, { transaction });
        }
        const persistedScopes = await repository.listScopes([created.voucher_id], { transaction });

        await transaction.commit();
        transaction = null;

        return ok({
            voucher: presentVoucher(created, { now, timezone }),
            scopes: persistedScopes.map(presentScope)
        });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to create voucher');
    }
};

export const buildUpdateVoucherUseCase = ({ repository }) => async ({
    voucherId,
    payload = {},
    now = new Date(),
    timezone = DEFAULT_VOUCHER_TIMEZONE
} = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        const stored = await repository.findById(voucherId, { transaction, lock: true });
        if (!stored) voucherNotFound('Voucher not found', { voucher_id: voucherId });

        if (stored.status === 'archived') {
            voucherConflict(
                'Archived vouchers cannot be modified.',
                VoucherReasonCode.VOUCHER_ARCHIVED_IMMUTABLE,
                { voucher_id: stored.voucher_id }
            );
        }

        const expectedVersion = Number(payload.version);
        if (expectedVersion !== Number(stored.version)) {
            voucherConflict(
                'Voucher was modified by someone else. Reload and try again.',
                VoucherReasonCode.VOUCHER_VERSION_CONFLICT,
                { expected_version: expectedVersion, current_version: Number(stored.version) }
            );
        }

        const patch = pickWritableColumns(payload);

        // `code` is immutable once a voucher has left draft or has been redeemed even once: the code
        // is snapshotted into every ledger row and is distributed out of band (print, SMS, social), so
        // rewriting it retroactively divorces the ledger from the campaign and silently re-points a
        // code someone is already holding.
        if (Object.prototype.hasOwnProperty.call(patch, 'code')) {
            const nextCode = normalizeCode(patch.code);
            const codeIsMutable = stored.status === 'draft' && Number(stored.redeemed_count ?? 0) === 0;
            if (nextCode !== normalizeCode(stored.code) && !codeIsMutable) {
                voucherError(
                    'Voucher code can only be changed while the voucher is a draft with no redemptions.',
                    VoucherReasonCode.VOUCHER_CODE_IMMUTABLE,
                    { status: stored.status, redeemed_count: Number(stored.redeemed_count ?? 0) }
                );
            }
            patch.code = nextCode;
        }

        const merged = { ...stored, ...patch };
        assertValidityInvariants(merged);

        const scopesProvided = Object.prototype.hasOwnProperty.call(payload, 'scopes');
        const nextScopes = scopesProvided
            ? (Array.isArray(payload.scopes) ? payload.scopes : [])
            : (await repository.listScopes([stored.voucher_id], { transaction }));

        assertFixedPriceHasScope(merged.benefit_class, nextScopes, merged.pricelist_id);
        const preparedMerged = applyBenefitConfig(merged);

        // Only the columns this request may write are handed to the UPDATE -- never the merged row,
        // which would echo back server-owned counters.
        const values = WRITABLE_VOUCHER_COLUMNS.reduce((accumulator, column) => {
            accumulator[column] = preparedMerged[column] ?? null;
            return accumulator;
        }, {});

        if (scopesProvided) {
            await assertScopeRefs(repository, nextScopes, transaction);
            await repository.replaceScopes(stored.voucher_id, nextScopes, { transaction });
        }
        await assertPricelistRef(repository, preparedMerged.pricelist_id, transaction);

        const affected = await repository.updateVoucherWithVersion(
            stored.voucher_id,
            values,
            expectedVersion,
            { transaction }
        );
        if (affected === 0) {
            voucherConflict(
                'Voucher was modified by someone else. Reload and try again.',
                VoucherReasonCode.VOUCHER_VERSION_CONFLICT,
                { expected_version: expectedVersion }
            );
        }

        const updated = await repository.findById(stored.voucher_id, { transaction });
        const persistedScopes = await repository.listScopes([stored.voucher_id], { transaction });

        await transaction.commit();
        transaction = null;

        return ok({
            voucher: presentVoucher(updated, { now, timezone }),
            scopes: persistedScopes.map(presentScope)
        });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, 'Failed to update voucher');
    }
};

/**
 * Activation guards, re-checked at activate time rather than trusted from creation: a PUT can strip
 * the last scope off a draft `fixed_price` voucher, or leave its `valid_until` in the past.
 */
const assertActivationAllowed = ({ voucher, scopes, now, timezone }) => {
    applyBenefitConfig(voucher);
    assertFixedPriceHasScope(voucher.benefit_class, scopes, voucher.pricelist_id);

    const validUntil = toDateOnly(voucher.valid_until);
    if (!validUntil) return;

    const today = deriveVoucherStatus({
        voucher: { status: 'active', valid_until: validUntil },
        now,
        timezone
    });
    if (today === 'expired') {
        voucherError(
            'Voucher cannot be activated because its validity window has already elapsed. Move valid_until forward first.',
            VoucherReasonCode.VOUCHER_VALIDITY_WINDOW_ELAPSED,
            { valid_until: validUntil }
        );
    }
};

const buildTransitionUseCase = ({ repository, targetStatus, failureMessage }) => async ({
    voucherId,
    now = new Date(),
    timezone = DEFAULT_VOUCHER_TIMEZONE
} = {}) => {
    let transaction = null;
    try {
        transaction = await repository.beginTransaction();

        let stored = await repository.findById(voucherId, { transaction, lock: true });
        if (!stored) voucherNotFound('Voucher not found', { voucher_id: voucherId });

        if (stored.status === 'archived') {
            voucherConflict(
                'Archived vouchers cannot be modified.',
                VoucherReasonCode.VOUCHER_ARCHIVED_IMMUTABLE,
                { voucher_id: stored.voucher_id }
            );
        }

        // Materialize lazy expiry first, so the transition is evaluated against the status the
        // voucher actually has rather than a stale `active`.
        if (deriveVoucherStatus({ voucher: stored, now, timezone }) === 'expired') {
            await repository.markExpired([stored.voucher_id], { transaction });
            stored = await repository.findById(stored.voucher_id, { transaction, lock: true });
        }

        const fromStatus = stored.status;
        const allowed = ALLOWED_STATUS_TRANSITIONS[fromStatus] || [];
        if (!allowed.includes(targetStatus)) {
            voucherConflict(
                `Voucher cannot move from ${fromStatus} to ${targetStatus}.`,
                VoucherReasonCode.VOUCHER_INVALID_STATUS_TRANSITION,
                { from: fromStatus, to: targetStatus, allowed: [...allowed] }
            );
        }

        if (targetStatus === 'active') {
            const scopes = await repository.listScopes([stored.voucher_id], { transaction });
            assertActivationAllowed({ voucher: stored, scopes, now, timezone });
        }

        const affected = await repository.updateVoucherWithVersion(
            stored.voucher_id,
            { status: targetStatus },
            Number(stored.version),
            { transaction }
        );
        if (affected === 0) {
            voucherConflict(
                'Voucher was modified by someone else. Reload and try again.',
                VoucherReasonCode.VOUCHER_VERSION_CONFLICT,
                { expected_version: Number(stored.version) }
            );
        }

        const updated = await repository.findById(stored.voucher_id, { transaction });
        const persistedScopes = await repository.listScopes([stored.voucher_id], { transaction });

        await transaction.commit();
        transaction = null;

        return ok({
            voucher: presentVoucher(updated, { now, timezone }),
            scopes: persistedScopes.map(presentScope)
        });
    } catch (error) {
        await rollbackQuietly(transaction);
        return toFailure(error, failureMessage);
    }
};

export const buildActivateVoucherUseCase = ({ repository }) => buildTransitionUseCase({
    repository,
    targetStatus: 'active',
    failureMessage: 'Failed to activate voucher'
});

export const buildPauseVoucherUseCase = ({ repository }) => buildTransitionUseCase({
    repository,
    targetStatus: 'paused',
    failureMessage: 'Failed to pause voucher'
});

export const buildArchiveVoucherUseCase = ({ repository }) => buildTransitionUseCase({
    repository,
    targetStatus: 'archived',
    failureMessage: 'Failed to archive voucher'
});
