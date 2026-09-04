// ADR 0080 Amendment (Phase 286, #1318): posRepository.listCatalog()'s folder filter
// widens to the item_folder_memberships union, and attaches each returned item's
// secondary_folder_ids so POS's own client-side folder-chip filters
// (posCatalogWorkflow.js, TerminalOperationsWorkspace.jsx) can widen their match too.
// Mirrors posRepository.catalogImages.test.js's mocking convention (jest.spyOn(dbStore,
// 'get') with a catch-all `{}`/`null` fallback for models a given test doesn't exercise).
//
// RF-1/RF-2 (PR #1580 review): a first version of this widening resolved memberships by
// folder_id alone (no is_active/deleted_at check on the referenced folder) and had no
// ER_NO_SUCH_TABLE handling around the ItemFolderMembership query. This file's cases below
// pin both fixes: inactive/soft-deleted/mixed folder membership exclusion, and a rejected
// membership lookup degrading to primary-only rather than throwing.

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

const buildItem = (item_id, folder_id) => ({
  toJSON: () => ({ item_id, name: `Item ${item_id}`, folder_id, status: 'active', category: 'product', product_type: 'finished_goods' })
});

describe('posRepository.listCatalog — ADR 0080 Amendment secondary-category widening', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('widens the folder_id filter to the membership union when secondary members exist', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    const membershipFindAll = jest.fn().mockImplementation(({ where }) => {
      if (where?.folder_id) return Promise.resolve([{ item_id: 5 }, { item_id: 6 }]);
      if (where?.item_id) return Promise.resolve([{ item_id: 5, folder_id: 30 }]);
      return Promise.resolve([]);
    });
    const ItemFolder = {
      findOne: jest.fn().mockResolvedValue({ folder_id: 20 }),
      findAll: jest.fn().mockResolvedValue([{ folder_id: 30 }])
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    expect(ItemFolder.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { folder_id: 20, is_active: true, deleted_at: null }
    }));
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
    const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }), findAll: jest.fn().mockResolvedValue([]) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(20);
  });

  it('attaches secondary_folder_ids to every returned item, even without a folder_id filter', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10), buildItem(6, 20)]) };
    const membershipFindAll = jest.fn().mockResolvedValue([
      { item_id: 5, folder_id: 30 },
      { item_id: 5, folder_id: 40 }
    ]);
    const ItemFolder = { findAll: jest.fn().mockResolvedValue([{ folder_id: 30 }, { folder_id: 40 }]) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result[0].secondary_folder_ids).toEqual([30, 40]);
    expect(result[1].secondary_folder_ids).toEqual([]);
  });

  it('degrades to primary-only, without throwing, when ItemFolderMembership is unavailable on this tenant', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
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

  // --- RF-1: inactive / soft-deleted / mixed folder liveness -------------------------------

  it('RF-1: returns zero rows for an inactive requested folder, never a primary-only fallback', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([]) };
    const membershipFindAll = jest.fn();
    // Active-only query for folder_id 20 finds nothing -- folder 20 exists but is inactive.
    const ItemFolder = { findOne: jest.fn().mockResolvedValue(null) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(-1);
    // Never even attempts the membership union query once the folder itself fails the
    // active-only check.
    expect(membershipFindAll).not.toHaveBeenCalled();
  });

  it('RF-1: returns zero rows for a soft-deleted requested folder (same as inactive)', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([]) };
    // Same active-only query shape covers both is_active:false and a non-null deleted_at --
    // this test exists as its own case (not folded into the inactive one) per the review's
    // explicit ask for a distinct soft-deleted case.
    const ItemFolder = { findOne: jest.fn().mockResolvedValue(null) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: jest.fn() };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    expect(ItemFolder.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { folder_id: 20, is_active: true, deleted_at: null }
    }));
    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(-1);
  });

  it('RF-1: drops a secondary membership pointing at an inactive/soft-deleted folder, keeps an active one (mixed case)', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    // Item 5 has two secondary memberships: folder 30 (active) and folder 40 (stale).
    const membershipFindAll = jest.fn().mockResolvedValue([
      { item_id: 5, folder_id: 30 },
      { item_id: 5, folder_id: 40 }
    ]);
    // The active-only ItemFolder query for [30, 40] only returns 30 -- 40 is inactive/deleted.
    const ItemFolder = {
      findAll: jest.fn().mockImplementation(({ where }) => {
        const requested = where?.folder_id?.[Op.in] || [];
        return Promise.resolve(requested.filter((id) => id === 30).map((id) => ({ folder_id: id })));
      })
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: membershipFindAll };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result[0].secondary_folder_ids).toEqual([30]);
  });

  // --- RF-2: a missing item_folder_memberships table (schema drift, not a missing model) --

  it('RF-2: filter widening degrades to primary-only when ItemFolderMembership.findAll rejects with ER_NO_SUCH_TABLE', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    const tableMissingError = Object.assign(new Error("Table 'tenant_x.item_folder_memberships' doesn't exist"), {
      original: { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'tenant_x.item_folder_memberships' doesn't exist" }
    });
    const ItemFolder = { findOne: jest.fn().mockResolvedValue({ folder_id: 20 }) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolder') return ItemFolder;
      if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(tableMissingError) };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10, folder_id: 20 });

    const args = Item.findAll.mock.calls[0][0];
    expect(args.where.folder_id).toBe(20);
    expect(args.where[Op.and]).toBeUndefined();
    expect(result[0].secondary_folder_ids).toEqual([]);
  });

  it('RF-2: attachSecondaryFolderIds degrades to primary-only when ItemFolderMembership.findAll rejects with ER_NO_SUCH_TABLE', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    const tableMissingError = Object.assign(new Error("Table 'tenant_x.item_folder_memberships' doesn't exist"), {
      original: { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'tenant_x.item_folder_memberships' doesn't exist" }
    });

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(tableMissingError) };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    const result = await posRepository.listCatalog({ limit: 10 });

    expect(result[0].secondary_folder_ids).toEqual([]);
  });

  it('RF-2: a rejection unrelated to the missing table still propagates (not silently swallowed)', async () => {
    const Item = { findAll: jest.fn().mockResolvedValue([buildItem(5, 10)]) };
    const unrelatedError = new Error('connection reset');

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return Item;
      if (name === 'ItemFolderMembership') return { findAll: jest.fn().mockRejectedValue(unrelatedError) };
      if (FNB_AND_SERVICE_MODELS.includes(name)) return null;
      return buildBaseModelStubs()[name] ?? {};
    });

    await expect(posRepository.listCatalog({ limit: 10 })).rejects.toThrow('connection reset');
  });
});
