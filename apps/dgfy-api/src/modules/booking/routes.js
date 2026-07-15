import express from 'express';
import { buildBookingController } from './controllers/bookingController.js';

// Wires Express routing for the booking module (Interface Adapter), mirroring
// ../accounts/routes.js / ../products/routes.js. Routes are thin: define
// paths/methods and delegate to the injected controller. Errors from async
// handlers are forwarded to Express's error middleware via `.catch(next)`
// rather than being swallowed.
//
// `authenticateAccount` is injected by the caller per Dependency Inversion —
// this file never imports a concrete middleware implementation directly.
// Every route requires authentication: booking create/cancel/list all need
// req.account.id (D-09's dual cancel-authorization check depends on it).
//
// @param {Object} useCases - booking module use cases (buildBookingModule().useCases)
// @param {{authenticateAccount: Function}} deps
export function createBookingRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createBookingRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const controller = buildBookingController(useCases);

    router.post('/', authenticateAccount, (req, res, next) => controller.createBooking(req, res).catch(next));
    router.post('/:id/cancel', authenticateAccount, (req, res, next) => controller.cancelBooking(req, res).catch(next));
    router.get('/', authenticateAccount, (req, res, next) => controller.listBookings(req, res).catch(next));

    return router;
}

export default createBookingRoutes;
