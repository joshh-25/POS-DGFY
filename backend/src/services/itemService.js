import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import Item from '../models/Item.js';
import FIFOBatch from '../models/FIFOBatch.js';
import ItemNutrition from '../models/ItemNutrition.js';
import ItemAllergen from '../models/ItemAllergen.js';
import SupplierItem from '../models/SupplierItem.js';
import Supplier from '../models/Supplier.js';
import StockMovement from '../models/StockMovement.js';
import User from '../models/User.js';

export const getItems = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    category,
    search,
    sortBy = 'name',
    sortOrder = 'asc',
    status
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  // Filter by category
  if (category) {
    where.category = category;
  }

  // Filter by status (active/inactive)
  if (status === 'active') {
    where.is_active = true;
  } else if (status === 'inactive') {
    where.is_active = false;
  }

  // Search filter
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { sku_code: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } }
    ];
  }

  // Sort order
  const order = [[sortBy, sortOrder.toUpperCase()]];

  const { count, rows } = await Item.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order
  });

  return {
    items: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getItemById = async (itemId) => {
  const item = await Item.findByPk(itemId, {
    include: [
      {
        model: ItemNutrition,
        as: 'nutrition',
        required: false
      },
      {
        model: ItemAllergen,
        as: 'allergens',
        required: false
      },
      {
        model: FIFOBatch,
        as: 'fifoBatches',
        required: false,
        where: {
          [Op.and]: [
            sequelize.where(
              sequelize.col('fifo_batches.quantity'),
              Op.gt,
              sequelize.col('fifo_batches.quantity_consumed')
            )
          ]
        },
        order: [['received_date', 'ASC']]
      },
      {
        model: SupplierItem,
        as: 'supplierItems',
        required: false,
        include: [
          {
            model: Supplier,
            as: 'supplier',
            required: false
          }
        ]
      }
    ]
  });

  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Format response
  const formattedItem = item.toJSON();
  
  // Format suppliers
  formattedItem.suppliers = formattedItem.supplierItems?.map(si => ({
    supplier_id: si.supplier.supplier_id,
    name: si.supplier.name,
    moq: si.moq,
    price_per_unit: si.price_per_unit
  })) || [];

  delete formattedItem.supplierItems;

  return formattedItem;
};

export const createItem = async (itemData) => {
  // Check if SKU code already exists
  const existingItem = await Item.findOne({
    where: { sku_code: itemData.sku_code }
  });

  if (existingItem) {
    const error = new Error('Item with this SKU code already exists');
    error.statusCode = 409;
    throw error;
  }

  const item = await Item.create(itemData);
  return item;
};

export const updateItem = async (itemId, itemData) => {
  const item = await Item.findByPk(itemId);

  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Check if SKU code is being changed and if it already exists
  if (itemData.sku_code && itemData.sku_code !== item.sku_code) {
    const existingItem = await Item.findOne({
      where: { sku_code: itemData.sku_code }
    });

    if (existingItem) {
      const error = new Error('Item with this SKU code already exists');
      error.statusCode = 409;
      throw error;
    }
  }

  await item.update(itemData);
  return item;
};

export const deleteItem = async (itemId) => {
  const item = await Item.findByPk(itemId);

  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Soft delete by setting is_active to false
  await item.update({ is_active: false });
  return true;
};

export const getItemStockHistory = async (itemId, queryParams) => {
  const {
    startDate,
    endDate,
    movementType,
    limit = 50
  } = queryParams;

  const where = { item_id: itemId };

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) {
      where.timestamp[Op.gte] = new Date(startDate);
    }
    if (endDate) {
      where.timestamp[Op.lte] = new Date(endDate);
    }
  }

  if (movementType) {
    where.movement_type = movementType;
  }

  const movements = await StockMovement.findAll({
    where,
    limit: parseInt(limit),
    order: [['timestamp', 'DESC']],
    include: [
      {
        model: User,
        as: 'userResponsible',
        required: false,
        attributes: ['username']
      }
    ]
  });

  return movements.map(movement => {
    const m = movement.toJSON();
    return {
      movement_id: m.movement_id,
      item_id: m.item_id,
      movement_type: m.movement_type,
      quantity: m.quantity,
      reference_id: m.reference_id,
      reference_type: m.reference_type,
      user_responsible: m.userResponsible?.username || null,
      timestamp: m.timestamp
    };
  });
};

export const getItemBatches = async (itemId) => {
  const batches = await FIFOBatch.findAll({
    where: {
      item_id: itemId,
      [Op.and]: [
        sequelize.where(
          sequelize.col('quantity'),
          Op.gt,
          sequelize.col('quantity_consumed')
        )
      ]
    },
    order: [['received_date', 'ASC']]
  });

  return batches;
};

export const getItemMovements = async (itemId) => {
  const movements = await StockMovement.findAll({
    where: { item_id: itemId },
    order: [['timestamp', 'DESC']],
    limit: 50
  });

  return movements;
};

