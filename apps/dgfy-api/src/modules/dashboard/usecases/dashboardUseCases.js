import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapDashboardUseCaseError } from './dashboardUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildGetStatsUseCase = ({ dashboardService }) => {
  return async () => {
    try {
      const data = await dashboardService.getDashboardStats();
      return ok(data);
    } catch (error) {
      return fail(mapDashboardUseCaseError(error, 'Failed to retrieve dashboard stats'));
    }
  };
};

export const buildGetLowStockUseCase = ({ dashboardService }) => {
  return async () => {
    try {
      const data = await dashboardService.getLowStockItems();
      return ok(data);
    } catch (error) {
      return fail(mapDashboardUseCaseError(error, 'Failed to retrieve low-stock items'));
    }
  };
};

export const buildGetRecentMovementsUseCase = ({ dashboardService }) => {
  return async ({ limit }) => {
    const normalizedLimit = parsePositiveInt(limit);
    if (!normalizedLimit) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'limit must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await dashboardService.getRecentMovements(normalizedLimit);
      return ok(data);
    } catch (error) {
      return fail(mapDashboardUseCaseError(error, 'Failed to retrieve recent movements'));
    }
  };
};
