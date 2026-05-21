import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import {
  getSupplierById,
  addSupplierItem,
  deleteSupplier
} from '../src/services/supplierService.js';

describe('supplierService soft-delete policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries supplier detail using visible-record filter and returns 404 when soft-deleted', async () => {
    const Supplier = { findOne: jest.fn().mockResolvedValue(null) };
    const SupplierItem = {};
    const BulkDiscount = {};
    const Item = {};

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Supplier') return Supplier;
      if (name === 'SupplierItem') return SupplierItem;
      if (name === 'BulkDiscount') return BulkDiscount;
      if (name === 'Item') return Item;
      return {};
    });

    await expect(getSupplierById(42)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Supplier not found',
    });

    const args = Supplier.findOne.mock.calls[0][0];
    expect(args.where.supplier_id).toBe(42);
    expect(args.where.deleted_at).toBeNull();
    expect(args.where.status[Op.ne]).toBe('inactive');
  });

  it('returns 404 for addSupplierItem when supplier is soft-deleted', async () => {
    const Supplier = { findOne: jest.fn().mockResolvedValue(null) };
    const Item = { findOne: jest.fn() };
    const SupplierItem = { findOne: jest.fn(), create: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Supplier') return Supplier;
      if (name === 'Item') return Item;
      if (name === 'SupplierItem') return SupplierItem;
      return {};
    });

    await expect(addSupplierItem(999, { item_id: 1, moq: 1, price_per_unit: 10 })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Supplier not found',
    });

    expect(Item.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 for deleteSupplier when supplier is soft-deleted', async () => {
    const Supplier = { findOne: jest.fn().mockResolvedValue(null) };
    const PurchaseOrder = { count: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Supplier') return Supplier;
      if (name === 'PurchaseOrder') return PurchaseOrder;
      return {};
    });

    await expect(deleteSupplier(7, 11)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Supplier not found',
    });
  });
});
