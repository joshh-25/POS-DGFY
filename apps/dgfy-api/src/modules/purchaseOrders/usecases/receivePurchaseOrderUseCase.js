import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPurchaseOrderUseCaseError } from './purchaseOrderUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// No default value here on purpose (Phase 9): this used to default to
// `{ receivePurchasedStock }` imported directly from
// inventory/commands/stockCommandService.js, which is exactly the
// "usecases/ file reaches past the module boundary, and silently falls back
// to it if DI is mis-wired" pattern removed elsewhere in this phase (see the
// `inventoryCommandService || stockMovementService` fallback that used to
// live in posUseCases.js). purchaseOrders/index.js already injects the real
// port (inventoryStockCommandService from inventory/index.js); a caller that
// forgets to pass inventoryCommandService now gets a loud TypeError at the
// call site below instead of a silent, unaccountable write path.
export const buildReceivePurchaseOrderUseCase = ({
  purchaseOrderRepository,
  inventoryCommandService
}) => {
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

    if (typeof inventoryCommandService?.receivePurchasedStock !== 'function') {
      return fail(new DomainError(
        DomainErrorCode.CONFLICT,
        'Purchase order receiving is unavailable: the inventory stock command port is not wired.',
        { statusCode: 409, details: { reason_code: 'INVENTORY_COMMAND_PORT_UNWIRED' } }
      ));
    }

    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const transaction = await sequelize.transaction();

    try {
      const po = await purchaseOrderRepository.getPurchaseOrderById(normalizedPoId, { transaction });
      
      const { line_items, location_id } = receiptData;
      const normalizedLocationId = parsePositiveInt(location_id);
      if (!normalizedLocationId) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          'location_id is required and must be a positive integer for PO receiving',
          { statusCode: 422 }
        );
      }

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

          await inventoryCommandService.receivePurchasedStock({
            item_id: lineItem.item.item_id,
            quantity: receivingQty,
            movement_type: 'purchase_receipt',
            location_id: normalizedLocationId,
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
