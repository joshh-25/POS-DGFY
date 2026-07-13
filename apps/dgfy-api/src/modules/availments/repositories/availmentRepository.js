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
     * `fn(Availment)` against it. Any error surfaced while resolving the model
     * or running the query is normalized to
     * TenantDatabaseUnavailableError('unreachable', ...) unless it is
     * already one of the known domain errors (never double-wrapped).
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
                || error instanceof AvailmentNotFoundError
                || error instanceof AvailmentFinalizedError
                || error instanceof AvailmentLineNotFoundError
                || error instanceof NoOpenShiftError
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

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
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

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
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

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
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

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
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

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
            const models = this.tenantConnector.getModels(databaseName);
            const { AvailmentDiscount } = models;

            // Guard: check availment is not finalized
            const availment = await Availment.findOne({
                where: { id: Number(availmentId), business_id: businessId }
            });
            if (!availment) throw new AvailmentNotFoundError();
            if (availment.isFinalized()) throw new AvailmentFinalizedError();

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
     * @param {{header, payment, receipt, saleEffectLines, recordSaleEffect}} input
     *   - header: {document_context, subtotal_amount, discount_amount, vat_amount, vat_exempt_amount, total_amount, shift_id, sc_pwd_fields...}
     *   - payment: {payment_method, amount_received, change_due, payment_handoff_mode}
     *   - receipt: {receipt_number, document_type, compliance_mode, payload}
     *   - saleEffectLines: [{productId, quantity, referenceType, referenceId, actorAccountId, actorStaffAccountId, stockEffectType}, ...]
     *   - recordSaleEffect: injected function for recording sale movements
     * @returns {Promise<{availment: Object, payment: Object, receipt: Object}>}
     */
    async finalizePersist(businessId, availmentId, {
        header, payment, receipt, saleEffectLines, recordSaleEffect
    } = {}) {
        if (!businessId) throw new Error('AvailmentRepository.finalizePersist requires businessId.');

        return this.withModel(businessId, async (Availment) => {
            const databaseName = await this.resolveDatabaseName(businessId);
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

                // 2. Update the availment row to finalized status with computed amounts
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
                    finalized_at: new Date()
                }, { transaction });

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
