// Phase 257 (#1318). Unit tests for the two new itemRepository functions —
// replace-semantics, the disjointness guard, inactive/soft-deleted folder
// rejection, and cap enforcement (plan section 9). Mirrors
// inventoryItemRepository.test.js's existing `jest.spyOn(dbStore, 'get')`
// convention rather than the heavier unstable_mockModule pattern used
// elsewhere, since itemRepository.js is imported as-is here too.

import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { itemRepository } from '../src/modules/inventory/repositories/itemRepository.js';

describe('itemRepository — secondary category memberships (ADR 0080)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('listItemFolderMemberships returns [] without querying when the model is unavailable on this tenant', async () => {
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      throw new Error(`Model ${name} not found in Tenant Context OR Default Context`);
    });

    await expect(itemRepository.listItemFolderMemberships([1, 2])).resolves.toEqual([]);
  });

  it('listItemFolderMemberships maps rows and returns [] for an empty/invalid id list', async () => {
    const findAll = jest.fn().mockResolvedValue([
      { item_id: 5, folder_id: 20, sort_order: 0 },
      { item_id: 5, folder_id: 30, sort_order: 1 }
    ]);
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'ItemFolderMembership') return { findAll };
      return {};
    });

    const rows = await itemRepository.listItemFolderMemberships([5]);
    expect(rows).toEqual([
      { item_id: 5, folder_id: 20, sort_order: 0 },
      { item_id: 5, folder_id: 30, sort_order: 1 }
    ]);
    expect(await itemRepository.listItemFolderMemberships([])).toEqual([]);
    expect(await itemRepository.listItemFolderMemberships(['not-a-number'])).toEqual([]);
  });

  it('replaceItemFolderMemberships destroys then bulkCreates with sort_order = array index (fnbRepository.js replaceFolderModifierGroups shape)', async () => {
    const destroy = jest.fn().mockResolvedValue(1);
    const bulkCreate = jest.fn().mockResolvedValue([]);
    const membershipFindAll = jest.fn().mockResolvedValue([
      { item_id: 5, folder_id: 20, sort_order: 0 },
      { item_id: 5, folder_id: 30, sort_order: 1 }
    ]);
    const item = { item_id: 5, folder_id: 10 };
    const activeFolders = [{ folder_id: 20 }, { folder_id: 30 }];

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return { findOne: jest.fn().mockResolvedValue(item) };
      if (name === 'ItemFolder') return { findAll: jest.fn().mockResolvedValue(activeFolders) };
      if (name === 'ItemFolderMembership') return { destroy, bulkCreate, findAll: membershipFindAll };
      return {};
    });

    const result = await itemRepository.replaceItemFolderMemberships(5, [20, 30]);

    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ where: { item_id: 5 } }));
    expect(bulkCreate).toHaveBeenCalledWith(
      [
        { item_id: 5, folder_id: 20, sort_order: 0 },
        { item_id: 5, folder_id: 30, sort_order: 1 }
      ],
      expect.anything()
    );
    expect(result).toEqual([
      { item_id: 5, folder_id: 20, sort_order: 0 },
      { item_id: 5, folder_id: 30, sort_order: 1 }
    ]);
  });

  it('drops a requested folder id equal to the item\'s own primary category (disjointness guard, ADR 0080 clause 2)', async () => {
    const destroy = jest.fn().mockResolvedValue(1);
    const bulkCreate = jest.fn().mockResolvedValue([]);
    const item = { item_id: 5, folder_id: 10 };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return { findOne: jest.fn().mockResolvedValue(item) };
      // Only folder 20 is looked up as "active" — folder 10 (the primary) must never reach
      // this query at all, because it was already dropped before the active-folder check.
      if (name === 'ItemFolder') return { findAll: jest.fn().mockResolvedValue([{ folder_id: 20 }]) };
      if (name === 'ItemFolderMembership') return { destroy, bulkCreate, findAll: jest.fn().mockResolvedValue([]) };
      return {};
    });

    await itemRepository.replaceItemFolderMemberships(5, [10, 20]);

    expect(bulkCreate).toHaveBeenCalledWith(
      [{ item_id: 5, folder_id: 20, sort_order: 0 }],
      expect.anything()
    );
  });

  it('rejects an inactive or soft-deleted folder id (ITEM_FOLDER_MEMBERSHIPS_INVALID_FOLDER)', async () => {
    const item = { item_id: 5, folder_id: 10 };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return { findOne: jest.fn().mockResolvedValue(item) };
      // Folder 999 is requested but never comes back from the active-folder lookup.
      if (name === 'ItemFolder') return { findAll: jest.fn().mockResolvedValue([{ folder_id: 20 }]) };
      if (name === 'ItemFolderMembership') return { destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() };
      return {};
    });

    await expect(itemRepository.replaceItemFolderMemberships(5, [20, 999]))
      .rejects.toMatchObject({ code: 'ITEM_FOLDER_MEMBERSHIPS_INVALID_FOLDER', statusCode: 400 });
  });

  it('rejects a folder_ids list exceeding the cap of 10 (ITEM_FOLDER_MEMBERSHIPS_CAP_EXCEEDED)', async () => {
    const item = { item_id: 5, folder_id: 10 };
    const tooMany = Array.from({ length: 11 }, (_, index) => index + 100);

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return { findOne: jest.fn().mockResolvedValue(item) };
      if (name === 'ItemFolder') return { findAll: jest.fn() };
      if (name === 'ItemFolderMembership') return { destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() };
      return {};
    });

    await expect(itemRepository.replaceItemFolderMemberships(5, tooMany))
      .rejects.toMatchObject({ code: 'ITEM_FOLDER_MEMBERSHIPS_CAP_EXCEEDED', statusCode: 400 });
  });

  it('rejects with a not-found error when the item does not exist or is not visible', async () => {
    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'Item') return { findOne: jest.fn().mockResolvedValue(null) };
      if (name === 'ItemFolder') return { findAll: jest.fn() };
      if (name === 'ItemFolderMembership') return { destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() };
      return {};
    });

    await expect(itemRepository.replaceItemFolderMemberships(999, [20]))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
