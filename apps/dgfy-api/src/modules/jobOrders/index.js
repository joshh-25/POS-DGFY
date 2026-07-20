import * as jobOrderService from '../../services/jobOrderService.js';
import {
  buildGetJobOrdersUseCase,
  buildGetJobOrderByIdUseCase,
  buildCreateJobOrderUseCase,
  buildFinalizeJobOrderUseCase,
  buildCompleteJobOrderUseCase,
  buildArchiveJobOrderUseCase,
  buildRestoreJobOrderUseCase
} from './usecases/jobOrderUseCases.js';

export const getJobOrdersUseCase = buildGetJobOrdersUseCase({ jobOrderService });
export const getJobOrderByIdUseCase = buildGetJobOrderByIdUseCase({ jobOrderService });
export const createJobOrderUseCase = buildCreateJobOrderUseCase({ jobOrderService });
export const finalizeJobOrderUseCase = buildFinalizeJobOrderUseCase({ jobOrderService });
export const completeJobOrderUseCase = buildCompleteJobOrderUseCase({ jobOrderService });
export const archiveJobOrderUseCase = buildArchiveJobOrderUseCase({ jobOrderService });
export const restoreJobOrderUseCase = buildRestoreJobOrderUseCase({ jobOrderService });
