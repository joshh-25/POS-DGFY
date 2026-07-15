import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter), mirrors
// ./productController.js / ../../businesses/controllers/locationController.js.
// Mounted top-level at /products/folders (per 08-PATTERNS.md) — businessId
// is read from the request body (writes) or query string (reads).
//
// @param {Object} [useCases] - products module use cases (buildProductsModule().useCases)
export function buildProductFolderController(useCases = {}) {
    return {
        // POST /products/folders (owner role required)
        async createFolder(req, res) {
            const body = req.body || {};
            const result = await useCases.createProductFolder({
                businessId: body.businessId,
                requestingAccountId: req.account.id,
                name: body.name,
                description: body.description,
                show_in_pos_filter: body.show_in_pos_filter
            });
            return sendUseCaseResult(res, result, 201);
        },

        // GET /products/folders (membership required)
        async listFolders(req, res) {
            const includeInactive = req.query.include_inactive === 'true';
            const result = await useCases.listProductFolders({
                businessId: req.query.businessId,
                requestingAccountId: req.account.id,
                includeInactive
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildProductFolderController;
