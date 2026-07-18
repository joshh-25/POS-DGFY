import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../businesses/controllers/locationController.js /
// ../../products/controllers/productController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule.
//
// modules/booking mounts top-level (/bookings), NOT nested under
// /businesses/:businessId (08-PATTERNS.md) — businessId is read from
// req.body (writes) or req.query (reads), never req.params, matching
// modules/products/inventory/shifts/compliance's convention.
//
// @param {Object} [useCases] - booking module use cases (buildBookingModule().useCases)
export function buildBookingController(useCases = {}) {
    return {
        // POST /bookings
        async createBooking(req, res) {
            const body = req.body || {};
            const result = await useCases.createBooking({
                businessId: body.business_id,
                requestingAccountId: req.account.id,
                productId: body.product_id,
                branchId: body.branch_id,
                slotStart: body.slot_start,
                customer_account_id: body.customer_account_id
            });
            return sendUseCaseResult(res, result, 201);
        },

        // POST /bookings/:id/cancel — D-09: dual-authorized (staff/owner OR
        // the booking's own consumer account, req.account.id is passed as
        // requestingAccountId either way).
        async cancelBooking(req, res) {
            const body = req.body || {};
            const result = await useCases.cancelBooking({
                businessId: body.business_id,
                bookingId: req.params.id,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // GET /bookings (membership required)
        async listBookings(req, res) {
            const query = req.query || {};
            const result = await useCases.listBookings({
                businessId: query.business_id,
                requestingAccountId: req.account.id,
                branchId: query.branch_id,
                productId: query.product_id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildBookingController;
