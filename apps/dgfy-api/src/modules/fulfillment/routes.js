import express from 'express';
import { buildFulfillmentController } from './controllers/fulfillmentController.js';

/**
 * Wires Express routing for the fulfillment module (Interface Adapter).
 * Routes are thin: define paths/methods and delegate to the injected
 * controller. Errors from async handlers are forwarded to Express's error
 * middleware via `.catch(next)` rather than being swallowed. Mirrors
 * ../inventory/routes.js's createInventoryRoutes() shape.
 *
 * Mounted top-level at /fulfillment (NOT nested under /businesses/:businessId),
 * per the inventory precedent.
 *
 * `authenticateAccount` is the accounts module's own auth middleware and is
 * injected by the caller per Dependency Inversion — this file never imports
 * a concrete middleware implementation directly.
 *
 * @param {Object} useCases - fulfillment module use cases (buildFulfillmentModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createFulfillmentRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createFulfillmentRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildFulfillmentController(useCases);

    router.get('/incoming-orders', authenticateAccount, (req, res, next) => controller.listIncoming(req, res).catch(next));
    router.post('/stage', authenticateAccount, (req, res, next) => controller.progressStage(req, res).catch(next));
    router.post('/courier', authenticateAccount, (req, res, next) => controller.assignCourier(req, res).catch(next));
    router.post('/payout', authenticateAccount, (req, res, next) => controller.markPayout(req, res).catch(next));

    return router;
}

export default createFulfillmentRoutes;
