import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { assertSalesRepositoryContract } from '../contracts/salesRepository.contract.js';

const toNum = (value) => Number(value || 0);
const round4 = (value) => Math.round(toNum(value) * 10000) / 10000;
const toDateStart = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const toDateEnd = (value) => new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);

const buildDateRange = (dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) return null;
  const range = {};
  if (dateFrom) range[Op.gte] = toDateStart(dateFrom);
  if (dateTo) range[Op.lte] = toDateEnd(dateTo);
  return range;
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

const mapPosRows = (rows) => rows.map((row) => {
  const lineItems = Array.isArray(row.lines) ? row.lines : [];
  const cogs = round4(
    lineItems.reduce((sum, line) => sum + (toNum(line.quantity) * toNum(line.cost_snapshot)), 0)
  );
  const totalAmount = round4(row.total_amount);
  const grossProfit = round4(totalAmount - cogs);

    return {
      source: 'POS',
      source_id: row.pos_transaction_id,
      reference_no: row.invoice_number,
    occurred_at: row.created_at,
    status: row.status,
    customer_or_recipient: null,
    payment_type: row.payment_type,
    order_method: row.order_method,
    gross_sales: totalAmount,
    service_fee_amount: round4(row.service_fee_amount),
    service_fee_label_snapshot: row.service_fee_label_snapshot || null,
    service_fee_method_snapshot: row.service_fee_method_snapshot || null,
    service_fee_overridden: Boolean(row.service_fee_overridden),
    cogs,
    gross_profit: grossProfit,
    vatable_sales: round4(row.vatable_sales),
      vat_amount: round4(row.vat_amount),
      vat_exempt_sales: round4(row.vat_exempt_sales),
      zero_rated_sales: round4(row.zero_rated_sales),
      discount_amount: round4(row.discount_amount),
      discount_label_snapshot: row.discount_label_snapshot || null,
      discount_rate_snapshot: row.discount_rate_snapshot == null ? null : round4(row.discount_rate_snapshot),
      detail: {
        cashier: row.cashier ? { user_id: row.cashier.user_id, username: row.cashier.username } : null,
      service_fee: {
        amount: round4(row.service_fee_amount),
        label: row.service_fee_label_snapshot || null,
        method: row.service_fee_method_snapshot || null,
        overridden: Boolean(row.service_fee_overridden)
      },
      lines: lineItems.map((line) => ({
        line_id: line.line_id,
        item_id: line.item_id,
        item_name: line.item?.name || `Item #${line.item_id}`,
        quantity: round4(line.quantity),
        unit_of_measure: line.unit_of_measure,
        sale_price: round4(line.sale_price),
        line_subtotal: round4(line.line_subtotal),
        vat_type_snapshot: line.vat_type_snapshot,
        vat_rate_snapshot: round4(line.vat_rate_snapshot)
      }))
    }
  };
});

const mapDispatchRows = (rows) => rows.map((row) => {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const revenue = round4(lines.reduce((sum, line) => {
    const effectiveQty = Math.max(toNum(line.qty_dispatched) - toNum(line.qty_voided), 0);
    return sum + (effectiveQty * toNum(line.sale_price_per_unit));
  }, 0));
  const cogs = round4(lines.reduce((sum, line) => {
    const effectiveQty = Math.max(toNum(line.qty_dispatched) - toNum(line.qty_voided), 0);
    return sum + (effectiveQty * toNum(line.cost_per_unit));
  }, 0));
  const grossProfit = round4(revenue - cogs);

  return {
    source: 'DISPATCH',
    source_id: row.do_id,
    reference_no: row.do_number,
    occurred_at: row.dispatch_date,
    status: row.status,
    customer_or_recipient: row.recipient_name,
    payment_type: null,
    order_method: null,
    gross_sales: revenue,
    service_fee_amount: null,
    cogs,
    gross_profit: grossProfit,
    vatable_sales: null,
    vat_amount: null,
    vat_exempt_sales: null,
    zero_rated_sales: null,
    detail: {
      recipient_name: row.recipient_name,
      recipient_type: row.recipient_type,
      lines: lines.map((line) => ({
        line_id: line.line_id,
        item_id: line.item_id,
        item_name: line.item?.name || `Item #${line.item_id}`,
        qty_ordered: round4(line.qty_ordered),
        qty_dispatched: round4(line.qty_dispatched),
        qty_voided: round4(line.qty_voided),
        cost_per_unit: round4(line.cost_per_unit),
        sale_price_per_unit: round4(line.sale_price_per_unit)
      }))
    }
  };
});

export const salesRepository = {
  async listUnifiedTransactions({ filters = {}, userPermissions = [] }) {
    const PosTransaction = dbStore.get('PosTransaction');
    const PosTransactionLine = dbStore.get('PosTransactionLine');
    const DispatchOrder = dbStore.get('DispatchOrder');
    const DispatchOrderLine = dbStore.get('DispatchOrderLine');
    const Item = dbStore.get('Item');
    const User = dbStore.get('User');

    const page = Number.parseInt(filters.page, 10) || 1;
    const limit = Math.min(Number.parseInt(filters.limit, 10) || 20, 200);
    const source = filters.source ? String(filters.source).toUpperCase() : 'ALL';
    const search = String(filters.search || '').trim();
    const status = filters.status ? String(filters.status).trim() : null;
    const paymentType = filters.payment_type ? String(filters.payment_type).trim() : null;
    const orderMethod = filters.order_method ? String(filters.order_method).trim() : null;
    const sortBy = String(filters.sort_by || 'occurred_at');
    const sortOrder = String(filters.sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const dateRange = buildDateRange(filters.date_from, filters.date_to);

    const canViewPos = includesAnyPermission(userPermissions, ['pos:view', 'pos:transact', 'reports:view']);
    const canViewDispatch = includesAnyPermission(userPermissions, ['do:view', 'reports:view']);

    let records = [];

    if (canViewPos && source !== 'DISPATCH') {
      const posWhere = {};
      if (status) posWhere.status = status;
      if (paymentType) posWhere.payment_type = paymentType;
      if (orderMethod) posWhere.order_method = orderMethod;
      if (dateRange) posWhere.created_at = dateRange;
      if (search) {
        posWhere.invoice_number = { [Op.like]: `%${search}%` };
      }

      const posRows = await PosTransaction.findAll({
        where: posWhere,
        include: [
          {
            model: PosTransactionLine,
            as: 'lines',
            include: [{ model: Item, as: 'item', attributes: ['item_id', 'name'] }]
          },
          {
            model: User,
            as: 'cashier',
            attributes: ['user_id', 'username']
          }
        ],
        order: [['created_at', 'DESC']]
      });
      records = records.concat(mapPosRows(posRows));
    }

    if (canViewDispatch && source !== 'POS') {
      const dispatchWhere = { archived_at: null };
      if (status) dispatchWhere.status = status;
      if (dateRange) dispatchWhere.dispatch_date = dateRange;
      if (search) {
        dispatchWhere[Op.or] = [
          { do_number: { [Op.like]: `%${search}%` } },
          { recipient_name: { [Op.like]: `%${search}%` } }
        ];
      }

      const dispatchRows = await DispatchOrder.findAll({
        where: dispatchWhere,
        include: [
          {
            model: DispatchOrderLine,
            as: 'lines',
            include: [{ model: Item, as: 'item', attributes: ['item_id', 'name'] }]
          }
        ],
        order: [['dispatch_date', 'DESC'], ['created_at', 'DESC']]
      });
      records = records.concat(mapDispatchRows(dispatchRows));
    }

    const sortFactor = sortOrder === 'asc' ? 1 : -1;
    records.sort((a, b) => {
      if (sortBy === 'gross_sales') return (toNum(a.gross_sales) - toNum(b.gross_sales)) * sortFactor;
      if (sortBy === 'cogs') return (toNum(a.cogs) - toNum(b.cogs)) * sortFactor;
      if (sortBy === 'gross_profit') return (toNum(a.gross_profit) - toNum(b.gross_profit)) * sortFactor;
      if (sortBy === 'reference_no') {
        const left = String(a.reference_no || '').localeCompare(String(b.reference_no || ''));
        return left * sortFactor;
      }
      return (new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()) * sortFactor;
    });
    const total = records.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const transactions = records.slice(start, end);

    const summary = records.reduce((acc, row) => {
      acc.gross_sales = round4(acc.gross_sales + toNum(row.gross_sales));
      acc.service_fee_total = round4(acc.service_fee_total + toNum(row.service_fee_amount));
      acc.cogs = round4(acc.cogs + toNum(row.cogs));
      acc.gross_profit = round4(acc.gross_profit + toNum(row.gross_profit));
      return acc;
    }, { gross_sales: 0, service_fee_total: 0, cogs: 0, gross_profit: 0 });

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      summary
    };
  }
};

assertSalesRepositoryContract(salesRepository);
