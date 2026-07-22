import express from 'express';
import { buildProductController } from './controllers/productController.js';
import { buildProductFolderController } from './controllers/productFolderController.js';

/**
 * Wires Express routing for the products module (Interface Adapter). Routes
 * are thin: define paths/methods and delegate to the injected controllers.
 * Errors from async handlers are forwarded to Express's error middleware via
 * `.catch(next)` rather than being swallowed. Mirrors
 * ../accounts/routes.js's createAccountRoutes() shape.
 *
 * Mounted top-level at /products (per 08-PATTERNS.md — NOT nested under
 * /businesses/:businessId like ../businesses/routes.js's location routes).
 * Folder routes are mounted under /products/folders on the SAME router so
 * 08-08's composition root only needs `router.use('/products',
 * createProductRoutes(...))` once.
 *
 * `authenticateAccount` is the accounts module's own auth middleware and is
 * injected by the caller per Dependency Inversion — this file never imports
 * a concrete middleware implementation directly.
 *
 * @param {Object} useCases - products module use cases (buildProductsModule().useCases)
 * @param {{authenticateAccount: Function}} deps
 */
export function createProductRoutes(useCases, { authenticateAccount } = {}) {
    if (typeof authenticateAccount !== 'function') {
        throw new Error('createProductRoutes requires an authenticateAccount middleware.');
    }

    const router = express.Router();
    const productController = buildProductController(useCases);
    const folderController = buildProductFolderController(useCases);

    // Folder routes first so '/folders' is never captured by '/:id'.
    router.post('/folders', authenticateAccount, (req, res, next) => folderController.createFolder(req, res).catch(next));
    router.get('/folders', authenticateAccount, (req, res, next) => folderController.listFolders(req, res).catch(next));

    router.post('/', authenticateAccount, (req, res, next) => productController.createProduct(req, res).catch(next));
    router.get('/', authenticateAccount, (req, res, next) => productController.listProducts(req, res).catch(next));
    router.patch('/:id/bookable', authenticateAccount, (req, res, next) => productController.setBookable(req, res).catch(next));
    router.patch('/:id', authenticateAccount, (req, res, next) => productController.updateProduct(req, res).catch(next));

    return router;
}

export default createProductRoutes;
