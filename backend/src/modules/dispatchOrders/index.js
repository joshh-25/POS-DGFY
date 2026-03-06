import * as dispatchOrderService from '../../services/dispatchOrderService.js';
import {
  buildGetDispatchOrdersUseCase,
  buildGetDispatchOrderByIdUseCase,
  buildGetDispatchStatsUseCase,
  buildExportDispatchOrdersUseCase,
  buildCreateDispatchOrderUseCase,
  buildUpdateDispatchOrderUseCase,
  buildConfirmDispatchOrderUseCase,
  buildDispatchLinesUseCase,
  buildCancelDispatchOrderUseCase,
  buildArchiveDispatchOrderUseCase
} from './usecases/dispatchOrderUseCases.js';

export const getDispatchOrdersUseCase = buildGetDispatchOrdersUseCase({ dispatchOrderService });
export const getDispatchOrderByIdUseCase = buildGetDispatchOrderByIdUseCase({ dispatchOrderService });
export const getDispatchStatsUseCase = buildGetDispatchStatsUseCase({ dispatchOrderService });
export const exportDispatchOrdersUseCase = buildExportDispatchOrdersUseCase({ dispatchOrderService });
export const createDispatchOrderUseCase = buildCreateDispatchOrderUseCase({ dispatchOrderService });
export const updateDispatchOrderUseCase = buildUpdateDispatchOrderUseCase({ dispatchOrderService });
export const confirmDispatchOrderUseCase = buildConfirmDispatchOrderUseCase({ dispatchOrderService });
export const dispatchLinesUseCase = buildDispatchLinesUseCase({ dispatchOrderService });
export const cancelDispatchOrderUseCase = buildCancelDispatchOrderUseCase({ dispatchOrderService });
export const archiveDispatchOrderUseCase = buildArchiveDispatchOrderUseCase({ dispatchOrderService });
