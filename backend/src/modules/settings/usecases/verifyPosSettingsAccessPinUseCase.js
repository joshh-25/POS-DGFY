import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import {
    POS_SETTINGS_ACCESS_PIN_HASH_KEY,
    verifyPosSettingsAccessPin
} from './posSettingsAccessPinPolicy.js';

export const buildVerifyPosSettingsAccessPinUseCase = ({ settingsRepository }) => {
    return async ({ pin = '' } = {}) => {
        try {
            const currentPinSetting = typeof settingsRepository?.getSettingsByKeys === 'function'
                ? await settingsRepository.getSettingsByKeys([POS_SETTINGS_ACCESS_PIN_HASH_KEY])
                : {};
            const currentHash = String(currentPinSetting?.[POS_SETTINGS_ACCESS_PIN_HASH_KEY]?.value || '').trim();

            await verifyPosSettingsAccessPin({
                pin,
                currentHash
            });

            return ok({
                verified: true
            });
        } catch (error) {
            if (error instanceof DomainError) {
                return fail(error);
            }
            return fail(mapSettingsUseCaseError(error, 'Failed to verify POS Settings access PIN'));
        }
    };
};
