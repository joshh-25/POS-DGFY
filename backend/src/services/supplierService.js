import { Op } from 'sequelize';
import Supplier from '../models/Supplier.js';
import SupplierItem from '../models/SupplierItem.js';
import BulkDiscount from '../models/BulkDiscount.js';
import Item from '../models/Item.js';

export const getSuppliers = async (queryParams) => {
  const {
    page = 1,
    limit = 20,
    search,
    sortBy = 'name',
    sortOrder = 'asc'
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = {};

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { contact_person: { [Op.like]: `%${search}%` } }
    ];
  }

  const order = [[sortBy, sortOrder.toUpperCase()]];

  const { count, rows } = await Supplier.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order
  });

  return {
    suppliers: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getSupplierById = async (supplierId) => {
  const supplier = await Supplier.findByPk(supplierId, {
    include: [
      {
        model: SupplierItem,
        as: 'supplierItems',
        include: [
          {
            model: Item,
            as: 'item',
            required: false
          }
        ]
      },
      {
        model: BulkDiscount,
        as: 'bulkDiscounts'
      }
    ]
  });

  if (!supplier) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }

  const formatted = supplier.toJSON();
  formatted.items = formatted.supplierItems?.map(si => ({
    item_id: si.item?.item_id,
    item_name: si.item?.name,
    moq: si.moq,
    price_per_unit: si.price_per_unit,
    last_price_update: si.last_price_update
  })) || [];

  delete formatted.supplierItems;

  return formatted;
};

export const createSupplier = async (supplierData) => {
  const supplier = await Supplier.create(supplierData);
  return supplier;
};

export const updateSupplier = async (supplierId, supplierData) => {
  const supplier = await Supplier.findByPk(supplierId);
  if (!supplier) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }
  await supplier.update(supplierData);
  return supplier;
};

export const addSupplierItem = async (supplierId, itemData) => {
  const { item_id, moq, price_per_unit } = itemData;

  // Check if item exists
  const item = await Item.findByPk(item_id);
  if (!item) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // Check if supplier-item relationship already exists
  const existing = await SupplierItem.findOne({
    where: { supplier_id: supplierId, item_id }
  });

  if (existing) {
    const error = new Error('Item already exists for this supplier');
    error.statusCode = 409;
    throw error;
  }

  const supplierItem = await SupplierItem.create({
    supplier_id: supplierId,
    item_id,
    moq,
    price_per_unit
  });

  return supplierItem;
};

