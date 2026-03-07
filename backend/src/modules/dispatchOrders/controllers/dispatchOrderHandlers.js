import {
  getDispatchOrdersUseCase,
  getDispatchOrderByIdUseCase,
  getDispatchStatsUseCase,
  exportDispatchOrdersUseCase,
  createDispatchOrderUseCase,
  updateDispatchOrderUseCase,
  confirmDispatchOrderUseCase,
  dispatchLinesUseCase,
  cancelDispatchOrderUseCase,
  archiveDispatchOrderUseCase,
  getEarningsReportUseCase,
  updateLineSalePriceUseCase
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

export const getDispatchOrders = async (req, res, next) => {
  try {
    const result = await getDispatchOrdersUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dispatch_orders_viewed',
      surface: 'dispatch_orders',
      action: 'list_dispatch_orders',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.dispatchOrders) ? data.dispatchOrders.length : 0
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

export const getDispatchOrderById = async (req, res, next) => {
  try {
    const result = await getDispatchOrderByIdUseCase({ dispatchOrderId: req.params.id });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dispatch_order_viewed',
      surface: 'dispatch_orders',
      action: 'view_dispatch_order',
      result,
      successMetadataResolver: (data) => ({
        dispatch_order_id: data?.do_id ?? req.params.id,
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

export const getDispatchStats = async (req, res, next) => {
  try {
    const result = await getDispatchStatsUseCase({ query: req.query });
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

export const exportDispatchOrders = async (req, res, next) => {
  try {
    const result = await exportDispatchOrdersUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dispatch_orders_exported',
      surface: 'dispatch_orders',
      action: 'export_dispatch_orders',
      result,
      successMetadataResolver: (data) => ({
        format: req.query.format || 'json',
        row_count: typeof data === 'string' ? null : Array.isArray(data) ? data.length : null
      })
    });
    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    if (req.query.format === 'csv') {
      const csvContent = result.data;
      const filename = `dispatch-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvContent);
    }

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

export const createDispatchOrder = async (req, res, next) => {
  try {
    const result = await createDispatchOrderUseCase({
      dispatchOrderData: req.validatedData,
      userId: req.user.user_id
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dispatch_order_created',
      surface: 'dispatch_orders',
      action: 'create_dispatch_order',
      result,
      successMetadataResolver: (data) => ({
        dispatch_order_id: data?.do_id ?? null,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `Dispatch Order ${result.data.do_number} created successfully`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const updateDispatchOrder = async (req, res, next) => {
  try {
    const result = await updateDispatchOrderUseCase({
      dispatchOrderId: req.params.id,
      dispatchOrderData: req.validatedData,
      userId: req.user.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Dispatch Order updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const confirmDispatchOrder = async (req, res, next) => {
  try {
    const result = await confirmDispatchOrderUseCase({
      dispatchOrderId: req.params.id,
      userId: req.user.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `Dispatch Order ${result.data.do_number} confirmed`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const dispatchLines = async (req, res, next) => {
  try {
    const result = await dispatchLinesUseCase({
      dispatchOrderId: req.params.id,
      lines: req.validatedData.lines,
      userId: req.user.user_id
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `Dispatch executed for ${result.data.do_number}`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const cancelDispatchOrder = async (req, res, next) => {
  try {
    const result = await cancelDispatchOrderUseCase({
      dispatchOrderId: req.params.id,
      userId: req.user.user_id,
      reason: req.validatedData?.reason
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `Dispatch Order ${result.data.do_number} cancelled`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const archiveDispatchOrder = async (req, res, next) => {
  try {
    const result = await archiveDispatchOrderUseCase({
      dispatchOrderId: req.params.id,
      userId: req.user.user_id
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'dispatch_order_archived',
      surface: 'dispatch_orders',
      action: 'archive_dispatch_order',
      result,
      successMetadataResolver: (data) => ({
        dispatch_order_id: data?.do_id ?? req.params.id,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Dispatch Order archived',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const getEarningsReport = async (req, res, next) => {
  try {
    const result = await getEarningsReportUseCase({ query: req.validatedQuery || req.query });
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

export const updateLineSalePrice = async (req, res, next) => {
  try {
    const result = await updateLineSalePriceUseCase({
      doId:      req.params.id,
      lineId:    req.params.lineId,
      salePrice: req.validatedData?.sale_price_per_unit ?? null
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

export default {
  getDispatchOrders,
  getDispatchOrderById,
  getDispatchStats,
  exportDispatchOrders,
  createDispatchOrder,
  updateDispatchOrder,
  confirmDispatchOrder,
  dispatchLines,
  cancelDispatchOrder,
  archiveDispatchOrder,
  getEarningsReport,
  updateLineSalePrice
};
