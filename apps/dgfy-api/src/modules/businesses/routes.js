import express from 'express';
import { buildBusinessController } from './controllers/businessController.js';
import { buildLocationController } from './controllers/locationController.js';
import { buildTenantSessionController } from './controllers/tenantSessionController.js';
import { buildTenantRegistryController } from './controllers/tenantRegistryController.js';

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
    const locationController = buildLocationController(useCases);
    const tenantSessionController = buildTenantSessionController(useCases);
    const tenantRegistryController = buildTenantRegistryController(useCases);

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

    // Wave 3.5 (D-12): Location & Branch Management, exposed through the
    // Businesses APIs (not separate top-level endpoints) — nested under
    // the business resource, sharing the same authenticateAccount gate.
    router.post(
        '/:businessId/locations',
        authenticateAccount,
        (req, res, next) => locationController.createLocation(req, res).catch(next)
    );
    router.get(
        '/:businessId/locations',
        authenticateAccount,
        (req, res, next) => locationController.listLocations(req, res).catch(next)
    );
    router.get(
        '/:businessId/locations/:locationId',
        authenticateAccount,
        (req, res, next) => locationController.getLocation(req, res).catch(next)
    );
    router.patch(
        '/:businessId/locations/:locationId',
        authenticateAccount,
        (req, res, next) => locationController.updateLocation(req, res).catch(next)
    );
    router.post(
        '/:businessId/locations/:locationId/set-primary',
        authenticateAccount,
        (req, res, next) => locationController.setPrimary(req, res).catch(next)
    );
    router.delete(
        '/:businessId/locations/:locationId',
        authenticateAccount,
        (req, res, next) => locationController.deleteLocation(req, res).catch(next)
    );

    // Wave 4 (D-14, API-04): mid-session business/tenant activation —
    // switches active tenant context without re-login, using the same
    // session token. Membership + tenant-local assignment enforcement
    // happens inside tenantSessionUseCases.js.
    router.post(
        '/:id/activate-session',
        authenticateAccount,
        (req, res, next) => tenantSessionController.activateSession(req, res).catch(next)
    );

    // Wave 6 gap-closure (API-03, D-13/D-14): safe tenant registry metadata
    // lookup under the existing Businesses APIs (not a separate tenancy
    // route module) — read-only, no session-activation side effect,
    // independent from POST /:id/activate-session above.
    router.get(
        '/:id/tenant-registry',
        authenticateAccount,
        (req, res, next) => tenantRegistryController.getTenantRegistry(req, res).catch(next)
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
