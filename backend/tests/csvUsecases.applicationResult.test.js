import { jest } from '@jest/globals';
import {
  buildExportByIdsUseCase,
  buildPreviewItemsImportUseCase,
  buildGetItemsTemplateHeadersUseCase,
  buildConfirmSuppliersImportUseCase
} from '../src/modules/csv/usecases/csvUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('csv use-cases application result contract', () => {
  it('exportByIds validates itemIds array', async () => {
    const useCase = buildExportByIdsUseCase({
      csvExportService: { exportByIds: jest.fn() }
    });

    const result = await useCase({ itemIds: [] });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('previewItemsImport wraps service success payload', async () => {
    const previewImport = jest.fn().mockResolvedValue({
      success: true,
      validRows: 3,
      invalidRows: 1
    });
    const useCase = buildPreviewItemsImportUseCase({
      csvImportService: { previewImport }
    });

    const result = await useCase({ csvContent: 'sku_code,name\nRM-1,Flour' });

    expect(previewImport).toHaveBeenCalledWith('sku_code,name\nRM-1,Flour');
    expect(result).toEqual({
      success: true,
      data: { success: true, validRows: 3, invalidRows: 1 },
      error: null,
      message: null
    });
  });

  it('getItemsTemplateHeaders validates template type', async () => {
    const useCase = buildGetItemsTemplateHeadersUseCase({
      csvImportService: { getTemplateHeaders: jest.fn() }
    });

    const result = await useCase({ templateType: 'bad-type' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('confirmSuppliersImport maps service failure payloads', async () => {
    const confirmImport = jest.fn().mockResolvedValue({
      success: false,
      error: 'Invalid rows data'
    });
    const useCase = buildConfirmSuppliersImportUseCase({
      supplierCSVService: { confirmImport }
    });

    const result = await useCase({
      rows: [{ name: 'Supplier A' }],
      userId: 8
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.message).toBe('Invalid rows data');
    expect(result.error.statusCode).toBe(400);
  });
});

