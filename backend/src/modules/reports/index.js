import * as reportService from '../../services/reportService.js';
import {
  buildGetExpiryReportUseCase,
  buildGetEnhancedStockAgingUseCase,
  buildGetProductionReportUseCase,
  buildGetPurchaseOrderAnalysisUseCase,
  buildGetExecutiveSummaryUseCase,
  buildGetSnapshotsUseCase,
  buildGetSnapshotByIdUseCase,
  buildSaveSnapshotUseCase,
  buildGetStockAgingUseCase,
  buildGetSurplusShortageUseCase,
  buildGetFinancialSummaryUseCase,
  buildGetSupplierPerformanceUseCase
} from './usecases/reportUseCases.js';

export const getExpiryReportUseCase = buildGetExpiryReportUseCase({ reportService });
export const getEnhancedStockAgingUseCase = buildGetEnhancedStockAgingUseCase({ reportService });
export const getProductionReportUseCase = buildGetProductionReportUseCase({ reportService });
export const getPurchaseOrderAnalysisUseCase = buildGetPurchaseOrderAnalysisUseCase({ reportService });
export const getExecutiveSummaryUseCase = buildGetExecutiveSummaryUseCase({ reportService });
export const getSnapshotsUseCase = buildGetSnapshotsUseCase({ reportService });
export const getSnapshotByIdUseCase = buildGetSnapshotByIdUseCase({ reportService });
export const saveSnapshotUseCase = buildSaveSnapshotUseCase({ reportService });
export const getStockAgingUseCase = buildGetStockAgingUseCase({ reportService });
export const getSurplusShortageUseCase = buildGetSurplusShortageUseCase({ reportService });
export const getFinancialSummaryUseCase = buildGetFinancialSummaryUseCase({ reportService });
export const getSupplierPerformanceUseCase = buildGetSupplierPerformanceUseCase({ reportService });
