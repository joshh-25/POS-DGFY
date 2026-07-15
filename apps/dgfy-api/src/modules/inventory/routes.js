import express from 'express';
import { buildInventoryMovementController } from './controllers/inventoryMovementController.js';

/**
 * Wires Express routing for the inventory module (Interface Adapter). Routes
 * are thin: define paths/methods and delegate to the injected controller.
 * Errors from async handlers are forwarded to Express's error middleware via
 * `.catch(next)` rather than being swallowed. Mirrors
 * ../products/routes.js's createProductRoutes() shape.
 *
 * Mounted top-level at /inventory (per 08-PATTERNS.md's precedent for new
 * Phase 8 modules — NOT nested under /businesses/:businessId).
 *
 * `authenticateAccount` is the accounts module's own auth middleware and is
 * injected by the caller per Dependency Inversion — this file never imports
 * a concrete middleware implementation directly.
 *
 * @param {Object} useCases - inventory module use cases (buildInventoryModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createInventoryRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createInventoryRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildInventoryMovementController(useCases);

    router.post('/restock', authenticateAccount, (req, res, next) => controller.recordRestock(req, res).catch(next));
    router.post('/loss', authenticateAccount, (req, res, next) => controller.recordLoss(req, res).catch(next));
    router.post('/adjustment', authenticateAccount, (req, res, next) => controller.recordAdjustment(req, res).catch(next));
    router.get('/movements', authenticateAccount, (req, res, next) => controller.listMovements(req, res).catch(next));

    return router;
}

export default createInventoryRoutes;
