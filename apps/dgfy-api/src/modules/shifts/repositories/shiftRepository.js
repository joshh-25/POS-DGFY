// ShiftRepository — Clean Architecture data access adapter for the
// tenant-scoped `shifts` domain (SFT-01/SFT-02), mirroring
// ../../businesses/repositories/locationRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// ../../inventory/repositories/inventoryMovementRepository.js's
// "resolve models via tenantConnector.getModels(databaseName), wrap a
// multi-table write in one sequelize.transaction()" convention.
//
// One-open-shift invariant (D-12/T-08-05-01): the `shifts` table carries a
// DB-generated `active_terminal_cashier_key` column (GENERATED ALWAYS AS
// (...) STORED, 08-01 migration) with a unique index. openShift() wraps its
// INSERT in a transaction and duck-types the resulting MySQL/Sequelize
// unique-constraint violation, rethrowing it as DuplicateOpenShiftError so
// shiftUseCases.js can map it to a clean 409 — never an unhandled 500.
//
// Append-only cash-drawer logging (SFT-03/T-08-05-02): every write path here
// (open/close/no-sale-pop) delegates the actual cash_drawer_events insert to
// the injected cashDrawerEventRepository (this class never writes that table
// directly) — open/close pass a shared `transaction` through so the shift
// row and its event insert commit/rollback atomically together.
export class TenantDatabaseUnavailableError extends Error {
    /**
     * @param {'missing'|'provisioning'|'inactive'|'unverified'|'unreachable'|'not_configured'} reason
     * @param {string} [message]
     */
    constructor(reason, message) {
        super(message || `Tenant database unavailable for this business (${reason}).`);
        this.name = 'TenantDatabaseUnavailableError';
        this.reason = reason;
    }
}

/**
 * Thrown by openShift() when the DB-enforced one-open-shift-per-terminal+
 * cashier unique index (active_terminal_cashier_key, D-12) rejects a second
 * concurrent open shift. Usecases duck-type on
 * `error.name === 'DuplicateOpenShiftError'` and map it to a 409 conflict.
 */
export class DuplicateOpenShiftError extends Error {
    constructor(message) {
        super(message || 'An open shift already exists for this terminal and cashier.');
        this.name = 'DuplicateOpenShiftError';
    }
}

/**
 * Thrown by closeShift()/recordNoSalePop() when shiftId does not resolve to
 * a shift in this business's tenant database. Usecases duck-type on
 * `error.name === 'ShiftNotFoundError'` and map it to a 404.
 */
export class ShiftNotFoundError extends Error {
    constructor(message) {
        super(message || 'Shift not found.');
        this.name = 'ShiftNotFoundError';
    }
}

/**
 * Thrown by closeShift()/recordNoSalePop() when the target shift is already
 * closed. Usecases duck-type on `error.name === 'ShiftNotOpenError'` and map
 * it to a 409 conflict.
 */
export class ShiftNotOpenError extends Error {
    constructor(message) {
        super(message || 'This shift is not open.');
        this.name = 'ShiftNotOpenError';
    }
}

/**
 * Duck-types the MySQL unique-index violation on
 * active_terminal_cashier_key, tolerating both Sequelize's wrapped error
 * shape and a raw mysql2 driver error, per 08-05-PLAN.md's action ("duck-type
 * on error name/code / uniqueness").
 * @param {Error} error
 */
const isUniqueConstraintViolation = (error) => {
    if (!error) return false;
    if (error.name === 'SequelizeUniqueConstraintError') return true;
    if (error.original && (error.original.code === 'ER_DUP_ENTRY' || error.original.errno === 1062)) return true;
    if (error.parent && (error.parent.code === 'ER_DUP_ENTRY' || error.parent.errno === 1062)) return true;
    return false;
};

export class ShiftRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?, cashDrawerEventRepository}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL (mirrors
     *   locationRepository.js's doc comment) so this repository can always
     *   be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     *   `cashDrawerEventRepository` is REQUIRED — this repository never
     *   writes cash_drawer_events itself (single collaborator, mirrors
     *   ADR 0029's single-writer spirit for the ledger surface).
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository, cashDrawerEventRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('ShiftRepository requires a tenantConnector.');
        }
        if (!cashDrawerEventRepository) {
            throw new Error('ShiftRepository requires a cashDrawerEventRepository.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
        this.cashDrawerEventRepository = cashDrawerEventRepository;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * locationRepository.js). Throws TenantDatabaseUnavailableError for
     * every non-writable state.
     * @param {string} businessId
     * @returns {Promise<string>}
     */
    async resolveDatabaseName(businessId) {
        if (!this.businessDatabaseRegistryRepository) {
            throw new TenantDatabaseUnavailableError(
                'not_configured',
                'Tenant database registry is not configured.'
            );
        }

        const registryEntry = await this.businessDatabaseRegistryRepository.findByBusinessId(businessId);
        if (!registryEntry || !registryEntry.database_name) {
            throw new TenantDatabaseUnavailableError(
                'missing',
                'No tenant database is registered for this business.'
            );
        }
        if (registryEntry.status === 'provisioning') {
            throw new TenantDatabaseUnavailableError('provisioning', 'Tenant database is still provisioning.');
        }
        if (registryEntry.status !== 'active') {
            throw new TenantDatabaseUnavailableError('inactive', 'Tenant database is not active.');
        }
        if (!registryEntry.verified_at) {
            throw new TenantDatabaseUnavailableError('unverified', 'Tenant database has not been verified.');
        }

        return registryEntry.database_name;
    }

    /**
     * Resolves the Shift model via TenantConnector.getModels(databaseName)
     * — never a direct model-factory import — mirroring
     * inventoryMovementRepository.js's resolveModel().
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).Shift;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(Shift)` against it. Any error surfaced while resolving the model
     * or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one, a DuplicateOpenShiftError, a ShiftNotFoundError, or a
     * ShiftNotOpenError (never double-wrapped).
     * @param {string} businessId
     * @param {(model: Object) => Promise<any>} fn
     */
    async withModel(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const model = this.resolveModel(databaseName);
            return await fn(model);
        } catch (error) {
            if (
                error instanceof TenantDatabaseUnavailableError
                || error instanceof DuplicateOpenShiftError
                || error instanceof ShiftNotFoundError
                || error instanceof ShiftNotOpenError
            ) {
                throw error;
            }
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Opens a shift (SFT-01). Wraps the shift INSERT and its 'open'
     * cash-drawer event in one sequelize.transaction() (key_link). Catches
     * the MySQL unique-index violation on active_terminal_cashier_key
     * (D-12) and rethrows DuplicateOpenShiftError so the usecase can surface
     * a clean 409 instead of an unhandled 500.
     * @param {string} businessId
     * @param {{terminalId, cashierAccountId, cashierDgfyAccountId?, openingFloatAmount}} input
     */
    async openShift(businessId, { terminalId, cashierAccountId, cashierDgfyAccountId = null, openingFloatAmount }) {
        if (!businessId) throw new Error('ShiftRepository.openShift requires businessId.');

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { Shift } = this.tenantConnector.getModels(databaseName);
            const sequelize = Shift.sequelize;

            return await sequelize.transaction(async (transaction) => {
                let shift;
                try {
                    shift = await Shift.create({
                        business_id: businessId,
                        terminal_id: terminalId,
                        cashier_account_id: cashierAccountId,
                        cashier_dgfy_account_id: cashierDgfyAccountId,
                        status: 'open',
                        opening_float_amount: openingFloatAmount,
                        opened_at: new Date()
                    }, { transaction });
                } catch (createError) {
                    if (isUniqueConstraintViolation(createError)) {
                        throw new DuplicateOpenShiftError();
                    }
                    throw createError;
                }

                await this.cashDrawerEventRepository.create(businessId, {
                    shiftId: shift.id,
                    eventType: 'open',
                    amount: openingFloatAmount,
                    actorStaffAccountId: cashierAccountId
                }, { transaction });

                return this.toPlain(shift);
            });
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            if (error instanceof DuplicateOpenShiftError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Closes an open shift (SFT-02). expectedCashAmount/cashVarianceAmount
     * are pre-computed by the usecase layer (shiftUseCases.js's
     * computeExpectedCash reconciliation helper) — this repository is a pure
     * persistence adapter and does not itself derive the reconciliation
     * math. The guard read is row-locked (`lock: transaction.LOCK.UPDATE`,
     * CR-03) so two concurrent closes of the SAME shift serialize: the
     * second blocks until the first commits, then sees status !== 'open'
     * and is rejected with ShiftNotOpenError, writing NO second 'close'
     * cash-drawer event and losing no reconciliation update. Writes the
     * shift update + a 'close' cash-drawer event in one transaction
     * (key_link).
     * @param {string} businessId
     * @param {number|string} shiftId
     * @param {{closingCashAmount, expectedCashAmount, cashVarianceAmount}} input
     */
    async closeShift(businessId, shiftId, { closingCashAmount, expectedCashAmount, cashVarianceAmount }) {
        if (!businessId) throw new Error('ShiftRepository.closeShift requires businessId.');

        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const { Shift } = this.tenantConnector.getModels(databaseName);
            const sequelize = Shift.sequelize;

            return await sequelize.transaction(async (transaction) => {
                const shift = await Shift.findOne({
                    where: { id: Number(shiftId), business_id: businessId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!shift) throw new ShiftNotFoundError();
                if (shift.status !== 'open') throw new ShiftNotOpenError();

                await shift.update({
                    status: 'closed',
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: cashVarianceAmount,
                    closed_at: new Date()
                }, { transaction });

                await this.cashDrawerEventRepository.create(businessId, {
                    shiftId: shift.id,
                    eventType: 'close',
                    amount: closingCashAmount,
                    actorStaffAccountId: shift.cashier_account_id
                }, { transaction });

                return this.toPlain(shift);
            });
        } catch (error) {
            if (error instanceof TenantDatabaseUnavailableError) throw error;
            if (error instanceof ShiftNotFoundError) throw error;
            if (error instanceof ShiftNotOpenError) throw error;
            throw new TenantDatabaseUnavailableError(
                'unreachable',
                'Unable to reach the tenant database for this business.'
            );
        }
    }

    /**
     * Logs a no-sale drawer pop (SFT-03/T-08-05-02) against an open shift.
     * Does not mutate the shift row itself — a standalone append-only event
     * write, so it does not need to share a transaction with a shift update.
     * @param {string} businessId
     * @param {number|string} shiftId
     * @param {{reason?, actorStaffAccountId?}} [input]
     */
    async recordNoSalePop(businessId, shiftId, { reason = null, actorStaffAccountId = null } = {}) {
        if (!businessId) throw new Error('ShiftRepository.recordNoSalePop requires businessId.');

        return this.withModel(businessId, async (Shift) => {
            const shift = await Shift.findOne({ where: { id: Number(shiftId), business_id: businessId } });
            if (!shift) throw new ShiftNotFoundError();
            if (shift.status !== 'open') {
                throw new ShiftNotOpenError('Cannot log a cash-drawer event against a closed shift.');
            }

            return this.cashDrawerEventRepository.create(businessId, {
                shiftId: shift.id,
                eventType: 'no_sale_pop',
                reason,
                actorStaffAccountId: actorStaffAccountId ?? shift.cashier_account_id
            });
        });
    }

    /**
     * @param {string} businessId
     * @param {number|string} shiftId
     */
    async findById(businessId, shiftId) {
        if (!businessId || shiftId === undefined || shiftId === null) return null;
        return this.withModel(businessId, async (Shift) => {
            const record = await Shift.findOne({ where: { id: Number(shiftId), business_id: businessId } });
            return record ? this.toPlain(record) : null;
        });
    }

    /**
     * @param {string} businessId
     */
    async findAll(businessId) {
        if (!businessId) return [];
        return this.withModel(businessId, async (Shift) => {
            const records = await Shift.findAll({ where: { business_id: businessId }, order: [['id', 'DESC']] });
            return records.map((record) => this.toPlain(record));
        });
    }

    toPlain(model) {
        if (!model) return null;
        const plain = typeof model.get === 'function' ? model.get({ plain: true }) : model;
        return {
            id: plain.id,
            business_id: plain.business_id,
            terminal_id: plain.terminal_id,
            cashier_account_id: plain.cashier_account_id,
            cashier_dgfy_account_id: plain.cashier_dgfy_account_id,
            status: plain.status,
            opening_float_amount: plain.opening_float_amount,
            expected_cash_amount: plain.expected_cash_amount,
            closing_cash_amount: plain.closing_cash_amount,
            cash_variance_amount: plain.cash_variance_amount,
            opened_at: plain.opened_at,
            closed_at: plain.closed_at,
            created_at: plain.created_at,
            updated_at: plain.updated_at
        };
    }
}

/**
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, cashDrawerEventRepository}} [deps]
 * @returns {ShiftRepository}
 */
export const buildShiftRepository = (deps) => new ShiftRepository(deps);

export default ShiftRepository;
