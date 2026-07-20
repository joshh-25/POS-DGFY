import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapAnalyticsUseCaseError } from './analyticsUseCaseError.js';

const parsePositiveInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number.parseInt(value, 10);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
};

export const buildGetSupplierPerformanceUseCase = ({ analyticsService }) => {
  return async ({ supplierId }) => {
    const normalizedSupplierId = parsePositiveInt(supplierId);
    if (!normalizedSupplierId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'supplierId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await analyticsService.analyzeSupplierPerformance(normalizedSupplierId);
      return ok(data);
    } catch (error) {
      return fail(mapAnalyticsUseCaseError(error, 'Failed to analyze supplier performance'));
    }
  };
};

export const buildGetAnomaliesUseCase = ({ analyticsService }) => {
  return async ({ options }) => {
    const normalizedOptions = options || {};
    const rawDays = normalizedOptions.days;
    if (rawDays !== undefined && rawDays !== null) {
      const normalizedDays = parsePositiveInt(rawDays);
      if (!normalizedDays) {
        return fail(new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'days must be a positive integer',
          { statusCode: 400 }
        ));
      }
      normalizedOptions.days = normalizedDays;
    }

    if (normalizedOptions.itemId !== undefined && normalizedOptions.itemId !== null) {
      const normalizedItemId = parsePositiveInt(normalizedOptions.itemId);
      if (!normalizedItemId) {
        return fail(new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'itemId must be a positive integer',
          { statusCode: 400 }
        ));
      }
      normalizedOptions.itemId = normalizedItemId;
    }

    try {
      const data = await analyticsService.detectAnomalies(normalizedOptions);
      return ok(data);
    } catch (error) {
      return fail(mapAnalyticsUseCaseError(error, 'Failed to detect anomalies'));
    }
  };
};

export const buildGetCostAnalysisUseCase = ({ analyticsService }) => {
  return async ({ startDate, endDate }) => {
    try {
      const data = await analyticsService.analyzeInventoryCosts({ startDate, endDate });
      return ok(data);
    } catch (error) {
      return fail(mapAnalyticsUseCaseError(error, 'Failed to analyze inventory costs'));
    }
  };
};

export const buildGetItemBurnRateUseCase = ({ analyticsService }) => {
  return async ({ itemId, days }) => {
    const normalizedItemId = parsePositiveInt(itemId);
    if (!normalizedItemId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'itemId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    let normalizedDays = undefined;
    if (days !== undefined && days !== null) {
      normalizedDays = parsePositiveInt(days);
      if (!normalizedDays) {
        return fail(new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'days must be a positive integer',
          { statusCode: 400 }
        ));
      }
    }

    try {
      const burnRate = await analyticsService.calculateBurnRate(normalizedItemId, normalizedDays);
      const recommendation = await analyticsService.calculateReorderPoint(normalizedItemId);

      return ok({
        ...burnRate,
        recommendation: recommendation.recommendation
      });
    } catch (error) {
      return fail(mapAnalyticsUseCaseError(error, 'Failed to calculate burn rate'));
    }
  };
};
