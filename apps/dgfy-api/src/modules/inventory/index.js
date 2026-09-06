import {
  itemRepository,
  resolveCachedWorkflowMode,
  resolveCachedEnabledCapabilities,
  resolveCachedDisabledCapabilities,
  clearItemRepositorySettingsCache
} from './repositories/itemRepository.js';

export { clearItemRepositorySettingsCache };
import { buildGetItemsUseCase } from './usecases/getItemsUseCase.js';
import { buildGetItemByIdUseCase } from './usecases/getItemByIdUseCase.js';
import { buildCreateItemUseCase } from './usecases/createItemUseCase.js';
import { buildUpdateItemUseCase } from './usecases/updateItemUseCase.js';
import { buildFinalizeItemUseCase } from './usecases/finalizeItemUseCase.js';
import { buildDeleteItemUseCase } from './usecases/deleteItemUseCase.js';
import { buildRestoreItemUseCase } from './usecases/restoreItemUseCase.js';
import { buildReactivateItemUseCase } from './usecases/reactivateItemUseCase.js';
import { buildGetItemStockHistoryUseCase } from './usecases/getItemStockHistoryUseCase.js';
import { buildGetItemBatchesUseCase } from './usecases/getItemBatchesUseCase.js';
import { buildGetItemMovementsUseCase } from './usecases/getItemMovementsUseCase.js';
import { buildValidateCompositionUseCase } from './usecases/validateCompositionUseCase.js';
import { buildGetItemSupplierCoverageUseCase } from './usecases/getItemSupplierCoverageUseCase.js';
import { buildReplaceItemSuppliersUseCase } from './usecases/replaceItemSuppliersUseCase.js';
import { buildGetFoldersUseCase } from './usecases/getFoldersUseCase.js';
import { buildCreateFolderUseCase } from './usecases/createFolderUseCase.js';
import { buildUpdateFolderUseCase } from './usecases/updateFolderUseCase.js';
import { buildDeleteFolderUseCase } from './usecases/deleteFolderUseCase.js';
import { buildListItemFoldersUseCase } from './usecases/listItemFoldersUseCase.js';
import { buildReplaceItemFoldersUseCase } from './usecases/replaceItemFoldersUseCase.js';
import {
  buildListStorefrontCatalogOverridesUseCase,
  buildUpdateStorefrontCatalogOverrideUseCase,
  buildUpdateBulkStorefrontCatalogOverridesUseCase,
  buildUploadStorefrontCatalogImageUseCase,
  buildUploadStorefrontCatalogGalleryImagesUseCase,
  buildUploadBulkStorefrontCatalogImagesUseCase,
  buildUpdateStorefrontCatalogGalleryUseCase,
  buildDeleteStorefrontCatalogGalleryImageUseCase,
  buildDeleteStorefrontCatalogImageUseCase,
  buildGenerateItemImageUseCase,
  buildBulkGenerateItemImageUseCase
} from './usecases/storefrontCatalogUseCases.js';
import {
  buildAttachItemBarcodeUseCase,
  buildDeactivateItemBarcodeUseCase,
  buildGenerateItemBarcodeUseCase,
  buildListItemBarcodesUseCase,
  buildRenderItemBarcodeLabelUseCase,
  buildResolveItemBarcodeConflictUseCase,
  buildResolveItemBarcodeUseCase,
  buildSetPrimaryItemBarcodeUseCase,
  buildUpdateItemBarcodeUseCase
} from './usecases/barcodeUseCases.js';
import { buildLookupExternalProductUseCase } from './usecases/lookupExternalProductUseCase.js';
import { buildImportExternalProductImageUseCase } from './usecases/importExternalProductImageUseCase.js';
import { buildOpenFoodFactsProductRegistry } from './integrations/openFoodFactsProductRegistry.js';
import { buildOpenPricesProductPriceRegistry } from './integrations/openPricesProductPriceRegistry.js';
import { storefrontCatalogImageStorage } from './repositories/storefrontCatalogImageStorage.js';
// Phase 298 (#265): static import, deliberately -- itemRepository.js (this same module) already
// statically imports `getAllSettingsUseCase` from '../../settings/index.js' with no reverse cycle
// (the two dynamic settings->inventory imports in updateSettingsUseCase.js/
// updateSettingByKeyUseCase.js exist for the opposite direction and stay dynamic). A direct import
// of the settings repository here carries the same, already-proven-safe direction.
import { settingsRepository } from '../settings/repositories/settingsRepository.js';
import { resolveMovementLocation } from '../../services/locationInventoryService.js';
import * as cacheService from '../../services/cacheService.js';
import * as stockCommandService from './commands/stockCommandService.js';
import { inventoryReservationService } from './services/inventoryReservationService.js';
import { resolveInventoryAuthority } from '../shared/utils/inventoryAuthoritySettingsCache.js';
import { buildLookupDelegatedInventoryLevelUseCase } from './usecases/lookupDelegatedInventoryLevelUseCase.js';
import { manualDelegatedInventoryProvider } from './integrations/manualDelegatedInventoryProvider.js';


export const getItemsUseCase = buildGetItemsUseCase({
  itemRepository,
  resolveLocationScope: resolveMovementLocation
});
export const getItemByIdUseCase = buildGetItemByIdUseCase({ itemRepository });
export const createItemUseCase = buildCreateItemUseCase({
  itemRepository,
  resolveWorkflowMode: resolveCachedWorkflowMode,
  resolveEnabledCapabilities: resolveCachedEnabledCapabilities,
  resolveDisabledCapabilities: resolveCachedDisabledCapabilities,
  resolveInventoryAuthority
});
export const updateItemUseCase = buildUpdateItemUseCase({
  itemRepository,
  resolveWorkflowMode: resolveCachedWorkflowMode,
  resolveEnabledCapabilities: resolveCachedEnabledCapabilities,
  resolveDisabledCapabilities: resolveCachedDisabledCapabilities,
  resolveInventoryAuthority
});
export const finalizeItemUseCase = buildFinalizeItemUseCase({
  itemRepository,
  resolveWorkflowMode: resolveCachedWorkflowMode,
  resolveEnabledCapabilities: resolveCachedEnabledCapabilities,
  resolveDisabledCapabilities: resolveCachedDisabledCapabilities,
  resolveInventoryAuthority
});

export const deleteItemUseCase = buildDeleteItemUseCase({ itemRepository });
export const restoreItemUseCase = buildRestoreItemUseCase({ itemRepository });
export const reactivateItemUseCase = buildReactivateItemUseCase({ itemRepository });
export const getItemStockHistoryUseCase = buildGetItemStockHistoryUseCase({ itemRepository });
export const getItemBatchesUseCase = buildGetItemBatchesUseCase({ itemRepository });
export const getItemMovementsUseCase = buildGetItemMovementsUseCase({ itemRepository });
export const validateCompositionUseCase = buildValidateCompositionUseCase({ itemRepository });
export const getItemSupplierCoverageUseCase = buildGetItemSupplierCoverageUseCase({ itemRepository });
export const replaceItemSuppliersUseCase = buildReplaceItemSuppliersUseCase({ itemRepository });
export const getFoldersUseCase = buildGetFoldersUseCase({ itemRepository });
export const createFolderUseCase = buildCreateFolderUseCase({ itemRepository });
export const updateFolderUseCase = buildUpdateFolderUseCase({ itemRepository });
export const deleteFolderUseCase = buildDeleteFolderUseCase({ itemRepository });
export const listItemFoldersUseCase = buildListItemFoldersUseCase({ itemRepository });
export const replaceItemFoldersUseCase = buildReplaceItemFoldersUseCase({ itemRepository });
export const listStorefrontCatalogOverridesUseCase = buildListStorefrontCatalogOverridesUseCase({ itemRepository });
export const updateStorefrontCatalogOverrideUseCase = buildUpdateStorefrontCatalogOverrideUseCase({ itemRepository });
export const updateBulkStorefrontCatalogOverridesUseCase = buildUpdateBulkStorefrontCatalogOverridesUseCase({ itemRepository });
export const uploadStorefrontCatalogImageUseCase = buildUploadStorefrontCatalogImageUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage,
  settingsRepository
});
export const uploadStorefrontCatalogGalleryImagesUseCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const uploadBulkStorefrontCatalogImagesUseCase = buildUploadBulkStorefrontCatalogImagesUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage,
  settingsRepository
});
export const updateStorefrontCatalogGalleryUseCase = buildUpdateStorefrontCatalogGalleryUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const deleteStorefrontCatalogGalleryImageUseCase = buildDeleteStorefrontCatalogGalleryImageUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const deleteStorefrontCatalogImageUseCase = buildDeleteStorefrontCatalogImageUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const generateItemImageUseCase = buildGenerateItemImageUseCase({ itemRepository });
export const bulkGenerateItemImageUseCase = buildBulkGenerateItemImageUseCase({ itemRepository });
export const listItemBarcodesUseCase = buildListItemBarcodesUseCase({ itemRepository });
export const attachItemBarcodeUseCase = buildAttachItemBarcodeUseCase({ itemRepository });
export const generateItemBarcodeUseCase = buildGenerateItemBarcodeUseCase({ itemRepository });
export const updateItemBarcodeUseCase = buildUpdateItemBarcodeUseCase({ itemRepository });
export const deactivateItemBarcodeUseCase = buildDeactivateItemBarcodeUseCase({ itemRepository });
export const setPrimaryItemBarcodeUseCase = buildSetPrimaryItemBarcodeUseCase({ itemRepository });
export const resolveItemBarcodeUseCase = buildResolveItemBarcodeUseCase({
  itemRepository,
  resolveLocationScope: resolveMovementLocation
});
const openFoodFactsProductRegistry = buildOpenFoodFactsProductRegistry();
const openPricesProductPriceRegistry = buildOpenPricesProductPriceRegistry();
export const lookupExternalProductUseCase = buildLookupExternalProductUseCase({
  productRegistry: openFoodFactsProductRegistry,
  priceRegistry: openPricesProductPriceRegistry,
  cache: cacheService
});
export const importExternalProductImageUseCase = buildImportExternalProductImageUseCase({
  lookupExternalProduct: lookupExternalProductUseCase,
  uploadStorefrontCatalogImage: uploadStorefrontCatalogImageUseCase
});
export const resolveItemBarcodeConflictUseCase = buildResolveItemBarcodeConflictUseCase({ itemRepository });
export const renderItemBarcodeLabelUseCase = buildRenderItemBarcodeLabelUseCase({ itemRepository });
export const inventoryStockCommandService = stockCommandService;
export { inventoryReservationService };
// Phase 9: read-side port for a tenant's delegated external IMS - see
// docs/features/INVENTORY_TRACKING_MODES.md's external_ims section and
// lookupDelegatedInventoryLevelUseCase.js for the resilience shape (mirrors
// lookupExternalProductUseCase's cache-aside + typed DomainError mapping).
// manualDelegatedInventoryProvider is a documented no-op default - there is
// no live external IMS integrated yet; a real adapter is future work once
// the Governance PR's ADR 0035 seam is ratified.
export const lookupDelegatedInventoryLevelUseCase = buildLookupDelegatedInventoryLevelUseCase({
  delegatedInventoryProvider: manualDelegatedInventoryProvider,
  cache: cacheService
});
export { resolveMovementLocation, resolveInventoryAuthority };

export * from './commands/stockCommandService.js';
export * from './contracts/itemRepository.contract.js';
export * from './repositories/itemRepository.js';
