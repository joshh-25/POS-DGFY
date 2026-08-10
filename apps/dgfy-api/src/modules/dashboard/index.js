import * as dashboardService from '../../services/dashboardService.js';
import {
  buildGetStatsUseCase,
  buildGetLowStockUseCase,
  buildGetRecentMovementsUseCase
} from './usecases/dashboardUseCases.js';

export const getStatsUseCase = buildGetStatsUseCase({ dashboardService });
export const getLowStockUseCase = buildGetLowStockUseCase({ dashboardService });
export const getRecentMovementsUseCase = buildGetRecentMovementsUseCase({ dashboardService });
