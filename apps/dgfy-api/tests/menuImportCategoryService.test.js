import { jest } from '@jest/globals';

// dbStore is mocked so this suite exercises the resolution/permission logic
// without a tenant database — the ItemFolder "model" is a pair of jest.fn()s.
const mockFindAll = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (modelName) => {
            if (modelName !== 'ItemFolder') throw new Error(`Unexpected model requested: ${modelName}`);
            return { findAll: mockFindAll, findOne: mockFindOne, create: mockCreate };
        }
    }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

const { resolveMenuImportCategories } = await import('../src/services/menuImportCategoryService.js');

const row = (name, productFolder) => ({
    rowNumber: 1,
    data: { name, product_folder: productFolder, default_sale_price: '100' }
});

const folder = (folder_id, name) => ({ folder_id, name });

beforeEach(() => {
    jest.clearAllMocks();
    mockFindAll.mockResolvedValue([]);
    mockFindOne.mockResolvedValue(null);
});

describe('resolveMenuImportCategories', () => {
    it('does nothing and touches no model when no row carries a category', async () => {
        const rows = [row('Iced Tea', ''), row('Kape', null)];
        const summary = await resolveMenuImportCategories({ rows, canManageCategories: true });

        expect(summary).toEqual({ created: [], linked: [], skipped: [] });
        expect(mockFindAll).not.toHaveBeenCalled();
        expect(rows[0].data.folder_id).toBeUndefined();
    });

    it('links to an existing category case-insensitively and stamps its canonical name', async () => {
        mockFindAll.mockResolvedValue([folder(7, 'Mains')]);
        const rows = [row('Chicken Adobo', 'MAINS'), row('Beef Caldereta', '  mains  ')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: false });

        expect(summary).toEqual({ created: [], linked: ['Mains'], skipped: [] });
        expect(mockCreate).not.toHaveBeenCalled();
        // Both rows point at the same folder, and product_folder is rewritten to
        // the folder's own casing rather than whatever the menu happened to use.
        expect(rows[0].data).toMatchObject({ folder_id: 7, product_folder: 'Mains' });
        expect(rows[1].data).toMatchObject({ folder_id: 7, product_folder: 'Mains' });
    });

    it('creates a missing category when the importer holds categories:manage', async () => {
        mockFindAll.mockResolvedValue([]);
        mockCreate.mockResolvedValue(folder(21, 'Add-Ons'));
        const rows = [row('Extra Rice', 'Add-Ons')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: true });

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Add-Ons',
            show_in_pos_filter: true,
            is_active: true,
            parent_id: null
        }));
        expect(summary).toEqual({ created: ['Add-Ons'], linked: [], skipped: [] });
        expect(rows[0].data).toMatchObject({ folder_id: 21, product_folder: 'Add-Ons' });
    });

    it('skips creation without failing the import when the importer lacks categories:manage', async () => {
        mockFindAll.mockResolvedValue([folder(7, 'Mains')]);
        const rows = [row('Chicken Adobo', 'Mains'), row('Halo-Halo', 'Desserts')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: false });

        expect(mockCreate).not.toHaveBeenCalled();
        expect(summary).toEqual({ created: [], linked: ['Mains'], skipped: ['Desserts'] });
        // The matched row is linked...
        expect(rows[0].data).toMatchObject({ folder_id: 7, product_folder: 'Mains' });
        // ...while the unmatched one keeps its category text but gets no
        // fabricated folder_id. The item still imports.
        expect(rows[1].data.folder_id).toBeUndefined();
        expect(rows[1].data.product_folder).toBe('Desserts');
    });

    it('re-selects rather than failing when a concurrent import wins the unique-name race', async () => {
        const uniqueError = new Error('duplicate');
        uniqueError.name = 'SequelizeUniqueConstraintError';
        mockFindAll.mockResolvedValue([]);
        mockCreate.mockRejectedValue(uniqueError);
        mockFindOne.mockResolvedValue(folder(33, 'Beverages'));
        const rows = [row('Iced Tea', 'Beverages')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: true });

        expect(summary).toEqual({ created: [], linked: ['Beverages'], skipped: [] });
        expect(rows[0].data).toMatchObject({ folder_id: 33, product_folder: 'Beverages' });
    });

    it('reports the category as skipped when the race re-select also finds nothing', async () => {
        const uniqueError = new Error('duplicate');
        uniqueError.name = 'SequelizeUniqueConstraintError';
        mockFindAll.mockResolvedValue([]);
        mockCreate.mockRejectedValue(uniqueError);
        mockFindOne.mockResolvedValue(null);
        const rows = [row('Iced Tea', 'Beverages')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: true });

        expect(summary.skipped).toEqual(['Beverages']);
        expect(rows[0].data.folder_id).toBeUndefined();
    });

    it('propagates a genuine database failure instead of swallowing it', async () => {
        mockFindAll.mockResolvedValue([]);
        mockCreate.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
        const rows = [row('Iced Tea', 'Beverages')];

        await expect(resolveMenuImportCategories({ rows, canManageCategories: true }))
            .rejects.toThrow('ER_LOCK_WAIT_TIMEOUT');
    });

    it('collapses whitespace so one category is not created twice', async () => {
        mockFindAll.mockResolvedValue([]);
        mockCreate.mockResolvedValue(folder(9, 'Main Course'));
        const rows = [row('A', 'Main  Course'), row('B', 'Main Course')];

        const summary = await resolveMenuImportCategories({ rows, canManageCategories: true });

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(summary.created).toEqual(['Main Course']);
        expect(rows[0].data.folder_id).toBe(9);
        expect(rows[1].data.folder_id).toBe(9);
    });
});
