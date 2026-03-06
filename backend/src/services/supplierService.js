import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import { buildVisibleWhere, notFoundError } from '../utils/softDeletePolicy.js';

const findVisibleSupplierById = async (Supplier, supplierId, queryOptions = {}) => {
  const { where = {}, ...rest } = queryOptions;
  return Supplier.findOne({
    ...rest,
    where: buildVisibleWhere(
      { ...where, supplier_id: supplierId },
      { statusField: 'status', excludeInactiveStatus: true }
    )
  });
};

const findVisibleItemById = async (Item, itemId) => {
  return Item.findOne({
    where: buildVisibleWhere(
      { item_id: itemId },
      { statusField: 'status', excludeInactiveStatus: true }
    )
  });
};

export const getSuppliers = async (queryParams) => {
  const Supplier = dbStore.get('Supplier');
  const SupplierItem = dbStore.get('SupplierItem');
  const BulkDiscount = dbStore.get('BulkDiscount');
  const Item = dbStore.get('Item');

  const {
    page = 1,
    limit = 20,
    search,
    sortBy = 'name',
    sortOrder = 'asc',
    status
  } = queryParams;

  const offset = (page - 1) * limit;
  const where = buildVisibleWhere({}, {
    statusField: 'status',
    excludeInactiveStatus: true
  });

  // Filter by status
  if (status) {
    where.status = status;
  }

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
    order,
    include: [
      {
        model: SupplierItem,
        as: 'supplierItems',
        include: [{
          model: Item,
          as: 'item',
          required: false,
          where: buildVisibleWhere({}, {
            statusField: 'status',
            excludeInactiveStatus: true
          })
        }]
      },
      {
        model: BulkDiscount,
        as: 'bulkDiscounts'
      }
    ],
    distinct: true
  });

  const formattedRows = rows.map(supplier => {
    const formatted = supplier.toJSON();
    formatted.items_supplied = formatted.supplierItems?.map(si => ({
      id: si.item?.item_id,
      item_id: si.item?.item_id,
      item_name: si.item?.name,
      moq: si.moq,
      price_per_unit: si.price_per_unit,
      last_price_update: si.last_price_update
    })) || [];
    formatted.id = formatted.supplier_id;
    formatted.bulk_discounts = formatted.bulkDiscounts || [];
    delete formatted.supplierItems;
    delete formatted.bulkDiscounts;
    return formatted;
  });

  return {
    suppliers: formattedRows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    }
  };
};

export const getSupplierById = async (supplierId) => {
  const Supplier = dbStore.get('Supplier');
  const SupplierItem = dbStore.get('SupplierItem');
  const BulkDiscount = dbStore.get('BulkDiscount');
  const Item = dbStore.get('Item');

  const supplier = await findVisibleSupplierById(Supplier, supplierId, {
    include: [
      {
        model: SupplierItem,
        as: 'supplierItems',
        include: [
          {
            model: Item,
            as: 'item',
            required: false,
            where: buildVisibleWhere({}, {
              statusField: 'status',
              excludeInactiveStatus: true
            })
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
    throw notFoundError('Supplier not found');
  }

  const formatted = supplier.toJSON();
  formatted.items_supplied = formatted.supplierItems?.map(si => ({
    id: si.item?.item_id,
    item_id: si.item?.item_id,
    item_name: si.item?.name,
    moq: si.moq,
    price_per_unit: si.price_per_unit,
    last_price_update: si.last_price_update
  })) || [];
  formatted.id = formatted.supplier_id;

  delete formatted.supplierItems;

  return formatted;
};

export const createSupplier = async (supplierData, userId = null) => {
  const Supplier = dbStore.get('Supplier');
  const SupplierItem = dbStore.get('SupplierItem');
  const BulkDiscount = dbStore.get('BulkDiscount');

  // Extract items_supplied and bulk_discounts before creating supplier
  const { items_supplied, bulk_discounts, ...supplierFields } = supplierData;

  // Add created_by if userId provided
  const dataToCreate = { ...supplierFields };
  if (userId) {
    dataToCreate.created_by = userId;
    dataToCreate.updated_by = userId;
  }

  const supplier = await Supplier.create(dataToCreate);

  // Create supplier items if provided
  if (items_supplied && items_supplied.length > 0) {
    const supplierItems = items_supplied.map(item => ({
      supplier_id: supplier.supplier_id,
      item_id: item.item_id,
      moq: item.moq,
      price_per_unit: item.price_per_unit
    }));
    await SupplierItem.bulkCreate(supplierItems);
  }

  // Create bulk discounts if provided
  if (bulk_discounts && bulk_discounts.length > 0) {
    const discounts = bulk_discounts.map(discount => ({
      supplier_id: supplier.supplier_id,
      min_quantity: discount.min_quantity,
      discount_percent: discount.discount_percent
    }));
    await BulkDiscount.bulkCreate(discounts);
  }

  return supplier;
};

export const updateSupplier = async (supplierId, supplierData, userId = null) => {
  const Supplier = dbStore.get('Supplier');
  const SupplierItem = dbStore.get('SupplierItem');
  const BulkDiscount = dbStore.get('BulkDiscount');

  const supplier = await findVisibleSupplierById(Supplier, supplierId);
  if (!supplier) {
    throw notFoundError('Supplier not found');
  }

  // Extract items_supplied and bulk_discounts before updating supplier
  const { items_supplied, bulk_discounts, ...supplierFields } = supplierData;

  // Add updated_by if userId provided
  const dataToUpdate = { ...supplierFields };
  if (userId) {
    dataToUpdate.updated_by = userId;
  }

  await supplier.update(dataToUpdate);

  // Update supplier items if provided
  if (items_supplied !== undefined) {
    // Delete existing items
    await SupplierItem.destroy({
      where: { supplier_id: supplierId }
    });

    // Create new items
    if (items_supplied.length > 0) {
      const supplierItems = items_supplied.map(item => ({
        supplier_id: supplierId,
        item_id: item.item_id,
        moq: item.moq,
        price_per_unit: item.price_per_unit
      }));
      await SupplierItem.bulkCreate(supplierItems);
    }
  }

  // Update bulk discounts if provided
  if (bulk_discounts !== undefined) {
    // Delete existing discounts
    await BulkDiscount.destroy({
      where: { supplier_id: supplierId }
    });

    // Create new discounts
    if (bulk_discounts.length > 0) {
      const discounts = bulk_discounts.map(discount => ({
        supplier_id: supplierId,
        min_quantity: discount.min_quantity,
        discount_percent: discount.discount_percent
      }));
      await BulkDiscount.bulkCreate(discounts);
    }
  }

  return supplier;
};

export const finalizeSupplier = async (supplierId, userId = null) => {
  const Supplier = dbStore.get('Supplier');

  const supplier = await findVisibleSupplierById(Supplier, supplierId);

  if (!supplier) {
    throw notFoundError('Supplier not found');
  }

  if (supplier.status !== 'draft') {
    const error = new Error('Only draft suppliers can be finalized');
    error.statusCode = 400;
    throw error;
  }

  // Validate required fields for finalization
  if (!supplier.name) {
    const error = new Error('Name is required to finalize supplier');
    error.statusCode = 422;
    throw error;
  }

  // Update status to active
  const updateData = { status: 'active' };
  if (userId) {
    updateData.updated_by = userId;
  }

  await supplier.update(updateData);
  return supplier;
};

export const addSupplierItem = async (supplierId, itemData) => {
  const Supplier = dbStore.get('Supplier');
  const Item = dbStore.get('Item');
  const SupplierItem = dbStore.get('SupplierItem');

  const { item_id, moq, price_per_unit } = itemData;

  // Ensure supplier exists and is not soft-deleted
  const supplier = await findVisibleSupplierById(Supplier, supplierId);
  if (!supplier) {
    throw notFoundError('Supplier not found');
  }

  // Check if item exists
  const item = await findVisibleItemById(Item, item_id);
  if (!item) {
    throw notFoundError('Item not found');
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

export const deleteSupplier = async (supplierId, userId) => {
  const Supplier = dbStore.get('Supplier');
  const PurchaseOrder = dbStore.get('PurchaseOrder');

  const supplier = await findVisibleSupplierById(Supplier, supplierId);
  if (!supplier) {
    throw notFoundError('Supplier not found');
  }

  // Check for ACTIVE purchase orders only (pending, partial, draft)
  // We allow deletion (soft delete) if the supplier only has 'received' (completed) or 'cancelled' POs.
  const activePOs = await PurchaseOrder.count({
    where: {
      supplier_id: supplierId,
      status: {
        [Op.notIn]: ['received', 'cancelled']
      }
    }
  });

  if (activePOs > 0) {
    const error = new Error(`Cannot delete supplier "${supplier.name}"`);
    error.statusCode = 400;
    error.details = [`Supplier has ${activePOs} active purchase order(s) (draft, pending, or partial). Please complete or cancel these orders before deleting the supplier.`];
    throw error;
  }

  // Soft delete with audit trail
  await supplier.update({
    status: 'inactive',
    deleted_by: userId,
    deleted_at: new Date()
  });

  return true;
};
