import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import { createStockMovement } from '../../../services/stockMovementService.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const buildReceivePurchaseOrderUseCase = ({ purchaseOrderRepository }) => {
  return async ({ poId, receiptData, userId }) => {
    const normalizedPoId = parsePositiveInt(poId);
    const normalizedUserId = userId === undefined || userId === null ? null : parsePositiveInt(userId);

    if (!normalizedPoId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'poId must be a positive integer',
        { statusCode: 400 }
      ));
    }

    if (userId !== undefined && userId !== null && !normalizedUserId) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'userId must be a positive integer when provided',
        { statusCode: 400 }
      ));
    }

    if (!isPlainObject(receiptData)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'receiptData must be an object',
        { statusCode: 400 }
      ));
    }

    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const transaction = await sequelize.transaction();

    try {
      const po = await purchaseOrderRepository.getPurchaseOrderById(normalizedPoId, { transaction });
      
      const { line_items } = receiptData;

      if (Array.isArray(line_items)) {
        for (const receiptItem of line_items) {
          const lineItem = po.lineItems.find((li) => li.line_item_id === receiptItem.line_item_id);
          if (!lineItem) continue;

          const receivingQty = parseFloat(receiptItem.quantity_received || 0);
          if (receivingQty <= 0) continue;

          const currentReceived = parseFloat(lineItem.quantity_received || 0);
          const orderedQty = parseFloat(lineItem.quantity_ordered);
          const newTotalReceived = currentReceived + receivingQty;

          if (newTotalReceived > orderedQty + 0.0001) {
            throw new DomainError(
              DomainErrorCode.VALIDATION_FAILED,
              `Over-receiving not allowed for item "${lineItem.item?.name}". Ordered: ${orderedQty}, Already Received: ${currentReceived}, Attempting to Receive: ${receivingQty}. Max allowed: ${(orderedQty - currentReceived).toFixed(2)}`,
              { statusCode: 400 }
            );
          }

          await purchaseOrderRepository.updatePOLineItem(lineItem.line_item_id, {
            quantity_received: newTotalReceived,
            quality_check_status: receiptItem.quality_check_status || 'passed',
            expiry_date: receiptItem.expiry_date || lineItem.expiry_date || null
          }, { transaction });

          await createStockMovement({
            item_id: lineItem.item.item_id,
            quantity: receivingQty,
            movement_type: 'purchase_receipt',
            reference_id: po.po_number,
            reference_type: 'PO',
            notes: receiptData.notes || po.notes || null,
            expiry_date: receiptItem.expiry_date || null,
            cost_per_unit: lineItem.unit_price,
            po_number: po.po_number
          }, normalizedUserId, transaction);
        }
      }

      // Reload line items
      const updatedLines = await purchaseOrderRepository.getPOLineItemsByPoId(normalizedPoId, { transaction });

      const allReceived = updatedLines.every(
        (li) => parseFloat(li.quantity_received) >= parseFloat(li.quantity_ordered) - 0.0001
      );

      const status = allReceived ? 'received' : 'partial';

      await purchaseOrderRepository.updatePurchaseOrder(normalizedPoId, {
        status,
        received_date: new Date(),
        received_by: normalizedUserId,
        notes: receiptData.notes || po.notes,
        delivery_rating: receiptData.delivery_rating || po.delivery_rating
      }, { transaction });

      await transaction.commit();

      // Return the updated PO (simplest is to fetch it again without transaction lock)
      const finalPo = await purchaseOrderRepository.getPurchaseOrderById(normalizedPoId);
      return ok(finalPo);
      
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      return fail(mapPurchaseOrderUseCaseError(error, 'Failed to receive purchase order'));
    }
  };
};
