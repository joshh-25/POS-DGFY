import {
  getPurchaseOrdersUseCase,
  getPurchaseOrderByIdUseCase,
  createPurchaseOrderUseCase,
  finalizePurchaseOrderUseCase,
  receivePurchaseOrderUseCase,
  archivePurchaseOrderUseCase,
  restorePurchaseOrderUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

const timestamp = () => new Date().toISOString();
const requestId = (req, res) => req.requestId || res.locals?.requestId || null;
const defaultErrorPayload = (req, res, failure) => ({
  success: false,
  data: null,
  message: failure.message,
  error_code: failure.code,
  errors: failure.details,
  request_id: requestId(req, res),
  timestamp: timestamp()
});

export const getPurchaseOrders = async (req, res, next) => {
  try {
    const result = await getPurchaseOrdersUseCase({ queryParams: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_orders_viewed',
      surface: 'purchase_orders',
      action: 'list_purchase_orders',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.purchase_orders) ? data.purchase_orders.length : 0
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getPurchaseOrderById = async (req, res, next) => {
  try {
    const result = await getPurchaseOrderByIdUseCase({ poId: req.params.po_id });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_order_viewed',
      surface: 'purchase_orders',
      action: 'view_purchase_order',
      result,
      successMetadataResolver: (data) => ({
        po_id: data?.po_id ?? req.params.po_id,
        status: data?.status ?? null
      })
    });
    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const createPurchaseOrder = async (req, res, next) => {
  try {
    const poData = req.validatedData;
    const userId = req.user.user_id;
    const result = await createPurchaseOrderUseCase({ poData, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_order_created',
      surface: 'purchase_orders',
      action: 'create_purchase_order',
      result,
      successMetadataResolver: (po) => ({
        po_id: po?.po_id ?? null,
        status: po?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => {
        const po = result.data;
        const message = po.status === 'draft'
          ? 'Purchase order draft saved successfully'
          : 'Purchase order created successfully';

        return {
          success: true,
          data: po,
          message,
          timestamp: timestamp()
        };
      },
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const finalizePurchaseOrder = async (req, res, next) => {
  try {
    const { po_id: poId } = req.params;
    const userId = req.user.user_id;
    const result = await finalizePurchaseOrderUseCase({ poId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_order_finalized',
      surface: 'purchase_orders',
      action: 'finalize_purchase_order',
      result,
      successMetadataResolver: (po) => ({
        po_id: po?.po_id ?? poId,
        status: po?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Purchase order finalized successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const receivePurchaseOrder = async (req, res, next) => {
  try {
    const result = await receivePurchaseOrderUseCase({
      poId: req.params.po_id,
      receiptData: req.validatedData || req.body,
      userId: req.user.user_id
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_order_received',
      surface: 'purchase_orders',
      action: 'receive_purchase_order',
      result,
      successMetadataResolver: (po) => ({
        po_id: po?.po_id ?? req.params.po_id,
        status: po?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Purchase order received successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const archivePurchaseOrder = async (req, res, next) => {
  try {
    const { po_id: poId } = req.params;
    const userId = req.user.user_id;
    const result = await archivePurchaseOrderUseCase({ poId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'purchase_order_archived',
      surface: 'purchase_orders',
      action: 'archive_purchase_order',
      result,
      successMetadataResolver: (po) => ({
        po_id: po?.po_id ?? poId,
        status: po?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Purchase Order archived successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const restorePurchaseOrder = async (req, res, next) => {
  try {
    const { po_id: poId } = req.params;
    const result = await restorePurchaseOrderUseCase({ poId });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Purchase Order restored successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  finalizePurchaseOrder,
  receivePurchaseOrder,
  archivePurchaseOrder,
  restorePurchaseOrder
};
