import {
  getSuppliersUseCase,
  getSupplierByIdUseCase,
  createSupplierUseCase,
  updateSupplierUseCase,
  finalizeSupplierUseCase,
  addSupplierItemUseCase,
  deleteSupplierUseCase
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

export const getSuppliers = async (req, res, next) => {
  try {
    const result = await getSuppliersUseCase({ query: req.query });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'suppliers_viewed',
      surface: 'suppliers',
      action: 'list_suppliers',
      result,
      successMetadataResolver: (data) => ({
        result_count: Array.isArray(data?.suppliers) ? data.suppliers.length : 0
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

export const getSupplierById = async (req, res, next) => {
  try {
    const result = await getSupplierByIdUseCase({ supplierId: req.params.supplier_id });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_viewed',
      surface: 'suppliers',
      action: 'view_supplier',
      result,
      successMetadataResolver: (data) => ({
        supplier_id: data?.supplier_id ?? req.params.supplier_id,
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

export const createSupplier = async (req, res, next) => {
  try {
    const supplierData = req.validatedData;
    const userId = req.user.user_id;
    const result = await createSupplierUseCase({ supplierData, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_created',
      surface: 'suppliers',
      action: 'create_supplier',
      result,
      successMetadataResolver: (data) => ({
        supplier_id: data?.supplier_id ?? null,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => {
        const supplier = result.data;
        const message = supplier.status === 'draft'
          ? 'Supplier draft saved successfully'
          : 'Supplier created successfully';

        return {
          success: true,
          data: {
            supplier_id: supplier.supplier_id,
            name: supplier.name,
            status: supplier.status
          },
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

export const updateSupplier = async (req, res, next) => {
  try {
    const { supplier_id: supplierId } = req.params;
    const supplierData = req.validatedData;
    const userId = req.user.user_id;
    const result = await updateSupplierUseCase({ supplierId, supplierData, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_updated',
      surface: 'suppliers',
      action: 'update_supplier',
      result,
      successMetadataResolver: (data) => ({
        supplier_id: data?.supplier_id ?? supplierId,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Supplier updated successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeSupplier = async (req, res, next) => {
  try {
    const { supplier_id: supplierId } = req.params;
    const userId = req.user.user_id;
    const result = await finalizeSupplierUseCase({ supplierId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_finalized',
      surface: 'suppliers',
      action: 'finalize_supplier',
      result,
      successMetadataResolver: (data) => ({
        supplier_id: data?.supplier_id ?? supplierId,
        status: data?.status ?? null
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Supplier finalized successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const addSupplierItem = async (req, res, next) => {
  try {
    const result = await addSupplierItemUseCase({
      supplierId: req.params.supplier_id,
      supplierItemData: req.body
    });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_item_added',
      surface: 'suppliers',
      action: 'add_supplier_item',
      result,
      successMetadataResolver: () => ({
        supplier_id: req.params.supplier_id
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        message: 'Item added to supplier successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => defaultErrorPayload(req, res, failure)
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSupplier = async (req, res, next) => {
  try {
    const { supplier_id: supplierId } = req.params;
    const userId = req.user.user_id;

    const result = await deleteSupplierUseCase({ supplierId, userId });
    await trackProductUsageFromResult({
      req,
      user: req.user,
      eventType: 'supplier_deleted',
      surface: 'suppliers',
      action: 'delete_supplier',
      result,
      successMetadataResolver: () => ({
        supplier_id: supplierId
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: null,
        message: 'Supplier deleted successfully',
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        ...defaultErrorPayload(req, res, failure),
        details: failure.details
      })
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  finalizeSupplier,
  addSupplierItem,
  deleteSupplier
};
