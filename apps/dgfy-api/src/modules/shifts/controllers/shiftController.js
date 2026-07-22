import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../inventory/controllers/inventoryMovementController.js. Parses HTTP
// request data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by apps/dgfy-api/
// eslint.config.mjs's no-restricted-imports rule. Use cases are received via
// the `useCases` parameter (Dependency Inversion); this module never
// imports usecases/shiftUseCases.js directly.
//
// businessId is read from req.body (POST) / req.query (GET) — mirrors
// ../../inventory/routes.js's convention (this module also mounts top-level
// at /shifts, not nested under /businesses/:businessId).
//
// @param {Object} [useCases] - shifts module use cases (buildShiftsModule().useCases)
export function buildShiftController(useCases = {}) {
    return {
        // POST /shifts (staff-or-owner required)
        async openShift(req, res) {
            const body = req.body || {};
            const result = await useCases.openShift({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                terminalId: body.terminal_id,
                cashierAccountId: body.cashier_account_id,
                cashierDgfyAccountId: body.cashier_dgfy_account_id,
                openingFloatAmount: body.opening_float_amount
            });
            return sendUseCaseResult(res, result, 201);
        },

        // POST /shifts/:id/close (staff-or-owner required)
        async closeShift(req, res) {
            const body = req.body || {};
            const result = await useCases.closeShift({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                shiftId: req.params.id,
                closingCashAmount: body.closing_cash_amount,
                salesCash: body.sales_cash,
                refundsCash: body.refunds_cash,
                payIns: body.pay_ins,
                payOuts: body.pay_outs
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /shifts/:id/no-sale-pop (staff-or-owner required)
        async recordNoSalePop(req, res) {
            const body = req.body || {};
            const result = await useCases.recordNoSalePop({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                shiftId: req.params.id,
                reason: body.reason,
                actorStaffAccountId: body.actor_staff_account_id
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /shifts (membership required)
        async listShifts(req, res) {
            const result = await useCases.listShifts({
                businessId: req.query.business_id,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildShiftController;
