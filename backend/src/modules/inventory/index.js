import { itemRepository } from './repositories/itemRepository.js';
import { buildGetItemsUseCase } from './usecases/getItemsUseCase.js';
import { buildGetItemByIdUseCase } from './usecases/getItemByIdUseCase.js';
import { buildCreateItemUseCase } from './usecases/createItemUseCase.js';
import { buildUpdateItemUseCase } from './usecases/updateItemUseCase.js';
import { buildFinalizeItemUseCase } from './usecases/finalizeItemUseCase.js';
import { buildDeleteItemUseCase } from './usecases/deleteItemUseCase.js';
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
import {
  buildListStorefrontCatalogOverridesUseCase,
  buildUpdateStorefrontCatalogOverrideUseCase,
  buildUpdateBulkStorefrontCatalogOverridesUseCase,
  buildUploadStorefrontCatalogImageUseCase,
  buildUploadStorefrontCatalogGalleryImagesUseCase,
  buildUploadBulkStorefrontCatalogImagesUseCase,
  buildDeleteStorefrontCatalogImageUseCase
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
import { storefrontCatalogImageStorage } from './repositories/storefrontCatalogImageStorage.js';
import { resolveMovementLocation } from '../../services/locationInventoryService.js';
import { getAllSettingsUseCase } from '../settings/index.js';
import { unwrapApplicationResultOrThrow } from '../shared/contracts/applicationResultHelpers.js';
import { DEFAULT_WORKFLOW_MODE, normalizeWorkflowMode } from '../shared/constants/workflowModes.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';

const resolveCurrentWorkflowMode = async () => {
  const settings = unwrapApplicationResultOrThrow(
    await getAllSettingsUseCase(),
    'Failed to retrieve settings'
  );
  return normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
};

export const getItemsUseCase = buildGetItemsUseCase({ itemRepository });
export const getItemByIdUseCase = buildGetItemByIdUseCase({ itemRepository });
export const createItemUseCase = buildCreateItemUseCase({ itemRepository, resolveWorkflowMode: resolveCurrentWorkflowMode });
export const updateItemUseCase = buildUpdateItemUseCase({ itemRepository, resolveWorkflowMode: resolveCurrentWorkflowMode });
export const finalizeItemUseCase = buildFinalizeItemUseCase({ itemRepository, resolveWorkflowMode: resolveCurrentWorkflowMode });
export const deleteItemUseCase = buildDeleteItemUseCase({ itemRepository });
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
export const listStorefrontCatalogOverridesUseCase = buildListStorefrontCatalogOverridesUseCase({ itemRepository });
export const updateStorefrontCatalogOverrideUseCase = buildUpdateStorefrontCatalogOverrideUseCase({ itemRepository });
export const updateBulkStorefrontCatalogOverridesUseCase = buildUpdateBulkStorefrontCatalogOverridesUseCase({ itemRepository });
export const uploadStorefrontCatalogImageUseCase = buildUploadStorefrontCatalogImageUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const uploadStorefrontCatalogGalleryImagesUseCase = buildUploadStorefrontCatalogGalleryImagesUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const uploadBulkStorefrontCatalogImagesUseCase = buildUploadBulkStorefrontCatalogImagesUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
export const deleteStorefrontCatalogImageUseCase = buildDeleteStorefrontCatalogImageUseCase({
  itemRepository,
  imageStorage: storefrontCatalogImageStorage
});
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
export const resolveItemBarcodeConflictUseCase = buildResolveItemBarcodeConflictUseCase({ itemRepository });
export const renderItemBarcodeLabelUseCase = buildRenderItemBarcodeLabelUseCase({ itemRepository });

export * from './contracts/itemRepository.contract.js';
export * from './repositories/itemRepository.js';
