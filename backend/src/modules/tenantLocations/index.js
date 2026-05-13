import { tenantLocationRepository } from './repositories/tenantLocationRepository.js';
import {
    buildListTenantLocationsUseCase,
    buildCreateTenantLocationUseCase,
    buildUpdateTenantLocationUseCase,
    buildDeactivateTenantLocationUseCase,
    buildDeleteTenantLocationUseCase
} from './usecases/tenantLocationUseCases.js';

export const listTenantLocationsUseCase = buildListTenantLocationsUseCase({ tenantLocationRepository });
export const createTenantLocationUseCase = buildCreateTenantLocationUseCase({ tenantLocationRepository });
export const updateTenantLocationUseCase = buildUpdateTenantLocationUseCase({ tenantLocationRepository });
export const deactivateTenantLocationUseCase = buildDeactivateTenantLocationUseCase({ tenantLocationRepository });
export const deleteTenantLocationUseCase = buildDeleteTenantLocationUseCase({ tenantLocationRepository });

export * from './contracts/tenantLocationRepository.contract.js';
export * from './repositories/tenantLocationRepository.js';
