import { Op } from 'sequelize';
import PurchaseOrder from '../models/PurchaseOrder.js';
import POLineItem from '../models/POLineItem.js';
import Supplier from '../models/Supplier.js';
import Item from '../models/Item.js';
import User from '../models/User.js';
import FIFOBatch from '../models/FIFOBatch.js';
import StockMovement from '../models/StockMovement.js';

export const getPurchaseOrders = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    status,
    supplier_id,
    startDate,
    endDate
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

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
      { model: User, as: 'creator', attributes: ['username'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['order_date', 'DESC']]
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
      created_by: p.creator?.username
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
  const { line_items, ...poMainData } = poData;

  // Generate PO number
  const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  // Calculate totals
  let subtotal = 0;
  line_items.forEach(item => {
    item.total_price = item.quantity_ordered * item.unit_price;
    subtotal += item.total_price;
  });

  const discount = poData.discount || 0;
  const total_amount = subtotal - discount;

  const po = await PurchaseOrder.create({
    ...poMainData,
    po_number: poNumber,
    subtotal,
    discount,
    total_amount,
    created_by: userId,
    status: 'pending'
  });

  // Create line items
  const lineItems = await Promise.all(
    line_items.map(item => POLineItem.create({
      po_id: po.po_id,
      ...item
    }))
  );

  return { ...po.toJSON(), lineItems };
};

export const receivePurchaseOrder = async (poId, receiptData, userId) => {
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

    // Update item stock
    const item = lineItem.item;
    await item.update({
      current_stock: parseFloat(item.current_stock) + parseFloat(quantityReceived)
    });

    // Create FIFO batch if enabled
    if (item.fifo_enabled) {
      await FIFOBatch.create({
        item_id: item.item_id,
        quantity: quantityReceived,
        cost_per_unit: lineItem.unit_price,
        received_date: new Date(),
        expiry_date: receiptItem.expiry_date,
        po_number: po.po_number
      });
    }

    // Create stock movement
    await StockMovement.create({
      item_id: item.item_id,
      movement_type: 'purchase_receipt',
      quantity: quantityReceived,
      reference_id: po.po_number,
      reference_type: 'PO',
      user_responsible: userId
    });
  }

  // Update PO status
  const allReceived = po.lineItems.every(li => 
    parseFloat(li.quantity_received) >= parseFloat(li.quantity_ordered)
  );
  
  await po.update({
    status: allReceived ? 'received' : 'partial',
    received_date: new Date()
  });

  return po;
};

