// Dependency-injection wiring point for the products module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../businesses/index.js's buildBusinessesModule() pattern.
//
// Task 1 (08-03-PLAN.md) built the repository/entity/usecase layers. Task 2
// adds the controllers/routes.js layer and this file's buildProductsModule()
// factory, closing every usecase over ProductRepository/ProductFolderRepository
// (both tenant-scoped, resolved via the injected TenantConnector) and the
// businesses module's BusinessRepository (membership/owner-role access
// control only — membership lives in the landlord dgfy_core database).
//
// Composition wiring (mounting createProductRoutes() under /products in
// apps/dgfy-api/src/routes/index.js) is 08-08's scope, not this file's.

export { ProductRepository, buildProductRepository } from './repositories/productRepository.js';
export { ProductFolderRepository, buildProductFolderRepository } from './repositories/productFolderRepository.js';
export { ProductEntity, createProductEntity } from './entities/productEntity.js';
export {
    PRODUCT_CATEGORIES,
    INVENTORY_MODES,
    buildCreateProductUseCase,
    buildListProductsUseCase,
    buildUpdateProductUseCase,
    buildSetProductBookableUseCase
} from './usecases/productUseCases.js';
export {
    buildCreateProductFolderUseCase,
    buildListProductFoldersUseCase,
    buildGetProductFolderUseCase
} from './usecases/productFolderUseCases.js';
export { buildProductController } from './controllers/productController.js';
export { buildProductFolderController } from './controllers/productFolderController.js';
export { createProductRoutes } from './routes.js';

import { ProductRepository } from './repositories/productRepository.js';
import { ProductFolderRepository } from './repositories/productFolderRepository.js';
import {
    buildCreateProductUseCase,
    buildListProductsUseCase,
    buildUpdateProductUseCase,
    buildSetProductBookableUseCase
} from './usecases/productUseCases.js';
import {
    buildCreateProductFolderUseCase,
    buildListProductFoldersUseCase,
    buildGetProductFolderUseCase
} from './usecases/productFolderUseCases.js';

/**
 * Builds the fully wired products module: a ProductRepository +
 * ProductFolderRepository (both tenant-scoped, resolved via the injected
 * tenantConnector) plus every usecase closed over them and the injected
 * businessRepository (used ONLY for membership/owner-role access control).
 *
 * @param {{tenantConnector, businessDatabaseRegistryRepository?, businessRepository}} deps
 * @returns {{repository: ProductRepository, folderRepository: ProductFolderRepository, useCases: Object}}
 */
export function buildProductsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
} = {}) {
    const repository = new ProductRepository({ tenantConnector, businessDatabaseRegistryRepository });
    const folderRepository = new ProductFolderRepository({ tenantConnector, businessDatabaseRegistryRepository });

    return {
        repository,
        folderRepository,
        useCases: {
            createProduct: buildCreateProductUseCase({ repository, businessRepository }),
            listProducts: buildListProductsUseCase({ repository, businessRepository }),
            updateProduct: buildUpdateProductUseCase({ repository, businessRepository }),
            setProductBookable: buildSetProductBookableUseCase({ repository, businessRepository }),

            createProductFolder: buildCreateProductFolderUseCase({ repository: folderRepository, businessRepository }),
            listProductFolders: buildListProductFoldersUseCase({ repository: folderRepository, businessRepository }),
            getProductFolder: buildGetProductFolderUseCase({ repository: folderRepository, businessRepository })
        }
    };
}

export default buildProductsModule;
