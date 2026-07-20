import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import { sanitizeSingleSettingForRead } from './posTerminalRegistrySecrets.js';

export const buildGetSettingByKeyUseCase = ({ settingsRepository }) => {
    return async ({ key }) => {
        if (!key || typeof key !== 'string') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Setting key is required'
            ));
        }

        try {
            const setting = await settingsRepository.getSettingByKey(key);
            return ok(sanitizeSingleSettingForRead({ key, setting }));
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to retrieve setting'));
        }
    };
};
