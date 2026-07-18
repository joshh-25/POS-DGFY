import express from 'express';
import { buildAvailmentController } from './controllers/availmentController.js';

/**
 * Wires Express routing for the availments module (Interface Adapter). Routes
 * are thin: define paths/methods and delegate to the injected controller.
 * Errors from async handlers are forwarded to Express's error middleware via
 * `.catch(next)` rather than being swallowed. Mirrors
 * ../../inventory/routes.js's createInventoryRoutes() pattern.
 *
 * Mounted top-level at /availments per Phase 9's endpoint pattern
 * (POST /v1/availments, GET /v1/availments/:id, etc.).
 *
 * `authenticateAccount` is the accounts module's own auth middleware and is
 * injected by the caller per Dependency Inversion.
 *
 * @param {Object} useCases - availment module use cases (buildAvailmentsModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createAvailmentRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createAvailmentRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildAvailmentController(useCases);

    // Specific paths before /:id (mirroring products/routes.js pattern)
    router.post('/', authenticateAccount, (req, res, next) => controller.create(req, res).catch(next));
    router.post('/compliance-evidence', authenticateAccount, (req, res, next) => controller.attestComplianceEvidence(req, res).catch(next));
    router.post('/:id/lines', authenticateAccount, (req, res, next) => controller.addLine(req, res).catch(next));
    router.post('/:id/lines/:lineId/restore', authenticateAccount, (req, res, next) => controller.restoreLine(req, res).catch(next));
    router.post('/:id/discounts', authenticateAccount, (req, res, next) => controller.applyDiscount(req, res).catch(next));
    router.post('/:id/finalize', authenticateAccount, (req, res, next) => controller.finalize(req, res).catch(next));

    // /:id generic paths
    router.get('/:id', authenticateAccount, (req, res, next) => controller.getById(req, res).catch(next));
    router.patch('/:id/lines/:lineId', authenticateAccount, (req, res, next) => controller.updateLine(req, res).catch(next));
    router.delete('/:id/lines/:lineId', authenticateAccount, (req, res, next) => controller.removeLine(req, res).catch(next));

    return router;
}

export default createAvailmentRoutes;
