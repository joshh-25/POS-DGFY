import {
  voidMovement,
  exportStockMovements,
} from '../../../services/stockMovementService.js';

export const voidFeatureMovement = (movementId, reason) => {
  return voidMovement(movementId, reason);
};

export const exportFeatureStockMovements = (filters = {}) => {
  return exportStockMovements(filters);
};

export default {
  voidFeatureMovement,
  exportFeatureStockMovements,
};
