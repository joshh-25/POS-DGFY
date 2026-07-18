import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ./businessController.js. Parses HTTP request data, calls the injected use
// case, and formats the response via sendUseCaseResult. No business logic,
// no direct model/repository imports — this directory is blocked from
// importing models by apps/dgfy-api/eslint.config.mjs's no-restricted-
// imports rule. Use cases are received via the `useCases` parameter
// (Dependency Inversion); this module never imports
// businesses/usecases/locationUseCases.js directly.
//
// @param {Object} [useCases] - businesses module use cases (buildBusinessesModule().useCases)
export function buildLocationController(useCases = {}) {
    return {
        // POST /businesses/:businessId/locations (owner role required)
        async createLocation(req, res) {
            const { name, address_line, latitude, longitude, setAsPrimary } = req.body || {};
            const result = await useCases.createLocation({
                businessId: req.params.businessId,
                requestingAccountId: req.account.id,
                name,
                address_line,
                latitude,
                longitude,
                setAsPrimary
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /businesses/:businessId/locations (membership required)
        async listLocations(req, res) {
            const includeInactive = req.query.include_inactive === 'true';
            const result = await useCases.listLocations({
                businessId: req.params.businessId,
                requestingAccountId: req.account.id,
                includeInactive
            });
            return sendUseCaseResult(res, result, 200);
        },

        // GET /businesses/:businessId/locations/:locationId (membership required)
        async getLocation(req, res) {
            const result = await useCases.getLocation({
                businessId: req.params.businessId,
                locationId: req.params.locationId,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // PATCH /businesses/:businessId/locations/:locationId (owner role required)
        async updateLocation(req, res) {
            const body = req.body || {};
            const updates = {};
            ['name', 'address_line', 'latitude', 'longitude', 'is_active'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(body, key)) {
                    updates[key] = body[key];
                }
            });

            const result = await useCases.updateLocation({
                businessId: req.params.businessId,
                locationId: req.params.locationId,
                requestingAccountId: req.account.id,
                updates
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /businesses/:businessId/locations/:locationId/set-primary (owner role required)
        async setPrimary(req, res) {
            const result = await useCases.setPrimaryLocation({
                businessId: req.params.businessId,
                locationId: req.params.locationId,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        },

        // DELETE /businesses/:businessId/locations/:locationId (owner role required)
        async deleteLocation(req, res) {
            const result = await useCases.deleteLocation({
                businessId: req.params.businessId,
                locationId: req.params.locationId,
                requestingAccountId: req.account.id
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildLocationController;
