import { v4 as uuidv4 } from 'uuid';
import logger from '../../config/logger.js';
import * as emailService from '../../services/emailService.js';
import { paypalService } from '../../services/paypalService.js';
import { provisionTenant, deleteTenantDatabase } from '../../services/tenantProvisioningService.js';
import {
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant
} from '../../services/storefrontDiscoveryIndexService.js';
import * as landlordService from '../../services/landlordService.js';
import { trackEngagementEvent } from '../../services/engagementService.js';
import { getTenantRegistrationApprovalMode } from '../../config/tenantRegistrationApproval.js';
import { tenantAdminRepository } from './repositories/tenantAdminRepository.js';
import { dgfyAccountRepository } from '../dgfy/index.js';
import { buildRegisterCompanyRequestUseCase } from './usecases/registerCompanyRequestUseCase.js';
import { buildListTenantsUseCase } from './usecases/listTenantsUseCase.js';
import { buildApproveTenantUseCase } from './usecases/approveTenantUseCase.js';
import { buildRejectTenantUseCase } from './usecases/rejectTenantUseCase.js';
import { buildProvisionNewTenantUseCase } from './usecases/provisionNewTenantUseCase.js';
import { buildGetPricingSettingsUseCase } from './usecases/getPricingSettingsUseCase.js';
import { buildUpdatePricingSettingsUseCase } from './usecases/updatePricingSettingsUseCase.js';
import { buildUpdateTenantUseCase } from './usecases/updateTenantUseCase.js';
import { buildDeleteTenantUseCase } from './usecases/deleteTenantUseCase.js';
import { buildResubmitRegistrationUseCase } from './usecases/resubmitRegistrationUseCase.js';
import { buildUpdateTenantCapabilitiesUseCase } from './usecases/updateTenantCapabilitiesUseCase.js';
import { buildListTenantCapabilityAuditLogsUseCase } from './usecases/listTenantCapabilityAuditLogsUseCase.js';
import { readTenantCapabilities } from './usecases/tenantCapabilitySettings.js';
import tenantConnector from '../../utils/TenantConnector.js';

export const registerCompanyRequestUseCase = buildRegisterCompanyRequestUseCase({
    tenantAdminRepository,
    paypalService,
    trackEngagementEvent,
    addEmailTenantMapping: landlordService.addEmailTenantMapping,
    dgfyAccountRepository,
    provisionTenant,
    emailService,
    idGenerator: uuidv4,
    getTenantRegistrationApprovalMode: () => getTenantRegistrationApprovalMode(process.env, logger),
    logger
});

export const listTenantsUseCase = buildListTenantsUseCase({
    tenantAdminRepository,
    tenantConnector,
    readTenantCapabilities,
    logger
});

export const approveTenantUseCase = buildApproveTenantUseCase({
    tenantAdminRepository,
    provisionTenant,
    emailService,
    logger
});

export const rejectTenantUseCase = buildRejectTenantUseCase({
    tenantAdminRepository,
    emailService,
    logger
});

export const provisionNewTenantUseCase = buildProvisionNewTenantUseCase({
    provisionTenant,
    logger
});

export const getPricingSettingsUseCase = buildGetPricingSettingsUseCase({
    tenantAdminRepository,
    logger
});

export const updatePricingSettingsUseCase = buildUpdatePricingSettingsUseCase({
    tenantAdminRepository,
    logger
});

export const updateTenantUseCase = buildUpdateTenantUseCase({
    tenantAdminRepository,
    provisionTenant,
    emailService,
    logger
});

export const updateTenantCapabilitiesUseCase = buildUpdateTenantCapabilitiesUseCase({
    tenantAdminRepository,
    tenantConnector,
    syncStorefrontDiscoveryIndexForTenant,
    logger
});

export const listTenantCapabilityAuditLogsUseCase = buildListTenantCapabilityAuditLogsUseCase({
    tenantAdminRepository,
    logger
});

export const deleteTenantUseCase = buildDeleteTenantUseCase({
    tenantAdminRepository,
    deleteTenantDatabase,
    removeStorefrontDiscoveryIndexForTenant,
    syncStorefrontDiscoveryIndexForTenant,
    logger
});

export const resubmitRegistrationUseCase = buildResubmitRegistrationUseCase({
    tenantAdminRepository,
    emailService,
    logger
});

export * from './contracts/tenantRepository.contract.js';
export * from './contracts/tenantAdminRepository.contract.js';
export * from './repositories/tenantRepository.js';
export * from './repositories/tenantAdminRepository.js';
