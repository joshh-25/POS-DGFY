// AvailmentRepository — Clean Architecture data access adapter for the
// tenant-scoped `availments` domain (CHK-01..CHK-06, D-01..D-09, D-15..D-17),
// mirroring ../../inventory/repositories/inventoryMovementRepository.js's
// TenantDatabaseUnavailableError/resolveDatabaseName/withModel scaffold and
// ../../shifts/repositories/shiftRepository.js's multi-table transaction pattern.
//
// This repository owns all Sequelize access for availments + availment_items
// + availment_discounts + payments + receipts. The finalizePersist() method
// is the sole write path that touches all four tables atomically in one
// sequelize.transaction(), invokes the injected recordSaleEffect for each
// inventory_issue line, and row-locks the availment to prevent double-finalize.
//
// Line mutation: soft-delete via cancelled_at; never hard-delete (D-02/D-18).
//
// Phase 11 (11-03-PLAN.md, D-05/D-06): both finalize methods now accept an
// OPTIONAL `recordStageEvents` port — the fulfillment module's
// stageEventRepository.bulkCreate, injected at the composition root
// (apps/dgfy-api/src/routes/index.js), never imported directly here (this
// repository must never import modules/fulfillment, Pitfall 4). When
// supplied, the stage-event write happens INSIDE the same
// sequelize.transaction() as the finalize itself — a thrown/rejected
// recordStageEvents call rolls back the whole transaction, mirroring the
// recordSaleEffect non-success-THROWs-to-rollback precedent below
// (Pitfall 2). The per-mode stage sequence is duplicated here (not imported
// from modules/fulfillment/usecases/fulfillmentUseCases.js's
// STAGE_SEQUENCES) for the same Pitfall-4 reason — this is the D-15 canonical
// stage list, kept in lockstep by convention/tests, not by a shared import.
const FINALIZE_STAGE_SEQUENCES = Object.freeze({
    pickup: Object.freeze(['placed', 'confirmed', 'preparing', 'ready', 'completed']),
    dine_in: Object.freeze(['placed', 'confirmed', 'preparing', 'ready', 'completed']),
    delivery: Object.freeze(['placed', 'confirmed', 'preparing', 'out_for_delivery', 'completed'])
});

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
 * Thrown by findById/updateLine/cancelLine/restoreLine when availmentId does
 * not resolve to an existing availment. Usecases duck-type on
 * `error.name === 'AvailmentNotFoundError'` and map it to a 404.
 */
export class AvailmentNotFoundError extends Error {
    constructor(message) {
        super(message || 'Availment not found.');
        this.name = 'AvailmentNotFoundError';
    }
}

/**
 * Thrown by finalizePersist() when the availment is already finalized or
 * otherwise not in a valid state for finalization. Usecases duck-type on
 * `error.name === 'AvailmentFinalizedError'` and map it to a 409 conflict.
 */
export class AvailmentFinalizedError extends Error {
    constructor(message) {
        super(message || 'This availment is already finalized.');
        this.name = 'AvailmentFinalizedError';
    }
}

/**
 * Thrown by addLine/updateLine/cancelLine/restoreLine when lineId does not
 * resolve to an existing line on the availment. Usecases duck-type on
 * `error.name === 'AvailmentLineNotFoundError'` and map it to a 404.
 */
export class AvailmentLineNotFoundError extends Error {
    constructor(message) {
        super(message || 'Availment line not found.');
        this.name = 'AvailmentLineNotFoundError';
    }
}

/**
 * Thrown by finalizePersist() when no open shift exists for the cashier and
 * terminal (CHK-06, D-16). Usecases duck-type on `error.name === 'NoOpenShiftError'`
 * and map it to a 409 conflict.
 */
export class NoOpenShiftError extends Error {
    constructor(message) {
        super(message || 'No open shift found for this cashier and terminal.');
        this.name = 'NoOpenShiftError';
    }
}

/**
 * WR-05 fix (09-REVIEW.md): thrown by recordDiscount() when the availment
 * already has an sc_pwd discount row and a second one is attempted.
 * availment_discounts is an append-only table (no cancelled_at/soft-delete
 * concept like availment_items), so any existing sc_pwd row is a permanent
 * block — nothing prevented two (or more) sc_pwd rows from independently
 * discounting the net base before this check, bounded only by the overall
 * Math.min/Math.max cap in computeAvailmentTotals. Usecases duck-type on
 * `error.name === 'DuplicateScPwdDiscountError'` and map it to a 409
 * conflict.
 */
export class DuplicateScPwdDiscountError extends Error {
    constructor(message) {
        super(message || 'This availment already has an SC/PWD discount applied.');
        this.name = 'DuplicateScPwdDiscountError';
    }
}

export class AvailmentRepository {
    /**
     * @param {{tenantConnector, businessDatabaseRegistryRepository?}} deps -
     *   `businessDatabaseRegistryRepository` is OPTIONAL so this repository can
     *   always be constructed; every operation fails closed with
     *   TenantDatabaseUnavailableError('not_configured', ...) when it is
     *   omitted, instead of throwing at construction time.
     */
    constructor({ tenantConnector, businessDatabaseRegistryRepository } = {}) {
        if (!tenantConnector) {
            throw new Error('AvailmentRepository requires a tenantConnector.');
        }
        this.tenantConnector = tenantConnector;
        this.businessDatabaseRegistryRepository = businessDatabaseRegistryRepository || null;
    }

    /**
     * Resolves businessId to a tenant `database_name`, requiring the
     * registry row to be active AND verified (mirrors
     * inventoryMovementRepository.js / productRepository.js).
     * Throws TenantDatabaseUnavailableError for every non-writable state.
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
     * Resolves the Availment model via tenantConnector.getModels(databaseName)
     * — never a direct model-factory import.
     */
    resolveModel(databaseName) {
        return this.tenantConnector.getModels(databaseName).Availment;
    }

    /**
     * Resolves businessId's active/verified tenant database, then runs
     * `fn(Availment, databaseName)` against it. Any error surfaced while
     * resolving the model or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one of the known domain errors (never double-wrapped).
     *
     * WR-04 fix (09-REVIEW.md): `databaseName` is passed to `fn` so callers
     * that need sibling models (AvailmentItem, AvailmentDiscount, etc.) can
     * derive them via `this.tenantConnector.getModels(databaseName)`
     * directly, instead of calling `this.resolveDatabaseName(businessId)` a
     * SECOND time inside the callback — a redundant extra registry lookup
     * on every write path whose result was not guaranteed to observe the
     * same registry state as the first lookup above.
     * @param {string} businessId
     * @param {(model: Object, databaseName: string) => Promise<any>} fn
     */
    async withModel(businessId, fn) {
        const databaseName = await this.resolveDatabaseName(businessId);
        try {
            const model = this.resolveModel(databaseName);
            return await fn(model, databaseName);
        } catch (error) {
            if (
                error instanceof TenantDatabaseUnavailableError
                || error instanceof AvailmentNotFoundError
                || error instanceof AvailmentFinalizedError
                || error instanceof AvailmentLineNotFoundError
                || error instanceof NoOpenShiftError
                || error instanceof DuplicateScPwdDiscountError
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
     * Creates a new draft availment (CHK-01, D-01).
     * @param {string} businessId
     * @param {{branchId, customerAccountId, cashierAccountId, cashierDgfyAccountId, terminalId}} input
     * @returns {Promise<Object>} Plain availment row
     */
    async createAvailment(businessId, {
        branchId, customerAccountId, cashierAccountId, cashierDgfyAccountId, terminalId
    } = {}) {
        if (!businessId) throw new Error('AvailmentRepository.createAvailment requires businessId.');

        return this.withModel(businessId, async (Availment) => {
            const availment = await Availment.create({
                business_id: businessId,
                branch_id: branchId,
                customer_account_id: customerAccountId,
                cashier_account_id: cashierAccountId,
                cashier_dgfy_account_id: cashierDgfyAccountId,
                terminal_id: terminalId,
                status: 'draft',
                subtotal_amount: '0.0000',
                discount_amount: '0.0000',
                vat_amount: '0.0000',
                vat_exempt_amount: '0.0000',
                total_amount: '0.0000'
            });
            return this.toPlain(availment);
        });
    }

    /**
     * Finds an availment by ID, including all its items (both non-cancelled
     * and cancelled for audit), discounts, and payments (CHK-01, D-02/D-18).
     * @param {string} businessId
     * @param {number|string} availmentId
     * @returns {Promise<Object>} Plain availment row with nested items/discounts/payments
     */
    async findById(businessId, availmentId) {
        if (!businessId) throw new Error('AvailmentRepository.findById requires businessId.');

        return this.withModel(businessId, async (Availment) => {
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId },
                include: [
                    { association: 'items' },
                    { association: 'discounts' },
                    { association: 'payments' }
                ]
            });
            if (!availment) throw new AvailmentNotFoundError();
            return this.toPlain(availment);
        });
    }

    /**
     * Adds a line item to an availment (CHK-01, D-01/D-03).
     * Rejects if the availment is already finalized.
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {{productId, productName, quantity, unitPrice, stockEffectType, taxTreatment, taxRate}} input
     * @returns {Promise<Object>} Plain availment_items row
     */
    async addLine(businessId, availmentId, {
        productId, productName, quantity, unitPrice, stockEffectType = 'inventory_issue',
        taxTreatment = 'vatable', taxRate = '0.1200'
    } = {}) {
        if (!businessId) throw new Error('AvailmentRepository.addLine requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentItem } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

            const line = await AvailmentItem.create({
                business_id: businessId,
                availment_id: Number(availmentId),
                product_id: productId,
                product_name: productName,
                quantity,
                unit_price: unitPrice,
                stock_effect_type: stockEffectType,
                tax_treatment: taxTreatment,
                tax_rate: taxRate
            });
            return this.toPlainLine(line);
        });
    }

    /**
     * Updates a line's quantity and/or stock_effect_type (CHK-01, D-01/D-03).
     * Rejects if the availment is finalized or the line doesn't exist.
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {number|string} lineId
     * @param {{quantity?, stockEffectType?}} input
     * @returns {Promise<Object>} Plain updated availment_items row
     */
    async updateLine(businessId, availmentId, lineId, { quantity, stockEffectType } = {}) {
        if (!businessId) throw new Error('AvailmentRepository.updateLine requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentItem } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

            const line = await AvailmentItem.findOne({
                where: { id: Number(lineId), availment_id: Number(availmentId), business_id: businessId }
            });
            if (!line) throw new AvailmentLineNotFoundError();

            const updatePayload = {};
            if (quantity !== undefined) updatePayload.quantity = quantity;
            if (stockEffectType !== undefined) updatePayload.stock_effect_type = stockEffectType;

            await line.update(updatePayload);
            return this.toPlainLine(line);
        });
    }

    /**
     * Soft-deletes a line by setting cancelled_at (D-02/D-18).
     * This is the sole line-removal method; restoreLine() is the undo.
     * Rejects if the availment is finalized or the line doesn't exist.
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {number|string} lineId
     * @returns {Promise<Object>} Plain updated availment_items row with cancelled_at set
     */
    async cancelLine(businessId, availmentId, lineId) {
        if (!businessId) throw new Error('AvailmentRepository.cancelLine requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentItem } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

            const line = await AvailmentItem.findOne({
                where: { id: Number(lineId), availment_id: Number(availmentId), business_id: businessId }
            });
            if (!line) throw new AvailmentLineNotFoundError();

            await line.update({ cancelled_at: new Date() });
            return this.toPlainLine(line);
        });
    }

    /**
     * Restores a soft-deleted line by clearing cancelled_at (D-02/D-18).
     * Rejects if the availment is finalized or the line doesn't exist.
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {number|string} lineId
     * @returns {Promise<Object>} Plain updated availment_items row with cancelled_at cleared
     */
    async restoreLine(businessId, availmentId, lineId) {
        if (!businessId) throw new Error('AvailmentRepository.restoreLine requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentItem } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

            const line = await AvailmentItem.findOne({
                where: { id: Number(lineId), availment_id: Number(availmentId), business_id: businessId }
            });
            if (!line) throw new AvailmentLineNotFoundError();

            await line.update({ cancelled_at: null });
            return this.toPlainLine(line);
        });
    }

    /**
     * Records a discount on the availment (CHK-03, D-04/D-05).
     * One call inserts one availment_discounts row. A multi-discount availment
     * accrues multiple rows. Rejects if the availment is finalized.
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {{discountType, code?, amount?, percent?, appliedByStaffAccountId?, reason?, scPwdIdNumber?, scPwdCustomerName?}} discount
     * @returns {Promise<Object>} Plain availment_discounts row
     */
    async recordDiscount(businessId, availmentId, discount = {}) {
        if (!businessId) throw new Error('AvailmentRepository.recordDiscount requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentDiscount } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

            // WR-05 fix (09-REVIEW.md): reject a second sc_pwd row on the
            // same availment — availment_discounts is append-only, so
            // nothing else prevents multiple SC/PWD discounts from stacking.
            if (discount.discountType === 'sc_pwd') {
                const existingScPwd = await AvailmentDiscount.findOne({
                    where: { availment_id: Number(availmentId), business_id: businessId, discount_type: 'sc_pwd' }
                });
                if (existingScPwd) throw new DuplicateScPwdDiscountError();
            }

            const discountRow = await AvailmentDiscount.create({
                business_id: businessId,
                availment_id: Number(availmentId),
                discount_type: discount.discountType,
                code: discount.code || null,
                amount: discount.amount || null,
                percent: discount.percent || null,
                applied_by_staff_account_id: discount.appliedByStaffAccountId || null,
                reason: discount.reason || null,
                sc_pwd_id_number: discount.scPwdIdNumber || null,
                sc_pwd_customer_name: discount.scPwdCustomerName || null
            });
            return this.toPlainDiscount(discountRow);
        });
    }

    /**
     * Finalizes the availment: writes availment + payment + receipt in ONE
     * sequelize.transaction, row-locks the availment to prevent double-finalize,
     * and invokes recordSaleEffect for each inventory_issue line inside the
     * same transaction. Throws on any non-success sale-effect ApplicationResult
     * so the whole transaction rolls back (Pitfall 7, WARNING-1).
     *
     * @param {string} businessId
     * @param {number|string} availmentId
     * @param {{header, payment, receipt, saleEffectLines, recordSaleEffect, recordStageEvents, fulfillmentMode, actorStaffAccountId, actorAccountId}} input
     *   - header: {document_context, subtotal_amount, discount_amount, vat_amount, vat_exempt_amount, total_amount, shift_id, sc_pwd_fields...}
     *   - payment: {payment_method, amount_received, change_due, payment_handoff_mode}
     *   - receipt: {receipt_number, document_type, compliance_mode, payload}
     *   - saleEffectLines: [{productId, quantity, referenceType, referenceId, actorAccountId, actorStaffAccountId, stockEffectType}, ...]
     *   - recordSaleEffect: injected function for recording sale movements
     *   - recordStageEvents: OPTIONAL injected port (businessId, events, {transaction}) => Promise —
     *     when supplied, auto-writes the FULL per-mode stage sequence (D-05) inside this
     *     same transaction; a thrown/rejected call rolls back the whole finalize (Pitfall 2)
     *   - fulfillmentMode: 'pickup'|'dine_in'|'delivery', defaults to 'dine_in' (A1)
     *   - actorStaffAccountId / actorAccountId: attributed on every written stage-event row
     * @returns {Promise<{availment: Object, payment: Object, receipt: Object}>}
     */
    async finalizePersist(businessId, availmentId, {
        header, payment, receipt, saleEffectLines, recordSaleEffect,
        recordStageEvents, fulfillmentMode, actorStaffAccountId = null, actorAccountId = null
    } = {}) {
        const resolvedFulfillmentMode = fulfillmentMode || 'dine_in';
        if (!businessId) throw new Error('AvailmentRepository.finalizePersist requires businessId.');

        return this.withModel(businessId, async (Availment, databaseName) => {
            const models = this.tenantConnector.getModels(databaseName);
            const { Availment: AvailmentModel, Payment: PaymentModel, Receipt: ReceiptModel } = models;
            const sequelize = AvailmentModel.sequelize;

            return await sequelize.transaction(async (transaction) => {
                // 1. Find and row-lock the availment; reject if already finalized (double-finalize guard)
                const availment = await AvailmentModel.findOne({
                    where: { id: Number(availmentId), business_id: businessId },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!availment) throw new AvailmentNotFoundError();
                if (availment.status !== 'draft') throw new AvailmentFinalizedError();

                // 2. Update the availment row to finalized status with computed amounts,
                // plus the denormalized fulfillment_mode/fulfillment_status/fulfillment_stage
                // (D-05/D-06) — a POS/dine-in finalize auto-fast-forwards to 'completed'
                // since the full stage sequence below is written atomically in the same txn.
                await availment.update({
                    status: 'finalized',
                    document_context: header.document_context,
                    subtotal_amount: header.subtotal_amount,
                    discount_amount: header.discount_amount,
                    vat_amount: header.vat_amount,
                    vat_exempt_amount: header.vat_exempt_amount,
                    total_amount: header.total_amount,
                    shift_id: header.shift_id,
                    sc_pwd_id_number: header.sc_pwd_id_number,
                    sc_pwd_metadata: header.sc_pwd_metadata,
                    finalized_at: new Date(),
                    fulfillment_mode: resolvedFulfillmentMode,
                    fulfillment_status: 'completed',
                    fulfillment_stage: 'completed'
                }, { transaction });

                // 2b. Auto-write the FULL per-mode stage-event sequence (D-05) inside
                // this SAME transaction via the injected recordStageEvents port. A
                // thrown/rejected call rolls back the whole finalize (Pitfall 2) —
                // recordStageEvents is OPTIONAL so existing test composition that
                // omits it still builds/runs.
                if (typeof recordStageEvents === 'function') {
                    const stages = FINALIZE_STAGE_SEQUENCES[resolvedFulfillmentMode]
                        || FINALIZE_STAGE_SEQUENCES.dine_in;
                    const stageEvents = stages.map((stage) => ({
                        availmentId: Number(availmentId),
                        fulfillmentMode: resolvedFulfillmentMode,
                        fulfillmentStatus: stage,
                        fulfillmentStage: stage,
                        actorStaffAccountId,
                        actorAccountId
                    }));
                    await recordStageEvents(businessId, stageEvents, { transaction });
                }

                // 3. For each inventory_issue line, invoke the injected recordSaleEffect
                // This write happens inside the SAME transaction. If any result is not a success,
                // THROW so the entire transaction rolls back (Pitfall 7 / WARNING-1).
                for (const saleEffectLine of (saleEffectLines || [])) {
                    if (saleEffectLine.stockEffectType === 'inventory_issue') {
                        const saleResult = await recordSaleEffect({
                            businessId,
                            productId: saleEffectLine.productId,
                            quantity: saleEffectLine.quantity,
                            referenceType: 'availment',
                            referenceId: availmentId,
                            actorAccountId: saleEffectLine.actorAccountId,
                            actorStaffAccountId: saleEffectLine.actorStaffAccountId,
                            transaction
                        });

                        // Check if the sale effect failed; if so, throw to rollback the whole transaction
                        if (saleResult && typeof saleResult.isSuccess === 'boolean' && !saleResult.isSuccess) {
                            throw new Error(
                                `Sale effect failed for product ${saleEffectLine.productId}: ${
                                    saleResult.error?.message || 'unknown error'
                                }`
                            );
                        }
                    }
                }

                // 4. Create the Payment row
                const paymentRow = await PaymentModel.create({
                    business_id: businessId,
                    availment_id: Number(availmentId),
                    payment_method: payment.payment_method,
                    amount_received: payment.amount_received,
                    change_due: payment.change_due || null,
                    payment_handoff_mode: payment.payment_handoff_mode || null
                }, { transaction });

                // 5. Create the Receipt row
                const receiptRow = await ReceiptModel.create({
                    business_id: businessId,
                    availment_id: Number(availmentId),
                    receipt_number: receipt.receipt_number,
                    document_type: receipt.document_type,
                    compliance_mode: receipt.compliance_mode,
                    payload: receipt.payload,
                    printed: false,
                    print_error: null
                }, { transaction });

                return {
                    availment: this.toPlain(availment),
                    payment: this.toPlainPayment(paymentRow),
                    receipt: this.toPlainReceipt(receiptRow)
                };
            });
        });
    }

    /**
     * Finalizes a STOREFRONT order into a NON-POS Availment — no shift,
     * terminal, or cashier (RESEARCH structural gap #1: finalizePersist
     * above cannot be reused here because it hard-requires those three POS
     * preconditions). Creates the Availment with a cross-DB
     * customer_account_id reference (no FK) and a unique source_reference
     * keyed to the landlord order, converts the stock reservation into a
     * sale via the injected commitReservation single-writer port (10-02,
     * ADR 0029), and creates the Payment row — all inside ONE
     * sequelize.transaction.
     *
     * Idempotent on (business_id, source_reference):
     *   (a) a row-locked lookup for an existing Availment with this
     *       source_reference returns it as a no-op (no second Payment/
     *       AvailmentItem/commitReservation call — no second stock
     *       deduction);
     *   (b) a lost-guard concurrent race (two calls both miss the lookup
     *       because neither row exists yet) collapses to one row via the
     *       UNIQUE unique_availments_source_reference index — the loser's
     *       insert throws SequelizeUniqueConstraintError, caught here and
     *       re-resolved to the winner's row (RESEARCH Pitfall 2
     *       belt-and-suspenders, T-10-07-01).
     *
     * A non-success (or thrown) commitReservation result rolls back the
     * WHOLE transaction — the Availment/AvailmentItem/Payment rows never
     * commit for a failed sale effect (mirrors finalizePersist's Phase 9
     * P04/P06 atomicity discipline; nothing partial is ever persisted).
     *
     * @param {string} businessId
     * @param {{sourceReference, customerAccountId, lines, header, payment, commitReservation, fulfillmentMode, recordStageEvents}} input
     *   - sourceReference: unique-per-business key (the landlord order's public_reference)
     *   - customerAccountId: opaque UUID cross-DB reference (no FK), or null for a guest order
     *   - lines: [{productId, productName?, quantity, unitPrice}, ...] — AvailmentItem snapshot
     *   - header: {subtotal_amount, discount_amount, vat_amount, vat_exempt_amount, total_amount} (formatted DECIMAL strings)
     *   - payment: {payment_method, amount_received, change_due, payment_handoff_mode, payment_reference}
     *   - commitReservation: (transaction) => Promise<ApplicationResult|void> — the injected 10-02 single-writer stock-effect port
     *   - fulfillmentMode: 'pickup'|'delivery' (A2) — PERSISTED onto the Availment (closes Landmine 2, previously dropped)
     *   - recordStageEvents: OPTIONAL injected port (businessId, events, {transaction}) => Promise —
     *     when supplied, writes ONE 'placed' stage event (D-06) inside this same transaction on a
     *     fresh (non-idempotent-hit) finalize; a thrown/rejected call rolls back the whole finalize (Pitfall 2)
     * @returns {Promise<{availment: Object, payment: Object, idempotent: boolean}>}
     *
     * NOTE (deviation, Rule 1): deliberately does NOT go through this.withModel()
     * the way every other method in this file does. withModel()'s catch-all
     * re-wraps ANY non-whitelisted thrown error into
     * TenantDatabaseUnavailableError('unreachable', ...) — correct for a
     * genuine connectivity failure, but wrong here: it would mask a real
     * business-logic rollback reason (a failed reservation commit, e.g.
     * insufficient stock) behind a misleading "tenant database unreachable"
     * 503, exactly the kind of silent-downgrade this plan's atomicity
     * guarantee must not do. resolveDatabaseName() below still throws a
     * genuine TenantDatabaseUnavailableError for real registry/connectivity
     * problems (missing/provisioning/inactive/unverified) — that error type
     * propagates unmodified, same as every other method; only the blanket
     * re-wrap of OTHER errors is skipped for this method. (finalizePersist()
     * above has this same latent masking behavior for its own sale-effect
     * failures — a pre-existing Phase 9 issue, out of this task's scope,
     * logged in deferred-items.md rather than changed here.)
     */
    async finalizeStorefrontOrder(businessId, {
        sourceReference, customerAccountId = null, lines = [], header, payment, commitReservation,
        fulfillmentMode = null, recordStageEvents
    } = {}) {
        if (!businessId) throw new Error('AvailmentRepository.finalizeStorefrontOrder requires businessId.');
        if (!sourceReference) throw new Error('AvailmentRepository.finalizeStorefrontOrder requires sourceReference.');
        if (typeof commitReservation !== 'function') {
            throw new Error('AvailmentRepository.finalizeStorefrontOrder requires a commitReservation function.');
        }

        // Throws TenantDatabaseUnavailableError directly (not caught/
        // re-wrapped here) for missing/provisioning/inactive/unverified —
        // propagates to the usecase layer exactly like every other method.
        const databaseName = await this.resolveDatabaseName(businessId);
        const models = this.tenantConnector.getModels(databaseName);
        const { Availment: AvailmentModel, AvailmentItem: AvailmentItemModel, Payment: PaymentModel } = models;
        const sequelize = AvailmentModel.sequelize;

        const findExistingByReference = async (transaction) => AvailmentModel.findOne({
            where: { business_id: businessId, source_reference: sourceReference },
            include: [{ association: 'items' }, { association: 'payments' }],
            ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {})
        });

        // WR-04 fix (10-REVIEW.md): reformatted this try/catch block to the
        // file's existing 4-space indentation convention (it was
        // previously indented one level too deep, with closing braces
        // misaligned relative to their openers) and relabeled the inline
        // step comments in ACTUAL execution order — (a) idempotent lookup,
        // (b) create Availment, (c) AvailmentItem lines, (d) reservation ->
        // sale commit, (e) Payment row. The previous lettering had (c)
        // Payment labeled BEFORE (d) commitReservation even though Payment
        // is created AFTER the reservation commit in the real execution
        // order below.
        try {
            return await sequelize.transaction(async (transaction) => {
                // (a) idempotent no-op: row-locked lookup by (business_id, source_reference)
                const existing = await findExistingByReference(transaction);
                if (existing) {
                    return {
                        availment: this.toPlain(existing),
                        payment: this.toPlainPayment((existing.payments || [])[0]),
                        idempotent: true
                    };
                }

                // (b) create the finalized Availment — NO shift_id/terminal_id/cashier fields
                const availment = await AvailmentModel.create({
                    business_id: businessId,
                    branch_id: null,
                    customer_account_id: customerAccountId,
                    shift_id: null,
                    terminal_id: null,
                    cashier_account_id: null,
                    cashier_dgfy_account_id: null,
                    status: 'finalized',
                    document_context: null,
                    source_reference: sourceReference,
                    subtotal_amount: header.subtotal_amount,
                    discount_amount: header.discount_amount,
                    vat_amount: header.vat_amount,
                    vat_exempt_amount: header.vat_exempt_amount,
                    total_amount: header.total_amount,
                    finalized_at: new Date(),
                    // D-06/L2: persist fulfillmentMode (previously dropped) + the
                    // denormalized initial stage — online Availments enter at
                    // 'placed' (A2), never auto-confirmed on payment.
                    fulfillment_mode: fulfillmentMode,
                    fulfillment_status: 'placed',
                    fulfillment_stage: 'placed'
                }, { transaction });

                // (c) AvailmentItem lines
                for (const line of (lines || [])) {
                    await AvailmentItemModel.create({
                        business_id: businessId,
                        availment_id: availment.id,
                        product_id: line.productId,
                        product_name: line.productName || null,
                        quantity: line.quantity,
                        unit_price: line.unitPrice,
                        stock_effect_type: 'inventory_issue',
                        tax_treatment: 'vatable',
                        tax_rate: '0.1200'
                    }, { transaction });
                }

                // (c2) Auto-write ONE 'placed' stage event (D-06) inside this SAME
                // transaction via the injected recordStageEvents port. A
                // thrown/rejected call rolls back the whole finalize (Pitfall 2) —
                // recordStageEvents is OPTIONAL so existing test composition that
                // omits it still builds/runs. Not reached on the idempotent-hit
                // early-return above (no second stage event for a repeat call).
                if (typeof recordStageEvents === 'function') {
                    await recordStageEvents(businessId, [{
                        availmentId: availment.id,
                        fulfillmentMode,
                        fulfillmentStatus: 'placed',
                        fulfillmentStage: 'placed',
                        actorAccountId: customerAccountId
                    }], { transaction });
                }

                // (d) reservation -> sale, injected single-writer port
                // (ADR 0029), SAME transaction — a non-success result
                // throws so the whole finalize rolls back.
                const commitResult = await commitReservation(transaction);
                if (commitResult && typeof commitResult.isSuccess === 'boolean' && !commitResult.isSuccess) {
                    throw new Error(
                        `Reservation commit failed for source_reference ${sourceReference}: ${
                            commitResult.error?.message || 'unknown error'
                        }`
                    );
                }

                // (e) Payment row — payment_reference stored separately
                // from the payment_method ENUM (T-10-07-04, A4).
                const paymentRow = await PaymentModel.create({
                    business_id: businessId,
                    availment_id: availment.id,
                    payment_method: payment.payment_method,
                    amount_received: payment.amount_received,
                    change_due: payment.change_due || null,
                    payment_handoff_mode: payment.payment_handoff_mode || null,
                    payment_reference: payment.payment_reference || null
                }, { transaction });

                return {
                    availment: this.toPlain(availment),
                    payment: this.toPlainPayment(paymentRow),
                    idempotent: false
                };
            });
        } catch (error) {
            // Lost-guard race: two concurrent calls both missed the
            // row-locked lookup (neither row existed yet) and both
            // attempted an insert; the UNIQUE unique_availments_source_
            // reference index lets exactly one win. Re-resolve the
            // loser to the winner's row instead of surfacing a raw DB
            // error (RESEARCH Pitfall 2 belt-and-suspenders).
            if (error && error.name === 'SequelizeUniqueConstraintError') {
                const existing = await findExistingByReference(null);
                if (existing) {
                    return {
                        availment: this.toPlain(existing),
                        payment: this.toPlainPayment((existing.payments || [])[0]),
                        idempotent: true
                    };
                }
            }
            throw error;
        }
    }

    // ============================================================================
    // Plain/projection helpers
    // ============================================================================

    toPlain(availmentRow) {
        if (!availmentRow) return null;
        return {
            id: availmentRow.id,
            business_id: availmentRow.business_id,
            branch_id: availmentRow.branch_id,
            customer_account_id: availmentRow.customer_account_id,
            cashier_account_id: availmentRow.cashier_account_id,
            cashier_dgfy_account_id: availmentRow.cashier_dgfy_account_id,
            terminal_id: availmentRow.terminal_id,
            shift_id: availmentRow.shift_id,
            status: availmentRow.status,
            document_context: availmentRow.document_context,
            subtotal_amount: availmentRow.subtotal_amount,
            discount_amount: availmentRow.discount_amount,
            vat_amount: availmentRow.vat_amount,
            vat_exempt_amount: availmentRow.vat_exempt_amount,
            total_amount: availmentRow.total_amount,
            sc_pwd_id_number: availmentRow.sc_pwd_id_number,
            sc_pwd_metadata: availmentRow.sc_pwd_metadata,
            finalized_at: availmentRow.finalized_at,
            source_reference: availmentRow.source_reference,
            created_at: availmentRow.created_at,
            updated_at: availmentRow.updated_at,
            items: (availmentRow.items || []).map(item => this.toPlainLine(item)),
            discounts: (availmentRow.discounts || []).map(discount => this.toPlainDiscount(discount)),
            payments: (availmentRow.payments || []).map(p => this.toPlainPayment(p))
        };
    }

    toPlainLine(lineRow) {
        if (!lineRow) return null;
        return {
            id: lineRow.id,
            business_id: lineRow.business_id,
            availment_id: lineRow.availment_id,
            product_id: lineRow.product_id,
            product_name: lineRow.product_name,
            quantity: lineRow.quantity,
            unit_price: lineRow.unit_price,
            stock_effect_type: lineRow.stock_effect_type,
            tax_treatment: lineRow.tax_treatment,
            tax_rate: lineRow.tax_rate,
            cancelled_at: lineRow.cancelled_at,
            created_at: lineRow.created_at,
            updated_at: lineRow.updated_at
        };
    }

    toPlainDiscount(discountRow) {
        if (!discountRow) return null;
        return {
            id: discountRow.id,
            business_id: discountRow.business_id,
            availment_id: discountRow.availment_id,
            discount_type: discountRow.discount_type,
            code: discountRow.code,
            amount: discountRow.amount,
            percent: discountRow.percent,
            applied_by_staff_account_id: discountRow.applied_by_staff_account_id,
            reason: discountRow.reason,
            sc_pwd_id_number: discountRow.sc_pwd_id_number,
            sc_pwd_customer_name: discountRow.sc_pwd_customer_name,
            created_at: discountRow.created_at
        };
    }

    toPlainPayment(paymentRow) {
        if (!paymentRow) return null;
        return {
            id: paymentRow.id,
            business_id: paymentRow.business_id,
            availment_id: paymentRow.availment_id,
            payment_method: paymentRow.payment_method,
            amount_received: paymentRow.amount_received,
            change_due: paymentRow.change_due,
            payment_handoff_mode: paymentRow.payment_handoff_mode,
            payment_reference: paymentRow.payment_reference,
            created_at: paymentRow.created_at
        };
    }

    toPlainReceipt(receiptRow) {
        if (!receiptRow) return null;
        return {
            id: receiptRow.id,
            business_id: receiptRow.business_id,
            availment_id: receiptRow.availment_id,
            receipt_number: receiptRow.receipt_number,
            document_type: receiptRow.document_type,
            compliance_mode: receiptRow.compliance_mode,
            payload: receiptRow.payload,
            printed: receiptRow.printed,
            print_error: receiptRow.print_error,
            created_at: receiptRow.created_at
        };
    }
}

export default AvailmentRepository;
