import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';

export const buildResetSettingsToDefaultUseCase = ({ settingsRepository }) => {
    return async () => {
        try {
            const result = await settingsRepository.resetSettingsToDefault();
            return ok(result);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to reset settings'));
        }
    };
};
