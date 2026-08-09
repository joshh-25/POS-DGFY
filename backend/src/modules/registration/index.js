import logger from '../../config/logger.js';
import { storeConfigurationTemplateRepository } from '../templates/index.js';
import { registrationIndustryVisibilityRepository } from './repositories/registrationIndustryVisibilityRepository.js';
import { buildListRegistrationIndustriesUseCase } from './usecases/listRegistrationIndustriesUseCase.js';
import {
    buildListAdminRegistrationIndustriesUseCase,
    buildSetRegistrationIndustryVisibilityUseCase,
    buildListRegistrationIndustryVisibilityAuditLogsUseCase
} from './usecases/adminRegistrationIndustryUseCases.js';

export const listRegistrationIndustriesUseCase = buildListRegistrationIndustriesUseCase({
    repository: storeConfigurationTemplateRepository,
    visibilityRepository: registrationIndustryVisibilityRepository,
    logger
});

export const listAdminRegistrationIndustriesUseCase = buildListAdminRegistrationIndustriesUseCase({
    repository: registrationIndustryVisibilityRepository
});
export const setRegistrationIndustryVisibilityUseCase = buildSetRegistrationIndustryVisibilityUseCase({
    repository: registrationIndustryVisibilityRepository
});
export const listRegistrationIndustryVisibilityAuditLogsUseCase = buildListRegistrationIndustryVisibilityAuditLogsUseCase({
    repository: registrationIndustryVisibilityRepository
});

export { registrationIndustryVisibilityRepository };
