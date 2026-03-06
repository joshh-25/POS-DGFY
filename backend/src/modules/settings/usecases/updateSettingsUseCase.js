import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';

export const buildUpdateSettingsUseCase = ({ settingsRepository }) => {
    return async ({ settingsData }) => {
        if (!settingsData || typeof settingsData !== 'object' || Array.isArray(settingsData)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'settingsData must be an object'
            ));
        }

        try {
            const result = await settingsRepository.updateSettings(settingsData);
            return ok(result);
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to update settings'));
        }
    };
};
