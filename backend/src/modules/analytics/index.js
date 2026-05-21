import * as analyticsService from '../../services/analyticsService.js';
import {
  buildGetSupplierPerformanceUseCase,
  buildGetAnomaliesUseCase,
  buildGetCostAnalysisUseCase,
  buildGetItemBurnRateUseCase
} from './usecases/analyticsUseCases.js';

export const getSupplierPerformanceUseCase = buildGetSupplierPerformanceUseCase({ analyticsService });
export const getAnomaliesUseCase = buildGetAnomaliesUseCase({ analyticsService });
export const getCostAnalysisUseCase = buildGetCostAnalysisUseCase({ analyticsService });
export const getItemBurnRateUseCase = buildGetItemBurnRateUseCase({ analyticsService });
