import { ok, fail } from '../../shared/contracts/applicationResult.js';
import {
    isCustomerAccessModesEnabled,
    resolveAccessPolicyFromSettings
} from '../../shared/utils/customerAccessPolicy.js';
import { mapSettingsUseCaseError } from './settingsUseCaseError.js';
import { sanitizeSettingsPayloadForRead } from './posTerminalRegistrySecrets.js';
import { buildPosTaxpayerTypeReadProjection } from './posTaxpayerTypePolicy.js';

const STOREFRONT_ASSET_SETTING_PAIRS = Object.freeze([
    { urlKey: 'storefront_cover_image_url', pathKey: 'storefront_cover_image_path' },
    { urlKey: 'storefront_profile_image_url', pathKey: 'storefront_profile_image_path' }
]);

const omitUnavailableStorefrontAssets = async (settings, storefrontAssetStorage) => {
    if (typeof storefrontAssetStorage?.isAvailable !== 'function') return settings;

    const nextSettings = { ...settings };
    await Promise.all(STOREFRONT_ASSET_SETTING_PAIRS.map(async ({ urlKey, pathKey }) => {
        const urlSetting = nextSettings[urlKey];
        const storedUrl = String(urlSetting?.value || '').trim();
        if (!storedUrl) return;

        const storedPath = String(nextSettings[pathKey]?.value || '').trim();
        const available = await storefrontAssetStorage.isAvailable({ path: storedPath, url: storedUrl });
        if (available) return;

        nextSettings[urlKey] = { ...urlSetting, value: '' };
        if (nextSettings[pathKey]) {
            nextSettings[pathKey] = { ...nextSettings[pathKey], value: '' };
        }
    }));

    return nextSettings;
};

export const buildGetAllSettingsUseCase = ({
    settingsRepository,
    customerAccessModesEnabledProvider = isCustomerAccessModesEnabled,
    storefrontAssetStorage = null
}) => {
    return async ({ context } = {}) => {
        try {
            const settings = await omitUnavailableStorefrontAssets(
                sanitizeSettingsPayloadForRead(await settingsRepository.getAllSettings()),
                storefrontAssetStorage
            );
            const customerAccessModesEnabled = customerAccessModesEnabledProvider(context);
            const accessPolicy = resolveAccessPolicyFromSettings(settings, {
                featureEnabled: customerAccessModesEnabled
            });
            const taxpayerTypeProjection = buildPosTaxpayerTypeReadProjection(
                settings.pos_taxpayer_type
            );
            return ok({
                ...settings,
                ...taxpayerTypeProjection,
                requested_customer_access_mode: {
                    value: accessPolicy.requested_customer_access_mode,
                    data_type: 'string',
                    description: 'Runtime Customer Access Mode requested by the tenant.',
                    source: 'runtime',
                    updated_at: null
                },
                effective_customer_access_mode: {
                    value: accessPolicy.effective_customer_access_mode,
                    data_type: 'string',
                    description: 'Runtime Customer Access Mode enforced by public Storefront APIs.',
                    source: 'runtime',
                    updated_at: null
                },
                max_customer_access_mode: {
                    value: accessPolicy.max_customer_access_mode,
                    data_type: 'string',
                    description: 'Most permissive Customer Access Mode currently allowed after platform and readiness caps.',
                    source: 'runtime',
                    updated_at: null
                },
                platform_max_customer_access_mode: {
                    value: accessPolicy.platform_max_customer_access_mode,
                    data_type: 'string',
                    description: 'Platform-admin configured Customer Access Mode ceiling.',
                    source: settings.platform_max_customer_access_mode ? 'tenant' : 'runtime_default',
                    updated_at: settings.platform_max_customer_access_mode?.updated_at || null
                },
                registration_stage_max_customer_access_mode: {
                    value: accessPolicy.registration_stage_max_customer_access_mode,
                    data_type: 'string',
                    description: 'Customer Access Mode ceiling derived from registration readiness.',
                    source: 'runtime',
                    updated_at: null
                },
                customer_access_limitation_reason: {
                    value: accessPolicy.limitation_reason,
                    data_type: 'string',
                    description: 'Reason the requested Customer Access Mode is capped, when applicable.',
                    source: 'runtime',
                    updated_at: null
                },
                customer_access_registration_stage: {
                    value: accessPolicy.registration_stage,
                    data_type: 'string',
                    description: 'Registration readiness stage used for Customer Access Mode enforcement.',
                    source: 'runtime',
                    updated_at: null
                },
                customer_access_capabilities: {
                    value: accessPolicy.access_capabilities,
                    data_type: 'json',
                    description: 'Public Storefront capabilities available under the effective Customer Access Mode.',
                    source: 'runtime',
                    updated_at: null
                },
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
