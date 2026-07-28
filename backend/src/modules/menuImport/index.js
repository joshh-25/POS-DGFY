import * as menuExtractionService from '../../services/menuExtractionService.js';
import * as menuImportJobRepository from './repositories/menuImportJobRepository.js';
import * as menuImportBudgetRepository from './repositories/menuImportBudgetRepository.js';
import { buildCreateMenuImportJobUseCase } from './usecases/createMenuImportJobUseCase.js';
import { buildGetMenuImportJobUseCase } from './usecases/getMenuImportJobUseCase.js';

export const createMenuImportJobUseCase = buildCreateMenuImportJobUseCase({
    menuImportJobRepository,
    menuImportBudgetRepository,
    menuExtractionService
});

export const getMenuImportJobUseCase = buildGetMenuImportJobUseCase({ menuImportJobRepository });

// Re-exported for the controller's temp-file cleanup path and for
// workers/menuImportWorker.js, which talks to the repository directly (a
// background worker isn't a request-scoped consumer of these use cases).
export { menuImportJobRepository };
