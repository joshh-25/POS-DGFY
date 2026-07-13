import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../inventory/controllers/inventoryMovementController.js. Parses HTTP
// request data, calls the injected use cases, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports.
// Controllers never read client-supplied total, change, or discount_amount
// (CHK-02, D-09) — server recomputes all amounts.
//
// @param {Object} [useCases] - availment module use cases
export function buildAvailmentController(useCases = {}) {
    return {
        // POST /v1/availments
        async create(req, res) {
            const body = req.body || {};
            const result = await useCases.createAvailment({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                branchId: body.branch_id || null
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /v1/availments/:id
        async getById(req, res) {
            const body = req.body || {};
            const result = await useCases.getById({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /v1/availments/:id/lines
        async addLine(req, res) {
            const body = req.body || {};
            const result = await useCases.addLine({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                productId: body.product_id,
                quantity: body.quantity,
                stockEffectType: body.stock_effect_type || null
            });
            return sendUseCaseResult(res, result, 201);
        },

        // PATCH /v1/availments/:id/lines/:lineId
        async updateLine(req, res) {
            const body = req.body || {};
            const result = await useCases.updateLine({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                lineId: req.params.lineId,
                quantity: body.quantity || null,
                stockEffectType: body.stock_effect_type || null
            });
            return sendUseCaseResult(res, result, 200);
        },

        // DELETE /v1/availments/:id/lines/:lineId
        async removeLine(req, res) {
            const body = req.body || {};
            const result = await useCases.removeLine({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                lineId: req.params.lineId
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /v1/availments/:id/lines/:lineId/restore
        async restoreLine(req, res) {
            const body = req.body || {};
            const result = await useCases.restoreLine({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                lineId: req.params.lineId
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /v1/availments/:id/discounts
        async applyDiscount(req, res) {
            const body = req.body || {};
            const result = await useCases.applyDiscount({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                discountType: body.discount_type,
                code: body.code || null,
                amount: body.amount || null,
                percent: body.percent || null,
                reason: body.reason || null,
                scPwdIdNumber: body.sc_pwd_id_number || null,
                scPwdCustomerName: body.sc_pwd_customer_name || null
            });
            return sendUseCaseResult(res, result, 201);
        },

        // POST /v1/availments/compliance-evidence
        // Operator attestation endpoint (D-23): persists the interim
        // per-(business, branch) evidence bundle finalize reads for
        // compliant_active checkout. Owner/authorized-member gated inside
        // the usecase.
        async attestComplianceEvidence(req, res) {
            const body = req.body || {};
            const result = await useCases.attestComplianceEvidence({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                branchId: body.branch_id || null,
                settings: body.settings || {},
                artifacts: body.artifacts || [],
                peripherals: body.peripherals || [],
                evidence: body.evidence || {}
            });
            return sendUseCaseResult(res, result, 201);
        },

        // POST /v1/availments/:id/finalize
        async finalize(req, res) {
            const body = req.body || {};
            // CRITICAL: Never read client-supplied total, change, or discount_amount.
            // Only read whitelisted fields (CHK-02, D-09, D-16, D-21, D-22):
            // - business_id
            // - requested_document_context (fiscal | non_fiscal)
            // - payment_method (Cash | GCash | Credit Card)
            // - cash_received (for Cash method only)
            // - terminal_id
            // - cashier_account_id (tenant-local staff_accounts.id, for CHK-06 open-shift binding)
            // - branch_id
            // Server recomputes all amounts and the change due.
            const result = await useCases.finalizeAvailment({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: req.params.id,
                requestedDocumentContext: body.requested_document_context || 'non_fiscal',
                paymentMethod: body.payment_method,
                cashReceived: body.cash_received || null,
                terminalId: body.terminal_id || null,
                cashierAccountId: body.cashier_account_id || null,
                branchId: body.branch_id || null
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildAvailmentController;
