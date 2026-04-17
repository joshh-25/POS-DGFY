import {
  getStockMovementsUseCase,
  getMovementByIdUseCase,
  getMovementStatsUseCase,
  createStockMovementUseCase,
  voidMovementUseCase,
  exportMovementsUseCase,
  createBulkMovementsUseCase
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

const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const getStockMovements = async (req, res, next) => {
  try {
    const result = await getStockMovementsUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'stock_movements_viewed',
      surface: 'stock_movements',
      action: 'list_stock_movements',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.movements) ? data.movements.length : 0
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

export const getMovementById = async (req, res, next) => {
  try {
    const result = await getMovementByIdUseCase({ movementId: req.params.id });
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

export const getMovementStats = async (req, res, next) => {
  try {
    const result = await getMovementStatsUseCase({ query: req.query });
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

export const createStockMovement = async (req, res, next) => {
  try {
    const result = await createStockMovementUseCase({
      movementData: req.validatedData || req.body,
      userId: req.user.user_id
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'stock_movement_created',
      surface: 'stock_movements',
      action: 'create_stock_movement',
      result,
      successMetadataResolver: (data) => ({
        movement_id: data?.movement_id ?? null,
        movement_type: data?.movement_type ?? req.validatedData?.movement_type ?? req.body?.movement_type ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Stock movement recorded successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const voidMovement = async (req, res, next) => {
  try {
    const result = await voidMovementUseCase({
      movementId: req.params.id,
      userId: req.user.user_id,
      reason: req.body.reason
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'stock_movement_voided',
      surface: 'stock_movements',
      action: 'void_stock_movement',
      result,
      successMetadataResolver: (data) => ({
        movement_id: data?.movement_id ?? req.params.id,
        movement_type: data?.movement_type ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Movement voided successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const exportMovements = async (req, res, next) => {
  try {
    const result = await exportMovementsUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'stock_movements_exported',
      surface: 'stock_movements',
      action: 'export_stock_movements',
      result,
      successMetadataResolver: (data) => ({
        format: req.query.format || 'json',
        row_count: Array.isArray(data) ? data.length : null
      })
    });
    if (!result?.success) {
      return sendUseCaseResult(res, result, {
        errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
      });
    }

    const data = result.data || [];

    if (req.query.format === 'csv') {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map((row) => Object.values(row).map((value) => escapeCSV(value)).join(','));
      const csv = [headers, ...rows].join('\n');

      res.header('Content-Type', 'text/csv');
      res.attachment(`stock_movements_${new Date().toISOString()}.csv`);
      return res.send(csv);
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

export const createBulkMovements = async (req, res, next) => {
  try {
    const result = await createBulkMovementsUseCase({
      movements: req.validatedData?.movements || req.body.movements,
      userId: req.user.user_id
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'stock_bulk_movements_created',
      surface: 'stock_movements',
      action: 'create_bulk_stock_movements',
      result,
      successMetadataResolver: (data) => ({
        created_count: Array.isArray(data) ? data.length : 0
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: `${result.data.length} movements recorded successfully`,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStockMovements,
  getMovementById,
  getMovementStats,
  createStockMovement,
  voidMovement,
  exportMovements,
  createBulkMovements
};
