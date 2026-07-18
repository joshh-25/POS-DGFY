import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../products/controllers/productController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by apps/dgfy-api/
// eslint.config.mjs's no-restricted-imports rule. Use cases are received via
// the `useCases` parameter (Dependency Inversion); this module never
// imports usecases/inventoryMovementUseCases.js directly.
//
// businessId is read from req.body (POST) / req.query (GET) — mirrors
// ../../products/routes.js's convention (this module also mounts top-level
// at /inventory, not nested under /businesses/:businessId).
//
// @param {Object} [useCases] - inventory module use cases (buildInventoryModule().useCases)
export function buildInventoryMovementController(useCases = {}) {
    const recordMovement = (useCaseName) => async (req, res) => {
        const body = req.body || {};
        const result = await useCases[useCaseName]({
            businessId: body.business_id,
            requestingAccountId: req.account.id,
            productId: body.product_id,
            quantity: body.quantity,
            referenceType: body.reference_type,
            referenceId: body.reference_id,
            actorStaffAccountId: body.actor_staff_account_id
        });
        return sendUseCaseResult(res, result, 201);
    };

    return {
        // POST /inventory/restock (staff-or-owner required)
        recordRestock: recordMovement('recordRestock'),

        // POST /inventory/loss (staff-or-owner required)
        recordLoss: recordMovement('recordLoss'),

        // POST /inventory/adjustment (staff-or-owner required)
        recordAdjustment: recordMovement('recordAdjustment'),

        // GET /inventory/movements (membership required)
        async listMovements(req, res) {
            const result = await useCases.listMovements({
                businessId: req.query.business_id,
                requestingAccountId: req.account.id,
                productId: req.query.product_id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildInventoryMovementController;
