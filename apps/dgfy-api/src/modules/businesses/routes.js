import express from 'express';
import { buildBusinessController } from './controllers/businessController.js';

/**
 * Wires Express routing for the businesses module (Interface Adapter),
 * mirrors ../accounts/routes.js. Routes are thin: define paths/methods and
 * delegate to the injected controller. Errors from async handlers are
 * forwarded to Express's error middleware via `.catch(next)`.
 *
 * `authenticateAccount` is the accounts module's own auth middleware
 * (../accounts/middleware/accountAuthMiddleware.js's
 * buildAccountAuthMiddleware factory) — businesses is authenticated by the
 * same DgfyAccount session, so this is injected by the caller
 * (routes/index.js) rather than re-implemented here.
 *
 * @param {Object} [useCases] - businesses module use cases (buildBusinessesModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createBusinessRoutes(useCases = {}, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createBusinessRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildBusinessController(useCases);

    router.post('/', authenticateAccount, (req, res, next) => controller.createBusiness(req, res).catch(next));
    router.get('/', authenticateAccount, (req, res, next) => controller.listUserBusinesses(req, res).catch(next));
    router.get('/:id', authenticateAccount, (req, res, next) => controller.getBusiness(req, res).catch(next));
    router.patch('/:id', authenticateAccount, (req, res, next) => controller.updateBusiness(req, res).catch(next));
    router.post('/:id/staff', authenticateAccount, (req, res, next) => controller.onboardStaff(req, res).catch(next));
    router.get(
        '/:id/staff',
        authenticateAccount,
        (req, res, next) => controller.listBusinessMembers(req, res).catch(next)
    );

    return router;
}

/**
 * Separate router for invitation acceptance, mounted at the top-level
 * `/invitations` path (per 04-03-PLAN.md Task 4's literal endpoint list:
 * `POST /invitations/:token/accept`, not `/businesses/invitations/:token/
 * accept`). Deliberately unauthenticated — the invitee has no DgfyAccount/
 * session yet.
 * @param {Object} [useCases] - businesses module use cases
 */
export function createInvitationRoutes(useCases = {}) {
    const router = express.Router();
    const controller = buildBusinessController(useCases);

    router.post('/:token/accept', (req, res, next) => controller.acceptInvitation(req, res).catch(next));

    return router;
}

export default createBusinessRoutes;
