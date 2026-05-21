import {
  useStockMovements,
  useCreateStockMovement,
  useMovementStats,
} from '../../../hooks/useStockMovements.js';
import { useItems } from '../../../hooks/useItems.js';

export const useFeatureStockMovements = (params = {}) => useStockMovements(params);
export const useFeatureCreateStockMovement = () => useCreateStockMovement();
export const useFeatureMovementStats = (params = {}) => useMovementStats(params);
export const useFeatureStockMovementItems = (params = {}) => useItems(params);

export default useFeatureStockMovements;
