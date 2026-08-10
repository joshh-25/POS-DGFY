import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapForecastUseCaseError } from './forecastUseCaseError.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

export const buildGetStockForecastUseCase = ({ forecastService }) => {
  return async ({ daysAhead }) => {
    const normalizedDaysAhead = parsePositiveInt(daysAhead);
    if (!normalizedDaysAhead) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'daysAhead must be a positive integer',
        { statusCode: 400 }
      ));
    }

    try {
      const data = await forecastService.forecastStockLevels(normalizedDaysAhead);
      return ok(data);
    } catch (error) {
      return fail(mapForecastUseCaseError(error, 'Failed to retrieve stock forecast'));
    }
  };
};
