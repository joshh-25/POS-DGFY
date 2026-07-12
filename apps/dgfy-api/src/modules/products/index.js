// Dependency-injection wiring point for the products module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../businesses/index.js's buildBusinessesModule() pattern.
//
// Task 1 (08-03-PLAN.md) exports the repository/entity/usecase layers built
// so far. Task 2 adds controllers/routes.js and the full buildProductsModule
// DI factory returning { repository, folderRepository, useCases } plus
// createProductRoutes — this barrel will be extended then, not replaced.

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
