import { tenantRepository } from '../tenants/repositories/tenantRepository.js';
import { settingsRepository } from './repositories/settingsRepository.js';
import { buildGetCompanyInfoUseCase } from './usecases/getCompanyInfoUseCase.js';
import { buildGetAllSettingsUseCase } from './usecases/getAllSettingsUseCase.js';
import { buildGetSettingByKeyUseCase } from './usecases/getSettingByKeyUseCase.js';
import { buildUpdateSettingsUseCase } from './usecases/updateSettingsUseCase.js';
import { buildUpdateSettingByKeyUseCase } from './usecases/updateSettingByKeyUseCase.js';
import { buildResetSettingsToDefaultUseCase } from './usecases/resetSettingsToDefaultUseCase.js';
import { buildApplyThresholdSettingsUseCase } from './usecases/applyThresholdSettingsUseCase.js';
import {
    buildDeleteStorefrontAssetUseCase,
    buildUploadStorefrontAssetUseCase
} from './usecases/manageStorefrontAssetUseCase.js';
import { storefrontAssetStorage } from './repositories/storefrontAssetStorage.js';

export const getCompanyInfoUseCase = buildGetCompanyInfoUseCase({
    tenantRepository,
    frontendUrlProvider: () => process.env.FRONTEND_URL || 'http://localhost:5173'
});

export const getAllSettingsUseCase = buildGetAllSettingsUseCase({ settingsRepository });
export const getSettingByKeyUseCase = buildGetSettingByKeyUseCase({ settingsRepository });
export const updateSettingsUseCase = buildUpdateSettingsUseCase({ settingsRepository });
export const updateSettingByKeyUseCase = buildUpdateSettingByKeyUseCase({ settingsRepository });
export const resetSettingsToDefaultUseCase = buildResetSettingsToDefaultUseCase({ settingsRepository });
export const applyThresholdSettingsUseCase = buildApplyThresholdSettingsUseCase({ settingsRepository });
export const uploadStorefrontAssetUseCase = buildUploadStorefrontAssetUseCase({
    settingsRepository,
    storefrontAssetStorage
});
export const deleteStorefrontAssetUseCase = buildDeleteStorefrontAssetUseCase({
    settingsRepository,
    storefrontAssetStorage
});

export * from './contracts/companyInfo.contract.js';
export * from './contracts/settingsRepository.contract.js';
export * from './repositories/settingsRepository.js';
