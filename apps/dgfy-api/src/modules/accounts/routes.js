import express from 'express';
import { buildAccountController } from './controllers/accountController.js';

/**
 * Wires Express routing for the accounts module (Interface Adapter). Routes
 * are thin: define paths/methods and delegate to the injected controller.
 * Errors from async handlers are forwarded to Express's error middleware via
 * `.catch(next)` rather than being swallowed.
 *
 * `authenticateAccount` is this module's own auth middleware (built by
 * middleware/accountAuthMiddleware.js's buildAccountAuthMiddleware factory)
 * and is injected by the caller per Dependency Inversion — this file never
 * imports a concrete middleware implementation directly.
 *
 * @param {Object} useCases - accounts module use cases (buildAccountsModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createAccountRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createAccountRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildAccountController(useCases);

    router.post('/register', (req, res, next) => controller.register(req, res).catch(next));
    router.post('/login', (req, res, next) => controller.login(req, res).catch(next));
    router.get('/me', authenticateAccount, (req, res, next) => controller.getMe(req, res).catch(next));
    router.patch('/me', authenticateAccount, (req, res, next) => controller.updateProfile(req, res).catch(next));
    router.get('/:id', authenticateAccount, (req, res, next) => controller.getAccount(req, res).catch(next));

    return router;
}

export default createAccountRoutes;
