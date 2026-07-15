import express from 'express';
import { buildComplianceController } from './controllers/complianceController.js';

/**
 * Wires Express routing for the compliance module (Interface Adapter).
 * Routes are thin: define paths/methods and delegate to the injected
 * controller. Errors from async handlers are forwarded to Express's error
 * middleware via `.catch(next)` rather than being swallowed. Mirrors
 * ../accounts/routes.js / ../shifts/routes.js's factory shape.
 *
 * `authenticateAccount` is the accounts module's auth middleware, injected
 * by the caller per Dependency Inversion — this file never imports a
 * concrete middleware implementation directly.
 *
 * Mounting createComplianceRoutes() under /compliance in
 * apps/dgfy-api/src/routes/index.js is 08-08's scope, not this file's.
 *
 * @param {Object} useCases - compliance module use cases (buildComplianceModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createComplianceRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createComplianceRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildComplianceController(useCases);

    router.get('/state', authenticateAccount, (req, res, next) => controller.getState(req, res).catch(next));
    router.post('/evidence', authenticateAccount, (req, res, next) => controller.submitEvidence(req, res).catch(next));
    router.post('/review', authenticateAccount, (req, res, next) => controller.review(req, res).catch(next));

    return router;
}

export default createComplianceRoutes;
