import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../inventory/controllers/inventoryMovementController.js. Parses HTTP
// request data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by apps/dgfy-api/
// eslint.config.mjs's no-restricted-imports rule. Use cases are received via
// the `useCases` parameter (Dependency Inversion); this module never
// imports usecases/fulfillmentUseCases.js directly.
//
// businessId is read from req.body (POST) / req.query (GET) — mirrors
// ../../inventory/controllers/inventoryMovementController.js's convention
// (this module also mounts top-level at /fulfillment, not nested under
// /businesses/:businessId).
//
// @param {Object} [useCases] - fulfillment module use cases (buildFulfillmentModule().useCases)
export function buildFulfillmentController(useCases = {}) {
    return {
        // GET /fulfillment/incoming-orders (membership required, FUL-01)
        async listIncoming(req, res) {
            const query = req.query || {};
            const result = await useCases.listIncomingOrders({
                businessId: query.business_id,
                requestingAccountId: req.account.id,
                branchId: query.branch_id ?? null,
                fulfillmentMode: query.fulfillment_mode ?? null
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /fulfillment/stage (membership required, FUL-02/D-10)
        async progressStage(req, res) {
            const body = req.body || {};
            const result = await useCases.progressStage({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: body.availment_id,
                force: Boolean(body.force),
                reason: body.reason ?? null,
                actorStaffAccountId: body.actor_staff_account_id ?? null
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /fulfillment/courier (membership required, FUL-03/D-01/D-04)
        async assignCourier(req, res) {
            const body = req.body || {};
            const result = await useCases.assignCourier({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                availmentId: body.availment_id,
                courierName: body.courier_name,
                courierContact: body.courier_contact ?? null,
                payoutAmount: body.payout_amount ?? null,
                assignedByStaffAccountId: body.assigned_by_staff_account_id ?? null
            });
            return sendUseCaseResult(res, result, 201);
        },

        // POST /fulfillment/payout (membership required, FUL-03/D-02)
        async markPayout(req, res) {
            const body = req.body || {};
            const result = await useCases.markPayout({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                assignmentId: body.assignment_id,
                paidAt: body.paid_at ?? null
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildFulfillmentController;
