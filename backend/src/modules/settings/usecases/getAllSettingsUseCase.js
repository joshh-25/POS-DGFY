import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { isCustomerAccessModesEnabled } from '../../shared/utils/customerAccessPolicy.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';

export const buildGetAllSettingsUseCase = ({
    settingsRepository,
    customerAccessModesEnabledProvider = isCustomerAccessModesEnabled
}) => {
    return async ({ context } = {}) => {
        try {
            const settings = await settingsRepository.getAllSettings();
            const customerAccessModesEnabled = customerAccessModesEnabledProvider(context);
            return ok({
                ...settings,
                customer_access_modes_enabled: {
                    value: customerAccessModesEnabled,
                    data_type: 'boolean',
                    description: 'Runtime Customer Access Mode enforcement state. This is derived from environment rollback controls and is not persisted as a tenant setting.',
                    source: 'runtime',
                    updated_at: null
                }
            });
        } catch (error) {
            return fail(mapSettingsUseCaseError(error, 'Failed to retrieve settings'));
        }
    };
};
