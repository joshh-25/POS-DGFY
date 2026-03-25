import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { assertPurchaseOrderRepositoryContract } from '../contracts/purchaseOrderRepository.contract.js';

const createHttpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const purchaseOrderRepository = {
  async getPurchaseOrders(queryParams) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const Supplier = dbStore.get('Supplier');
    const User = dbStore.get('User');
    const POLineItem = dbStore.get('POLineItem');

    const {
      page = 1,
      limit = 20,
      status,
      supplier_id,
      startDate,
      endDate,
      archived = 'false'
    } = queryParams;

    const offset = (page - 1) * limit;
    const where = {};

    if (archived === 'true') {
      where.archived_at = { [Op.not]: null };
    } else {
      where.archived_at = null;
    }

    if (status) where.status = status;
    if (supplier_id) where.supplier_id = supplier_id;
    if (startDate || endDate) {
      where.order_date = {};
      if (startDate) where.order_date[Op.gte] = new Date(startDate);
      if (endDate) where.order_date[Op.lte] = new Date(endDate);
    }

    const { count, rows } = await PurchaseOrder.findAndCountAll({
      where,
      include: [
        { model: Supplier, as: 'supplier', attributes: ['name'] },
        { model: User, as: 'creator', attributes: ['username'] },
        { model: POLineItem, as: 'lineItems', attributes: ['line_item_id'] }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['order_date', 'DESC'], ['po_id', 'DESC']]
    });

    const formatted = rows.map((po) => {
      const payload = po.toJSON();
      return {
        po_id: payload.po_id,
        po_number: payload.po_number,
        supplier_id: payload.supplier_id,
        supplier_name: payload.supplier?.name,
        order_date: payload.order_date,
        expected_delivery_date: payload.expected_delivery_date,
        received_date: payload.received_date,
        status: payload.status,
        total_amount: payload.total_amount,
        created_by: payload.creator?.username,
        archived_at: payload.archived_at,
        archived_by: payload.archived_by,
        item_count: payload.lineItems?.length || 0
      };
    });

    return {
      purchase_orders: formatted,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  },

  async getPurchaseOrderById(poId, options = {}) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const Supplier = dbStore.get('Supplier');
    const User = dbStore.get('User');
    const POLineItem = dbStore.get('POLineItem');
    const Item = dbStore.get('Item');

    const po = await PurchaseOrder.findByPk(poId, {
      ...options,
      include: [
        { model: Supplier, as: 'supplier' },
        { model: User, as: 'creator', attributes: ['username'] },
        {
          model: POLineItem,
          as: 'lineItems',
          include: [{ model: Item, as: 'item' }]
        }
      ]
    });

    if (!po) {
      throw createHttpError('Purchase order not found', 404);
    }

    return po;
  },

  async createPurchaseOrder(poData, userId) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const POLineItem = dbStore.get('POLineItem');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
    const transaction = await sequelize.transaction();

    try {
      const { line_items, ...poMainData } = poData;
      const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      let subtotal = 0;
      const sanitizedLineItems = [];

      if (line_items && line_items.length > 0) {
        line_items.forEach((item) => {
          const qty = parseFloat(item.quantity_ordered);
          const price = parseFloat(item.unit_price);
          const total = qty * price;

          subtotal += total;

          sanitizedLineItems.push({
            item_id: item.item_id,
            quantity_ordered: qty,
            unit_price: price,
            total_price: total
          });
        });
      }

      const discount = parseFloat(poData.discount || 0);
      const total_amount = subtotal - discount;

      const po = await PurchaseOrder.create({
        supplier_id: poMainData.supplier_id,
        order_date: poMainData.order_date || new Date(),
        expected_delivery_date: poMainData.expected_delivery_date,
        notes: poMainData.notes,
        po_number: poNumber,
        subtotal,
        discount,
        total_amount,
        created_by: userId,
        status: 'pending'
      }, { transaction });

      let createdLineItems = [];
      if (sanitizedLineItems.length > 0) {
        createdLineItems = await Promise.all(
          sanitizedLineItems.map((item) => POLineItem.create({
            po_id: po.po_id,
            ...item
          }, { transaction }))
        );
      }

      await transaction.commit();
      return { ...po.toJSON(), lineItems: createdLineItems };
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }

      try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const logPath = join(__dirname, '../../../../logs/custom_error.log');
        const timestamp = new Date().toISOString();
        const logMessage = `\n[${timestamp}] Error creating PO:\n${error.stack}\nDetails: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`;
        await fs.appendFile(logPath, logMessage);
      } catch (logError) {
        console.error('Failed to write to custom error log', logError);
      }

      throw error;
    }
  },

  async finalizePurchaseOrder(poId, userId) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const POLineItem = dbStore.get('POLineItem');

    const po = await PurchaseOrder.findByPk(poId, {
      include: [{ model: POLineItem, as: 'lineItems' }]
    });

    if (!po) {
      throw createHttpError('Purchase order not found', 404);
    }

    if (po.status !== 'draft') {
      throw createHttpError('Only draft purchase orders can be finalized', 400);
    }

    if (!po.supplier_id) {
      throw createHttpError('Supplier is required to finalize purchase order', 422);
    }

    if (!po.order_date) {
      throw createHttpError('Order date is required to finalize purchase order', 422);
    }

    if (!po.lineItems || po.lineItems.length === 0) {
      throw createHttpError('At least one line item is required to finalize purchase order', 422);
    }

    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    await po.update({
      status: 'pending',
      po_number: poNumber,
      updated_by: userId
    });

    return po;
  },

  async updatePurchaseOrder(poId, updateData, options = {}) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    return await PurchaseOrder.update(updateData, {
      where: { po_id: poId },
      ...options
    });
  },

  async updatePOLineItem(lineItemId, updateData, options = {}) {
    const POLineItem = dbStore.get('POLineItem');
    return await POLineItem.update(updateData, {
      where: { line_item_id: lineItemId },
      ...options
    });
  },

  async getPOLineItemsByPoId(poId, options = {}) {
    const POLineItem = dbStore.get('POLineItem');
    return await POLineItem.findAll({
      where: { po_id: poId },
      ...options
    });
  },

  async archivePurchaseOrder(poId, userId) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const po = await PurchaseOrder.findByPk(poId);

    if (!po) {
      throw createHttpError('Purchase Order not found', 404);
    }

    if (po.archived_at) {
      throw createHttpError('Purchase Order is already archived', 400);
    }

    await po.update({
      archived_at: new Date(),
      archived_by: userId
    });

    return po;
  },

  async restorePurchaseOrder(poId) {
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const po = await PurchaseOrder.findByPk(poId);

    if (!po) {
      throw createHttpError('Purchase Order not found', 404);
    }

    if (!po.archived_at) {
      throw createHttpError('Purchase Order is not archived', 400);
    }

    await po.update({
      archived_at: null,
      archived_by: null
    });

    return po;
  }
};

assertPurchaseOrderRepositoryContract(purchaseOrderRepository);
