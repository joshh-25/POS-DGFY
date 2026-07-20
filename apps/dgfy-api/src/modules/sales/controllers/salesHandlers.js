import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { listSalesTransactionsUseCase } from '../index.js';

const timestamp = () => new Date().toISOString();
const toCsvCell = (value) => {
  if (value == null) return '';
  const raw = String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const normalizePermissions = (permissions) => {
  if (Array.isArray(permissions)) return permissions;
  if (typeof permissions === 'string') {
    const trimmed = permissions.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const includesAnyPermission = (permissions, candidates) => {
  const normalized = normalizePermissions(permissions);
  return candidates.some((permission) => normalized.includes(permission));
};

export const listSalesTransactions = async (req, res, next) => {
  try {
    const query = req.validatedQuery || req.query || {};
    const userPermissions = normalizePermissions(req.user?.permissions);
    const canViewSales = req.user?.is_master_admin || includesAnyPermission(userPermissions, [
      'reports:view',
      'do:view',
      'pos:view',
      'pos:transact'
    ]);

    if (!canViewSales) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Access denied: Insufficient permissions',
        required_any: ['reports:view', 'do:view', 'pos:view'],
        timestamp: timestamp()
      });
    }

    const result = await listSalesTransactionsUseCase({
      query,
      userPermissions
    });

    if (result?.success && String(query?.export || '').toLowerCase() === 'csv') {
      const rows = Array.isArray(result.data?.transactions) ? result.data.transactions : [];
      const headers = [
        'source',
        'reference_no',
        'occurred_at',
        'status',
        'customer_or_recipient',
        'payment_type',
        'order_method',
        'pos_order_source',
        'gross_sales',
        'service_fee_amount',
        'service_fee_label_snapshot',
        'service_fee_method_snapshot',
        'service_fee_overridden',
        'cogs',
        'gross_profit',
        'vatable_sales',
        'vat_amount',
        'vat_exempt_sales',
        'zero_rated_sales',
        'discount_amount',
        'discount_label_snapshot',
        'discount_rate_snapshot'
      ];
      const csvRows = [
        headers.join(','),
        ...rows.map((row) => headers.map((header) => toCsvCell(row?.[header])).join(','))
      ];
      const filename = `sales_timeline_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csvRows.join('\n'));
    }

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 200,
      successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: timestamp()
      }),
      errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        request_id: req.requestId || res.locals?.requestId || null,
        timestamp: timestamp()
      })
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listSalesTransactions
};
