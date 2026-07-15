import express from 'express';
import { buildShiftController } from './controllers/shiftController.js';

/**
 * Wires Express routing for the shifts module (Interface Adapter). Routes
 * are thin: define paths/methods and delegate to the injected controller.
 * Errors from async handlers are forwarded to Express's error middleware via
 * `.catch(next)` rather than being swallowed. Mirrors
 * ../inventory/routes.js's createInventoryRoutes() shape.
 *
 * Mounted top-level at /shifts (per 08-PATTERNS.md's precedent for new
 * Phase 8 modules — NOT nested under /businesses/:businessId).
 *
 * `authenticateAccount` is the accounts module's own auth middleware and is
 * injected by the caller per Dependency Inversion — this file never imports
 * a concrete middleware implementation directly.
 *
 * @param {Object} useCases - shifts module use cases (buildShiftsModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createShiftRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createShiftRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildShiftController(useCases);

    router.post('/', authenticateAccount, (req, res, next) => controller.openShift(req, res).catch(next));
    router.post('/:id/close', authenticateAccount, (req, res, next) => controller.closeShift(req, res).catch(next));
    router.post('/:id/no-sale-pop', authenticateAccount, (req, res, next) => controller.recordNoSalePop(req, res).catch(next));
    router.get('/', authenticateAccount, (req, res, next) => controller.listShifts(req, res).catch(next));

    return router;
}

export default createShiftRoutes;
