import {
  getJobOrdersUseCase,
  getJobOrderByIdUseCase,
  createJobOrderUseCase,
  finalizeJobOrderUseCase,
  completeJobOrderUseCase,
  archiveJobOrderUseCase,
  restoreJobOrderUseCase
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

export const getJobOrders = async (req, res, next) => {
  try {
    const result = await getJobOrdersUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_orders_viewed',
      surface: 'job_orders',
      action: 'list_job_orders',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.job_orders) ? data.job_orders.length : 0
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

export const getJobOrderById = async (req, res, next) => {
  try {
    const result = await getJobOrderByIdUseCase({ jobOrderId: req.params.jo_id });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_order_viewed',
      surface: 'job_orders',
      action: 'view_job_order',
      result,
      successMetadataResolver: (data) => ({
        jo_id: data?.jo_id ?? req.params.jo_id,
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

export const createJobOrder = async (req, res, next) => {
  try {
    const jobOrderData = req.validatedData;
    const userId = req.user.user_id;
    const result = await createJobOrderUseCase({ jobOrderData, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_order_created',
      surface: 'job_orders',
      action: 'create_job_order',
      result,
      successMetadataResolver: (jo) => ({
        jo_id: jo?.jo_id ?? null,
        status: jo?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => {
        const jo = result.data;
        const message = jo.status === 'draft'
          ? 'Job order draft saved successfully'
          : 'Job order created successfully';

        return {
          success: true,
          data: jo,
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

export const finalizeJobOrder = async (req, res, next) => {
  try {
    const { jo_id: jobOrderId } = req.params;
    const userId = req.user.user_id;
    const result = await finalizeJobOrderUseCase({ jobOrderId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_order_finalized',
      surface: 'job_orders',
      action: 'finalize_job_order',
      result,
      successMetadataResolver: (jo) => ({
        jo_id: jo?.jo_id ?? jobOrderId,
        status: jo?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Job order finalized successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const completeJobOrder = async (req, res, next) => {
  try {
    const completionData = req.validatedData || req.body || {};
    const normalizedQualityCheck = typeof completionData.quality_check === 'string'
      ? completionData.quality_check.trim().toLowerCase()
      : completionData.quality_check;
    const canonicalQualityCheck = normalizedQualityCheck === 'pass'
      ? 'passed'
      : normalizedQualityCheck === 'fail'
        ? 'failed'
        : normalizedQualityCheck;

    const result = await completeJobOrderUseCase({
      jobOrderId: req.params.jo_id,
      userId: req.user.user_id,
      completionData: {
        ...completionData,
        quality_check: canonicalQualityCheck
      }
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_order_completed',
      surface: 'job_orders',
      action: 'complete_job_order',
      result,
      successMetadataResolver: (jo) => ({
        jo_id: jo?.jo_id ?? req.params.jo_id,
        status: jo?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Job order completed successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const archiveJobOrder = async (req, res, next) => {
  try {
    const { jo_id: jobOrderId } = req.params;
    const userId = req.user.user_id;
    const result = await archiveJobOrderUseCase({ jobOrderId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'job_order_archived',
      surface: 'job_orders',
      action: 'archive_job_order',
      result,
      successMetadataResolver: (jo) => ({
        jo_id: jo?.jo_id ?? jobOrderId,
        status: jo?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Job Order archived successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const restoreJobOrder = async (req, res, next) => {
  try {
    const { jo_id: jobOrderId } = req.params;
    const result = await restoreJobOrderUseCase({ jobOrderId });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Job Order restored successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getJobOrders,
  getJobOrderById,
  createJobOrder,
  finalizeJobOrder,
  completeJobOrder,
  archiveJobOrder,
  restoreJobOrder
};
