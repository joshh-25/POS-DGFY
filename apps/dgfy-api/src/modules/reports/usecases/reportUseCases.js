import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapReportUseCaseError } from './reportUseCaseError.js';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const validateFilters = (filters) => {
  if (filters === undefined || filters === null) return null;
  if (!isPlainObject(filters)) return 'filters must be an object';
  return null;
};

const withReportExecution = async (fn, fallbackMessage) => {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    return fail(mapReportUseCaseError(error, fallbackMessage));
  }
};

export const buildGetExpiryReportUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getExpiryReport(filters || {}),
      'Failed to retrieve expiry report'
    );
  };
};

export const buildGetEnhancedStockAgingUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getEnhancedStockAgingReport(filters || {}),
      'Failed to retrieve stock aging report'
    );
  };
};

export const buildGetProductionReportUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getProductionReport(filters || {}),
      'Failed to retrieve production report'
    );
  };
};

export const buildGetPurchaseOrderAnalysisUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getPurchaseOrderAnalysis(filters || {}),
      'Failed to retrieve purchase order analysis report'
    );
  };
};

export const buildGetExecutiveSummaryUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getExecutiveSummary(filters || {}),
      'Failed to retrieve executive summary report'
    );
  };
};

export const buildGetComplianceBooksPackageUseCase = ({ reportService }) => {
  return async ({ filters }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.getComplianceBooksPackage(filters || {}),
      'Failed to retrieve compliance books package'
    );
  };
};

export const buildExportComplianceBooksPackageUseCase = ({ reportService }) => {
  return async ({ filters, filingProfile = 'dgfy' }) => {
    const validationError = validateFilters(filters);
    if (validationError) {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, validationError, { statusCode: 400 }));
    }

    return withReportExecution(
      () => reportService.exportComplianceBooksPackage(filters || {}, { filing_profile: filingProfile }),
      'Failed to export compliance books package'
    );
  };
};

export const buildGetSnapshotsUseCase = ({ reportService }) => {
  return async ({ type, limit }) => {
    if (!type || typeof type !== 'string') {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Report type is required',
        { statusCode: 400 }
      ));
    }

    const normalizedLimit = limit === undefined || limit === null ? 20 : parsePositiveInt(limit);
    if (!normalizedLimit) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'limit must be a positive integer',
        { statusCode: 400 }
      ));
    }

    return withReportExecution(
      () => reportService.getReportSnapshots(type, normalizedLimit),
      'Failed to retrieve report snapshots'
    );
  };
};

export const buildGetSnapshotByIdUseCase = ({ reportService }) => {
  return async ({ id }) => {
    const normalizedId = parsePositiveInt(id);
    if (!normalizedId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'id must be a positive integer',
        { statusCode: 400 }
      ));
    }

    const result = await withReportExecution(
      () => reportService.getReportSnapshotById(normalizedId),
      'Failed to retrieve report snapshot'
    );

    if (!result.success) return result;
    if (!result.data) {
      return fail(new DomainError(
        DomainErrorCode.RESOURCE_NOT_FOUND,
        'Snapshot not found',
        { statusCode: 404 }
      ));
    }

    return result;
  };
};

export const buildSaveSnapshotUseCase = ({ reportService }) => {
  return async ({ reportType, snapshotData, dateRange, userId, reportName }) => {
    if (!reportType || !snapshotData) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Report type and snapshot data are required',
        { statusCode: 400 }
      ));
    }

    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);
    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    return withReportExecution(
      () => reportService.saveReportSnapshot(
        reportType,
        snapshotData,
        dateRange || {},
        normalizedUserId,
        reportName || null
      ),
      'Failed to save report snapshot'
    );
  };
};

export const buildGetStockAgingUseCase = ({ reportService }) => {
  return async () => withReportExecution(
    () => reportService.getStockAgingReport(),
    'Failed to retrieve stock aging report'
  );
};

export const buildGetSurplusShortageUseCase = ({ reportService }) => {
  return async () => withReportExecution(
    () => reportService.getSurplusShortageReport(),
    'Failed to retrieve surplus shortage report'
  );
};

export const buildGetFinancialSummaryUseCase = ({ reportService }) => {
  return async () => withReportExecution(
    () => reportService.getFinancialSummary(),
    'Failed to retrieve financial summary report'
  );
};

export const buildGetSupplierPerformanceUseCase = ({ reportService }) => {
  return async () => withReportExecution(
    () => reportService.getSupplierPerformanceReport(),
    'Failed to retrieve supplier performance report'
  );
};
