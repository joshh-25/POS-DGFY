import logger from '../../config/logger.js';
import { resolveModelRate } from '../../config/aiModelRates.js';
import { tenantIntakeRepository } from './repositories/tenantIntakeRepository.js';
import { buildTenantIntakeUseCases } from './usecases/tenantIntakeUseCases.js';
import { buildIntakeExtractionService } from './services/intakeExtractionService.js';
import { createAdminProvisionedAccountAndTenantUseCase } from '../tenants/index.js';

const extract = buildIntakeExtractionService({
    recordUsage: async ({ model, usage }) => {
        const rate = resolveModelRate(model);
        logger.info('[TenantIntake] Extraction usage', { model, prompt_tokens: usage.prompt_tokens || 0,
            completion_tokens: usage.completion_tokens || 0,
            estimated_cost_usd: (usage.prompt_tokens || 0) * rate.input + (usage.completion_tokens || 0) * rate.output });
    }
});
export const tenantIntakeUseCases = buildTenantIntakeUseCases({ repository: tenantIntakeRepository,
    provision: createAdminProvisionedAccountAndTenantUseCase, extract });
