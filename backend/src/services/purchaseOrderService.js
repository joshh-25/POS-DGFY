import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { createStockMovement } from './stockMovementService.js';

export const getPurchaseOrders = async (queryParams) => {
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

  // Filter archived POs
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

  const formatted = rows.map(po => {
    const p = po.toJSON();
    return {
      po_id: p.po_id,
      po_number: p.po_number,
      supplier_id: p.supplier_id,
      supplier_name: p.supplier?.name,
      order_date: p.order_date,
      expected_delivery_date: p.expected_delivery_date,
      received_date: p.received_date,
      status: p.status,
      total_amount: p.total_amount,
      created_by: p.creator?.username,
      archived_at: p.archived_at,
      archived_by: p.archived_by,
      item_count: p.lineItems?.length || 0
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
};

export const getPurchaseOrderById = async (poId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const Supplier = dbStore.get('Supplier');
  const User = dbStore.get('User');
  const POLineItem = dbStore.get('POLineItem');
  const Item = dbStore.get('Item');

  const po = await PurchaseOrder.findByPk(poId, {
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
    const error = new Error('Purchase order not found');
    error.statusCode = 404;
    throw error;
  }

  return po;
};

export const createPurchaseOrder = async (poData, userId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const POLineItem = dbStore.get('POLineItem');
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();

  try {
    const { line_items, ...poMainData } = poData;

    // Generate PO number - always required (database constraint)
    // Always use PO- prefix for all purchase orders
    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Calculate totals if line_items exist
    let subtotal = 0;
    const sanitizedLineItems = [];

    if (line_items && line_items.length > 0) {
      line_items.forEach(item => {
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
      // updated_by field does not exist in model
      status: 'pending'
    }, { transaction });

    // Create line items if they exist
    let createdLineItems = [];
    if (sanitizedLineItems.length > 0) {
      createdLineItems = await Promise.all(
        sanitizedLineItems.map(item => POLineItem.create({
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

    // Custom debug logging
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const logPath = join(__dirname, '../../logs/custom_error.log');
      const timestamp = new Date().toISOString();
      const logMessage = `\n[${timestamp}] Error creating PO:\n${error.stack}\nDetails: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}\n`;
      await fs.appendFile(logPath, logMessage);
    } catch (logError) {
      console.error('Failed to write to custom error log', logError);
    }

    throw error;
  }
};

export const finalizePurchaseOrder = async (poId, userId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const POLineItem = dbStore.get('POLineItem');

  const po = await PurchaseOrder.findByPk(poId, {
    include: [{ model: POLineItem, as: 'lineItems' }]
  });

  if (!po) {
    const error = new Error('Purchase order not found');
    error.statusCode = 404;
    throw error;
  }

  if (po.status !== 'draft') {
    const error = new Error('Only draft purchase orders can be finalized');
    error.statusCode = 400;
    throw error;
  }

  // Validate required fields
  if (!po.supplier_id) {
    const error = new Error('Supplier is required to finalize purchase order');
    error.statusCode = 422;
    throw error;
  }

  if (!po.order_date) {
    const error = new Error('Order date is required to finalize purchase order');
    error.statusCode = 422;
    throw error;
  }

  if (!po.lineItems || po.lineItems.length === 0) {
    const error = new Error('At least one line item is required to finalize purchase order');
    error.statusCode = 422;
    throw error;
  }

  // Generate PO number
  const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Update status to pending and add PO number
  await po.update({
    status: 'pending',
    po_number: poNumber,
    updated_by: userId
  });

  return po;
};

export const receivePurchaseOrder = async (poId, receiptData, userId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');
  const POLineItem = dbStore.get('POLineItem');
  const Item = dbStore.get('Item');

  const po = await PurchaseOrder.findByPk(poId, {
    include: [{ model: POLineItem, as: 'lineItems', include: [{ model: Item, as: 'item' }] }]
  });

  if (!po) {
    const error = new Error('Purchase order not found');
    error.statusCode = 404;
    throw error;
  }

  const { line_items } = receiptData;

  // Process each line item
  for (const receiptItem of line_items) {
    const lineItem = po.lineItems.find(li => li.line_item_id === receiptItem.line_item_id);
    if (!lineItem) continue;

    const quantityReceived = receiptItem.quantity_received || lineItem.quantity_ordered;

    // Update line item
    await lineItem.update({
      quantity_received: quantityReceived,
      quality_check_status: receiptItem.quality_check_status || 'passed'
    });

    // Update item stock & Create Movement via Service
    const item = lineItem.item;

    await createStockMovement({
      item_id: item.item_id,
      quantity: quantityReceived,
      movement_type: 'purchase_receipt',
      reference_id: po.po_number,
      reference_type: 'PO',
      notes: receiptData.notes || po.notes || null,
      expiry_date: receiptItem.expiry_date || null, // Service handles fallback to shelf life
      cost_per_unit: lineItem.unit_price, // Pass specific PO cost
      po_number: po.po_number // Pass for FIFO batch
    }, userId);

    // Save expiry_date to line item for reference (if it was generated/provided)
    if (receiptItem.expiry_date) {
      await lineItem.update({ expiry_date: receiptItem.expiry_date });
    }
  }

  // Update PO status
  const allReceived = po.lineItems.every(li =>
    parseFloat(li.quantity_received) >= parseFloat(li.quantity_ordered)
  );

  await po.update({
    status: allReceived ? 'received' : 'partial',
    received_date: new Date(),
    received_by: userId,
    notes: receiptData.notes || po.notes,
    delivery_rating: receiptData.delivery_rating || po.delivery_rating
  });

  return po;
};

export const archivePurchaseOrder = async (poId, userId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');

  const po = await PurchaseOrder.findByPk(poId);

  if (!po) {
    const error = new Error('Purchase Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (po.archived_at) {
    const error = new Error('Purchase Order is already archived');
    error.statusCode = 400;
    throw error;
  }

  await po.update({
    archived_at: new Date(),
    archived_by: userId
  });

  return po;
};

export const restorePurchaseOrder = async (poId) => {
  const PurchaseOrder = dbStore.get('PurchaseOrder');

  const po = await PurchaseOrder.findByPk(poId);

  if (!po) {
    const error = new Error('Purchase Order not found');
    error.statusCode = 404;
    throw error;
  }

  if (!po.archived_at) {
    const error = new Error('Purchase Order is not archived');
    error.statusCode = 400;
    throw error;
  }

  await po.update({
    archived_at: null,
    archived_by: null
  });

  return po;
};
