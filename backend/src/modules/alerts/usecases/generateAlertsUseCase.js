import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { mapAlertUseCaseError } from './alertUseCaseError.js';

export const buildGenerateAlertsUseCase = ({ alertService }) => {
  return async () => {
    try {
      const data = await alertService.generateAlerts();
      return ok(data);
    } catch (error) {
      return fail(mapAlertUseCaseError(error, 'Failed to generate alerts'));
    }
  };
};
