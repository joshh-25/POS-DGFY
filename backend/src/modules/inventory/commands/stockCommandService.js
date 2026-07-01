import { createStockMovement } from '../../../services/stockMovementService.js';

const withMovementDefaults = (movementData = {}, defaults = {}) => ({
  ...movementData,
  ...Object.fromEntries(
    Object.entries(defaults).filter(([key]) => movementData[key] === undefined || movementData[key] === null)
  )
});

export const issueStockForPosSale = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'goods_issue',
      reference_type: 'POS'
    }),
    userId,
    transaction
  )
);

export const issueStockForOnlineFulfillment = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'goods_issue',
      reference_type: 'POS'
    }),
    userId,
    transaction
  )
);

export const issueStockForDispatch = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'goods_issue',
      reference_type: 'DO'
    }),
    userId,
    transaction
  )
);

export const returnStockForVoidedSale = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'return',
      reference_type: 'POS'
    }),
    userId,
    transaction
  )
);

export const receivePurchasedStock = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'purchase_receipt',
      reference_type: 'PO'
    }),
    userId,
    transaction
  )
);

export const transferStock = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'transfer',
      reference_type: 'MANUAL'
    }),
    userId,
    transaction
  )
);

export const adjustStock = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'adjustment',
      reference_type: 'MANUAL'
    }),
    userId,
    transaction
  )
);

export const consumeStockForProduction = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'production_consumption',
      reference_type: 'JO'
    }),
    userId,
    transaction
  )
);

export const receiveProducedStock = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'production_output',
      reference_type: 'JO'
    }),
    userId,
    transaction
  )
);

export const recordLoss = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'calculated_loss',
      reference_type: 'MANUAL'
    }),
    userId,
    transaction
  )
);

export { createStockMovement };

export default {
  issueStockForPosSale,
  issueStockForOnlineFulfillment,
  issueStockForDispatch,
  returnStockForVoidedSale,
  receivePurchasedStock,
  transferStock,
  adjustStock,
  consumeStockForProduction,
  receiveProducedStock,
  recordLoss,
  createStockMovement
};
