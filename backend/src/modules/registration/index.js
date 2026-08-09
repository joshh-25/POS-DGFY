import logger from '../../config/logger.js';
import { storeConfigurationTemplateRepository } from '../templates/index.js';
import { buildListRegistrationIndustriesUseCase } from './usecases/listRegistrationIndustriesUseCase.js';

export const listRegistrationIndustriesUseCase = buildListRegistrationIndustriesUseCase({
    repository: storeConfigurationTemplateRepository,
    logger
});
