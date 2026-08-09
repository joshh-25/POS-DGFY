import { storeConfigurationTemplateRepository } from './repositories/storeConfigurationTemplateRepository.js';
import {
    buildListTemplatesUseCase,
    buildGetTemplateUseCase,
    buildListTemplateAuditLogsUseCase,
    buildCreateDraftTemplateUseCase,
    buildUpdateTemplateModulesUseCase,
    buildPublishTemplateUseCase,
    buildDeprecateTemplateUseCase
} from './usecases/storeConfigurationTemplateUseCases.js';
import { buildSeedCanonicalTemplatePresetsUseCase } from './usecases/seedCanonicalTemplatePresets.js';

export const listTemplatesUseCase = buildListTemplatesUseCase({ repository: storeConfigurationTemplateRepository });
export const getTemplateUseCase = buildGetTemplateUseCase({ repository: storeConfigurationTemplateRepository });
export const listTemplateAuditLogsUseCase = buildListTemplateAuditLogsUseCase({ repository: storeConfigurationTemplateRepository });
export const createDraftTemplateUseCase = buildCreateDraftTemplateUseCase({ repository: storeConfigurationTemplateRepository });
export const updateTemplateModulesUseCase = buildUpdateTemplateModulesUseCase({ repository: storeConfigurationTemplateRepository });
export const publishTemplateUseCase = buildPublishTemplateUseCase({ repository: storeConfigurationTemplateRepository });
export const deprecateTemplateUseCase = buildDeprecateTemplateUseCase({ repository: storeConfigurationTemplateRepository });
export const seedCanonicalTemplatePresetsUseCase = buildSeedCanonicalTemplatePresetsUseCase({ repository: storeConfigurationTemplateRepository });

export { storeConfigurationTemplateRepository };
