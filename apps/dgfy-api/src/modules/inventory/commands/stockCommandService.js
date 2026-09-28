import {
  createStockMovement,
  validateStockIssueAvailability as validateStockIssue,
  voidOnlineOrderGoodsIssue,
  voidParkedSaleGoodsIssue
} from '../../../services/stockMovementService.js';
import { assertStockCommandServiceContract, StockCommandServiceNamedCommands } from '../contracts/stockCommandService.contract.js';

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

export const validateStockIssueAvailability = (movementData, userId, transaction = null) => (
  validateStockIssue(movementData, userId, transaction)
);

export const issueStockForOnlineFulfillment = (movementData, userId, transaction = null) => (
  createStockMovement(
    withMovementDefaults(movementData, {
      movement_type: 'goods_issue',
      reference_type: 'POS'
    }),
    userId,
    transaction,
    { allowInactiveHistoricalItem: true }
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

// One-time reversal of an online order's confirmation-time goods-issue, for the
// post-acceptance cancel/reject paths. Unlike every command above this does not create one
// movement -- it voids each of the order's own `ONLINE:<orderId>:` goods-issue movements via
// voidMovement (FIFO-aware, with its downstream-consumption guard), inside the caller's
// transaction when one is provided so a multi-line reversal is atomic with the status update.
// `movementData` carries `{ order_id, reason }`; zero matching movements is a no-op success.
export const reverseOnlineOrderGoodsIssue = (movementData = {}, userId, transaction = null) => (
  voidOnlineOrderGoodsIssue({
    orderId: movementData?.order_id,
    userId,
    reason: movementData?.reason || `Reversal of online order goods-issue for order ${movementData?.order_id}`,
    transaction
  })
);

export const reverseParkedSaleGoodsIssue = (movementData = {}, userId, transaction = null) => (
  voidParkedSaleGoodsIssue({
    parkedSaleId: movementData?.parked_sale_id,
    userId,
    reason: movementData?.reason || `Reversal of parked POS sale ${movementData?.parked_sale_id}`,
    transaction
  })
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

const stockCommandService = {
  issueStockForPosSale,
  validateStockIssueAvailability,
  issueStockForOnlineFulfillment,
  issueStockForDispatch,
  returnStockForVoidedSale,
  reverseOnlineOrderGoodsIssue,
  reverseParkedSaleGoodsIssue,
  receivePurchasedStock,
  transferStock,
  adjustStock,
  consumeStockForProduction,
  receiveProducedStock,
  recordLoss,
  createStockMovement
};

// Phase 9: self-check against the formalized port contract (mirrors
// itemRepository.js's assertItemRepositoryContract self-check at module
// load) - this is the canonical implementation, so it should satisfy every
// named command, not just the ones a given caller happens to use.
assertStockCommandServiceContract(stockCommandService, { requiredCommands: StockCommandServiceNamedCommands });

export default stockCommandService;
