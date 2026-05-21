import * as csvExportService from '../../services/csvExportService.js';
import * as csvImportService from '../../services/csvImportService.js';
import * as supplierCSVService from '../../services/supplierCSVService.js';
import {
  buildExportByIdsUseCase,
  buildExportFilteredUseCase,
  buildExportAllItemsUseCase,
  buildPreviewItemsImportUseCase,
  buildConfirmItemsImportUseCase,
  buildGetItemsTemplateHeadersUseCase,
  buildExportSuppliersUseCase,
  buildGetSupplierTemplateHeadersUseCase,
  buildPreviewSuppliersImportUseCase,
  buildConfirmSuppliersImportUseCase
} from './usecases/csvUseCases.js';

export const exportByIdsUseCase = buildExportByIdsUseCase({ csvExportService });
export const exportFilteredUseCase = buildExportFilteredUseCase({ csvExportService });
export const exportAllItemsUseCase = buildExportAllItemsUseCase({ csvExportService });
export const previewItemsImportUseCase = buildPreviewItemsImportUseCase({ csvImportService });
export const confirmItemsImportUseCase = buildConfirmItemsImportUseCase({ csvImportService });
export const getItemsTemplateHeadersUseCase = buildGetItemsTemplateHeadersUseCase({ csvImportService });
export const exportSuppliersUseCase = buildExportSuppliersUseCase({ supplierCSVService });
export const getSupplierTemplateHeadersUseCase = buildGetSupplierTemplateHeadersUseCase({ supplierCSVService });
export const previewSuppliersImportUseCase = buildPreviewSuppliersImportUseCase({ supplierCSVService });
export const confirmSuppliersImportUseCase = buildConfirmSuppliersImportUseCase({ supplierCSVService });
