// ADR 0080 Amendment (Phase 285, #1318): posRepository.listCatalog()'s folder filter
// widens to the item_folder_memberships union, and attaches each returned item's
// secondary_folder_ids so POS's own client-side folder-chip filters
// (posCatalogWorkflow.js, TerminalOperationsWorkspace.jsx) can widen their match too.
// Mirrors posRepository.catalogImages.test.js's mocking convention (jest.spyOn(dbStore,
// 'get') with a catch-all `{}`/`null` fallback for models a given test doesn't exercise).

import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';

const buildBaseModelStubs = () => ({
  PosCatalogOverride: { findAll: jest.fn().mockResolvedValue([]) },
  StorefrontCatalogOverride: { findAll: jest.fn().mockResolvedValue([]) },
  ItemBarcode: { findAll: jest.fn().mockResolvedValue([]) },
  ItemLocationStock: null
});

const FNB_AND_SERVICE_MODELS = [
  'ServiceItemDetail',
  'FnbModifierGroup',
  'FnbModifierOption',
  'FnbFolderModifierGroup',
  'FnbModifierGroupLocationAvailability',
  'FnbModifierOptionLocationAvailability',
  'FnbItemKitchenRoute',
  'FnbKitchenStation'
];

describe('posRepository.listCatalog — ADR 0080 Amendment secondary-category widening', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('widens the folder_id filter to the membership union when secondary members exist', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 5, name: 'Latte', folder_id: 10, status: 'active', category: 'product', product_type: 'finished_goods' }) }
      ])
    };
    const membershipFindAll = jest.fn().mockImplementation(({ where }) => {
      if (where?.folder_id) return Promise.resolve([{ item_id: 5 }, { item_id: 6 }]);
      if (where?.item_id) return Promise.resolve([{ item_id: 5, folder_id: 30 }]);
      return Promise.resolve([]);
    });

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBeUndefined();
    expect(args.where[Op.and]).toEqual([
      { [Op.or]: [
        { folder_id: 20 },
        { item_id: { [Op.in]: [5, 6] } }
      ] }
    ]);
    expect(result[0].secondary_folder_ids).toEqual([30]);
  });

  it('stays primary-only when no secondary members exist for the folder', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([]) };
    const membershipFindAll = jest.fn().mockResolvedValue([]);

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(20);
  });

  it('attaches secondary_folder_ids to every returned item, even without a folder_id filter', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 5, name: 'Latte', folder_id: 10, status: 'active', category: 'product', product_type: 'finished_goods' }) },
        { toJSON: () => ({ item_id: 6, name: 'Mocha', folder_id: 20, status: 'active', category: 'product', product_type: 'finished_goods' }) }
      ])
    };
    const membershipFindAll = jest.fn().mockResolvedValue([
      { item_id: 5, folder_id: 30 },
      { item_id: 5, folder_id: 40 }
    ]);

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result[0].secondary_folder_ids).toEqual([30, 40]);
    expect(result[1].secondary_folder_ids).toEqual([]);
  });

  it('degrades to primary-only, without throwing, when ItemFolderMembership is unavailable on this tenant', async () => {
    const Item = {
      findAll: jest.fn().mockResolvedValue([
        { toJSON: () => ({ item_id: 5, name: 'Latte', folder_id: 10, status: 'active', category: 'product', product_type: 'finished_goods' }) }
      ])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      // Catch-all stub, the same convention already used throughout this test suite for
      // models a given test doesn't care about -- must not be mistaken for "the
      // membership model is available" (it has no .findAll).
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(20);
    expect(result[0].secondary_folder_ids).toEqual([]);
  });
});
