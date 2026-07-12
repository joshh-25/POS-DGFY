import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ../../businesses/controllers/locationController.js. Parses HTTP request
// data, calls the injected use case, and formats the response via
// sendUseCaseResult. No business logic, no direct model/repository imports
// — this directory is blocked from importing models by
// apps/dgfy-api/eslint.config.mjs's no-restricted-imports rule. Use cases
// are received via the `useCases` parameter (Dependency Inversion); this
// module never imports products/usecases/productUseCases.js directly.
//
// Unlike ../../businesses/controllers/locationController.js (nested under
// /businesses/:businessId/...), the products module mounts top-level at
// /products (per 08-PATTERNS.md), so businessId is read from the request
// body (writes) or query string (reads), never req.params.
//
// @param {Object} [useCases] - products module use cases (buildProductsModule().useCases)
export function buildProductController(useCases = {}) {
    return {
        // POST /products (owner role required)
        async createProduct(req, res) {
            const body = req.body || {};
            const result = await useCases.createProduct({
                businessId: body.businessId,
                requestingAccountId: req.account.id,
                name: body.name,
                category: body.category,
                inventory_mode: body.inventory_mode,
                folder_id: body.folder_id,
                base_price: body.base_price
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /products (membership required)
        async listProducts(req, res) {
            const includeInactive = req.query.include_inactive === 'true';
            const result = await useCases.listProducts({
                businessId: req.query.businessId,
                requestingAccountId: req.account.id,
                includeInactive
            });
            return sendUseCaseResult(res, result, 200);
        },

        // PATCH /products/:id (owner role required)
        async updateProduct(req, res) {
            const body = req.body || {};
            const updates = {};
            ['name', 'category', 'inventory_mode', 'folder_id', 'base_price', 'is_active'].forEach((key) => {
                if (Object.prototype.hasOwnProperty.call(body, key)) {
                    updates[key] = body[key];
                }
            });

            const result = await useCases.updateProduct({
                businessId: body.businessId,
                productId: req.params.id,
                requestingAccountId: req.account.id,
                updates
            });
            return sendUseCaseResult(res, result, 200);
        },

        // PATCH /products/:id/bookable (owner role required, BOK-01)
        async setBookable(req, res) {
            const body = req.body || {};
            const result = await useCases.setProductBookable({
                businessId: body.businessId,
                productId: req.params.id,
                requestingAccountId: req.account.id,
                slot_duration_minutes: body.slot_duration_minutes,
                concurrent_capacity: body.concurrent_capacity
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildProductController;
