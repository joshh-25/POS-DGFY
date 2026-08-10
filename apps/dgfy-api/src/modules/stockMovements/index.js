import * as stockMovementService from '../../services/stockMovementService.js';
import {
  buildGetStockMovementsUseCase,
  buildGetMovementByIdUseCase,
  buildGetMovementStatsUseCase,
  buildCreateStockMovementUseCase,
  buildVoidMovementUseCase,
  buildExportMovementsUseCase,
  buildCreateBulkMovementsUseCase
} from './usecases/stockMovementUseCases.js';

export const getStockMovementsUseCase = buildGetStockMovementsUseCase({ stockMovementService });
export const getMovementByIdUseCase = buildGetMovementByIdUseCase({ stockMovementService });
export const getMovementStatsUseCase = buildGetMovementStatsUseCase({ stockMovementService });
export const createStockMovementUseCase = buildCreateStockMovementUseCase({ stockMovementService });
export const voidMovementUseCase = buildVoidMovementUseCase({ stockMovementService });
export const exportMovementsUseCase = buildExportMovementsUseCase({ stockMovementService });
export const createBulkMovementsUseCase = buildCreateBulkMovementsUseCase({ stockMovementService });
