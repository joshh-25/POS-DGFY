import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import {
  getItemById,
  getItemMovements,
} from '../src/services/itemService.js';

describe('itemService soft-delete policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries item detail with visible-record filter and returns 404 when soft-deleted', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue(null) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      return {};
    });

    await expect(getItemById(123)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Item not found',
    });

    const args = Item.findOne.mock.calls[0][0];
    expect(args.where.item_id).toBe(123);
    expect(args.where.deleted_at).toBeNull();
    expect(args.where.status[Op.ne]).toBe('inactive');
  });

  it('returns 404 for getItemMovements when item is soft-deleted', async () => {
    const Item = { findOne: jest.fn().mockResolvedValue(null) };
    const StockMovement = { findAll: jest.fn() };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'StockMovement') return StockMovement;
      return {};
    });

    await expect(getItemMovements(555)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Item not found',
    });

    expect(StockMovement.findAll).not.toHaveBeenCalled();
  });
});
