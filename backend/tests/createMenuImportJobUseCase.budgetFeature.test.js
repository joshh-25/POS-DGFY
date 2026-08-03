import { jest } from '@jest/globals';
import { buildCreateMenuImportJobUseCase } from '../src/modules/menuImport/usecases/createMenuImportJobUseCase.js';

describe('createMenuImportJobUseCase — budget feature scoping (#195)', () => {
    it('checks the tenant AI budget scoped to menu_import + item_image_generation, not all AI spend', async () => {
        const menuImportJobRepository = {
            isMenuImportQueueAvailable: () => true,
            createJob: jest.fn().mockResolvedValue({ jobId: 'job-1' })
        };
        const menuImportBudgetRepository = {
            getTenantAiSpendSince: jest.fn().mockResolvedValue(0)
        };
        const menuExtractionService = {
            resolveTenantWorkflowMode: jest.fn().mockResolvedValue('fnb')
        };

        const useCase = buildCreateMenuImportJobUseCase({
            menuImportJobRepository,
            menuImportBudgetRepository,
            menuExtractionService
        });

        const result = await useCase({
            tenantId: 'tenant-1',
            userId: 1,
            files: [{ file_id: 'f1', path: '/tmp/f1', mime_type: 'application/pdf', size: 10, original_name: 'menu.pdf' }]
        });

        expect(result.success).toBe(true);
        expect(menuImportBudgetRepository.getTenantAiSpendSince).toHaveBeenCalledTimes(1);
        const [, , options] = menuImportBudgetRepository.getTenantAiSpendSince.mock.calls[0];
        expect(options.features).toEqual(expect.arrayContaining(['menu_import', 'item_image_generation']));
        expect(options.features).not.toContain('ai_assistant');
    });
});
