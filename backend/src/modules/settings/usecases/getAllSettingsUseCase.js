import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';

export const buildGetAllSettingsUseCase = ({ settingsRepository }) => {
    return async () => {
        try {
            const settings = await settingsRepository.getAllSettings();
            return ok(settings);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to retrieve settings'));
        }
    };
};
