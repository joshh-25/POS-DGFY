import logger from '../../config/logger.js';
import { storeConfigurationTemplateRepository } from '../templates/index.js';
import { registrationIndustryRepository } from './repositories/registrationIndustryRepository.js';
import { buildListRegistrationIndustriesUseCase } from './usecases/listRegistrationIndustriesUseCase.js';
import {
    buildListAdminRegistrationIndustriesUseCase,
    buildCreateRegistrationIndustryUseCase,
    buildUpdateRegistrationIndustryUseCase,
    buildSetRegistrationIndustryVisibilityUseCase,
    buildListRegistrationIndustryVisibilityAuditLogsUseCase
} from './usecases/adminRegistrationIndustryUseCases.js';

// The registration Industry catalog is fully DB-driven as of issue #316 -
// see registrationIndustryRepository.js and
// listRegistrationIndustriesUseCase's own doc comment. The Phase 39
// visibility-only store (registrationIndustryVisibilityRepository) was
// retired in the same phase that landed this comment: its `hidden` state
// and audit trail were folded into registration_industries beforehand
// (migration 20260812000003), so nothing was lost.
export const listRegistrationIndustriesUseCase = buildListRegistrationIndustriesUseCase({
    repository: storeConfigurationTemplateRepository,
    catalogRepository: registrationIndustryRepository,
    logger
});

export const listAdminRegistrationIndustriesUseCase = buildListAdminRegistrationIndustriesUseCase({
    repository: registrationIndustryRepository
});
export const createRegistrationIndustryUseCase = buildCreateRegistrationIndustryUseCase({
    repository: registrationIndustryRepository,
    templateRepository: storeConfigurationTemplateRepository
});
export const updateRegistrationIndustryUseCase = buildUpdateRegistrationIndustryUseCase({
    repository: registrationIndustryRepository,
    templateRepository: storeConfigurationTemplateRepository
});
export const setRegistrationIndustryVisibilityUseCase = buildSetRegistrationIndustryVisibilityUseCase({
    repository: registrationIndustryRepository
});
export const listRegistrationIndustryVisibilityAuditLogsUseCase = buildListRegistrationIndustryVisibilityAuditLogsUseCase({
    repository: registrationIndustryRepository
});

export { registrationIndustryRepository };
