import { jest } from '@jest/globals';
import {
  buildGetExpiryReportUseCase,
  buildGetSnapshotsUseCase,
  buildGetSnapshotByIdUseCase,
  buildSaveSnapshotUseCase
} from '../src/modules/reports/usecases/reportUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('report use-cases application result contract', () => {
  it('getExpiryReport validates filters shape', async () => {
    const useCase = buildGetExpiryReportUseCase({
      reportService: { getExpiryReport: jest.fn() }
    });

    const result = await useCase({ filters: 'invalid-filters' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('getSnapshots validates report type', async () => {
    const useCase = buildGetSnapshotsUseCase({
      reportService: { getReportSnapshots: jest.fn() }
    });

    const result = await useCase({ type: '', limit: 20 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('getSnapshotById returns RESOURCE_NOT_FOUND when service returns null', async () => {
    const useCase = buildGetSnapshotByIdUseCase({
      reportService: { getReportSnapshotById: jest.fn().mockResolvedValue(null) }
    });

    const result = await useCase({ id: '42' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
    expect(result.error.statusCode).toBe(404);
  });

  it('saveSnapshot wraps service data in success envelope', async () => {
    const saveReportSnapshot = jest.fn().mockResolvedValue({
      snapshot_id: 9,
      report_type: 'expiry'
    });
    const useCase = buildSaveSnapshotUseCase({
      reportService: { saveReportSnapshot }
    });

    const result = await useCase({
      reportType: 'expiry',
      snapshotData: { summary: { total_expired_batches: 2 } },
      dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
      userId: '7',
      reportName: 'January Expiry Risk'
    });

    expect(saveReportSnapshot).toHaveBeenCalledWith(
      'expiry',
      { summary: { total_expired_batches: 2 } },
      { startDate: '2026-01-01', endDate: '2026-01-31' },
      7,
      'January Expiry Risk'
    );
    expect(result).toEqual({
      success: true,
      data: { snapshot_id: 9, report_type: 'expiry' },
      error: null,
      message: null
    });
  });
});
