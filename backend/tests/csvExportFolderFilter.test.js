import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { exportFiltered } from '../src/services/csvExportService.js';

const buildDbStoreGetMock = (itemModel, itemFolderModel) => {
    return jest.spyOn(dbStore, 'get').mockImplementation((name) => {
        if (name === 'Item') return itemModel;
        if (name === 'ItemFolder') return itemFolderModel;
        return {};
    });
};

describe('csvExportService folder filter', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('resolves folder name to folder_id and does not filter by product_folder', async () => {
        const Item = {
            findAll: jest.fn().mockResolvedValue([])
        };
        const ItemFolder = {
            findOne: jest.fn().mockResolvedValue({ folder_id: 77 })
        };

        buildDbStoreGetMock(Item, ItemFolder);

        const result = await exportFiltered({ folder: 'Bakery' });

        expect(result.success).toBe(true);
        expect(ItemFolder.findOne).toHaveBeenCalledWith({
            where: { name: 'Bakery' },
            attributes: ['folder_id']
        });

        const findAllArg = Item.findAll.mock.calls[0][0];
        expect(findAllArg.where.folder_id).toBe(77);
        expect(findAllArg.where.product_folder).toBeUndefined();
    });

    it('returns empty result-set filter when folder does not exist', async () => {
        const Item = {
            findAll: jest.fn().mockResolvedValue([])
        };
        const ItemFolder = {
            findOne: jest.fn().mockResolvedValue(null)
        };

        buildDbStoreGetMock(Item, ItemFolder);

        const result = await exportFiltered({ folder: 'DoesNotExist' });

        expect(result.success).toBe(true);
        const findAllArg = Item.findAll.mock.calls[0][0];
        expect(findAllArg.where.item_id).toBe(-1);
        expect(findAllArg.where.product_folder).toBeUndefined();
    });

    it('returns empty result-set filter when ItemFolder model is unavailable', async () => {
        const Item = {
            findAll: jest.fn().mockResolvedValue([])
        };

        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'Item') return Item;
            if (name === 'ItemFolder') return undefined;
            return {};
        });

        const result = await exportFiltered({ folder: 'Bakery' });

        expect(result.success).toBe(true);
        const findAllArg = Item.findAll.mock.calls[0][0];
        expect(findAllArg.where.item_id).toBe(-1);
        expect(findAllArg.where.product_folder).toBeUndefined();
    });
});
