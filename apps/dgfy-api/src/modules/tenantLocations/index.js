import { tenantLocationRepository } from './repositories/tenantLocationRepository.js';
import logger from '../../config/logger.js';
import { syncStorefrontDiscoveryIndexForTenant } from '../../services/storefrontDiscoveryIndexService.js';
import {
    buildListTenantLocationsUseCase,
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase,
    buildDeactivateTenantLocationUseCase,
    buildDeleteTenantLocationUseCase
} from './usecases/tenantLocationUseCases.js';

export const listTenantLocationsUseCase = buildListTenantLocationsUseCase({ tenantLocationRepository });
const writeDependencies = { tenantLocationRepository, syncStorefrontDiscoveryIndexForTenant, logger };
export const createTenantLocationUseCase = buildCreateTenantLocationUseCase(writeDependencies);
export const updateTenantLocationUseCase = buildUpdateTenantLocationUseCase(writeDependencies);
export const deactivateTenantLocationUseCase = buildDeactivateTenantLocationUseCase(writeDependencies);
export const deleteTenantLocationUseCase = buildDeleteTenantLocationUseCase(writeDependencies);

export * from './contracts/tenantLocationRepository.contract.js';
export * from './repositories/tenantLocationRepository.js';
