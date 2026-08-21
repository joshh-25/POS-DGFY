import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const itemLocationStockFindAllMock = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => {
            if (name === 'ItemLocationStock') return { findAll: itemLocationStockFindAllMock };
            return null;
        },
        getStore: () => null
    }
}));

const loggerWarnMock = jest.fn();
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        warn: loggerWarnMock,
        info: jest.fn(),
        error: jest.fn()
    }
}));

let isMissingItemLocationStockSchemaError;
let loadItemLocationStockMap;
let applyItemLocationStockMap;

const missingLocationStockTableError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_NO_SUCH_TABLE',
        sqlMessage: "Table 'tenant_db.item_location_stocks' doesn't exist"
    }
});

const missingLocationStockColumnError = () => ({
    name: 'SequelizeDatabaseError',
    original: {
        code: 'ER_BAD_FIELD_ERROR',
        sqlMessage: "Unknown column 'quantity_on_hand' in 'field list'"
    }
});

beforeEach(async () => {
    jest.clearAllMocks();
    ({
        isMissingItemLocationStockSchemaError,
        loadItemLocationStockMap,
        applyItemLocationStockMap
    } = await import('../src/modules/shared/repositories/itemLocationStockOverlay.js'));
});

describe('isMissingItemLocationStockSchemaError', () => {
    it('recognizes a missing item_location_stocks table', () => {
        expect(isMissingItemLocationStockSchemaError(missingLocationStockTableError())).toBe(true);
    });

    it('recognizes a missing quantity_on_hand column', () => {
        expect(isMissingItemLocationStockSchemaError(missingLocationStockColumnError())).toBe(true);
    });

    it('returns false for an unrelated error', () => {
        expect(isMissingItemLocationStockSchemaError({ original: { code: 'ER_DUP_ENTRY' } })).toBe(false);
    });

    it('returns false for a falsy error', () => {
        expect(isMissingItemLocationStockSchemaError(null)).toBe(false);
    });
});

describe('loadItemLocationStockMap', () => {
    it('returns an empty, unresolved map when locationId is not a positive integer', async () => {
        const result = await loadItemLocationStockMap([1, 2], null);
        expect(result.locationScopeResolved).toBe(false);
        expect(result.stockMap.size).toBe(0);
        expect(itemLocationStockFindAllMock).not.toHaveBeenCalled();
    });

    it('returns an empty, resolved map when itemIds is empty (no query needed)', async () => {
        const result = await loadItemLocationStockMap([], 2);
        expect(result.locationScopeResolved).toBe(true);
        expect(result.stockMap.size).toBe(0);
        expect(itemLocationStockFindAllMock).not.toHaveBeenCalled();
    });

    it('queries ItemLocationStock scoped to the location and item ids, returning a resolved map', async () => {
        itemLocationStockFindAllMock.mockResolvedValue([
            { item_id: 10, quantity_on_hand: '5.000000000000' },
            { item_id: 11, quantity_on_hand: '0.000000000000' }
        ]);

        const result = await loadItemLocationStockMap([10, 11, 12], 2);

        expect(itemLocationStockFindAllMock).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ location_id: 2 })
        }));
        expect(result.locationScopeResolved).toBe(true);
        expect(result.stockMap.get(10)).toBe(5);
        expect(result.stockMap.get(11)).toBe(0);
        expect(result.stockMap.has(12)).toBe(false);
    });

    it('falls back to an empty, unresolved map and logs when the schema is missing (honest fallback, no throw)', async () => {
        itemLocationStockFindAllMock.mockRejectedValue(missingLocationStockTableError());

        const result = await loadItemLocationStockMap([10], 2);

        expect(result.locationScopeResolved).toBe(false);
        expect(result.stockMap.size).toBe(0);
        expect(loggerWarnMock).toHaveBeenCalledWith(
            expect.stringContaining('item_location_stocks schema unavailable'),
            expect.objectContaining({ location_id: 2 })
        );
    });

    it('rethrows an unrelated database error rather than silently falling back', async () => {
        itemLocationStockFindAllMock.mockRejectedValue({ original: { code: 'ER_DUP_ENTRY' } });

        await expect(loadItemLocationStockMap([10], 2)).rejects.toBeTruthy();
    });
});

describe('applyItemLocationStockMap', () => {
    it('overlays current_stock from the stock map for a stock-bearing item', () => {
        const stockMap = new Map([[1, 7]]);
        const [result] = applyItemLocationStockMap([{ item_id: 1, current_stock: 999, category: 'goods' }], stockMap);
        expect(result.current_stock).toBe(7);
    });

    it('defaults to 0 when the item has no row in the stock map (honest zero, not the old aggregate)', () => {
        const stockMap = new Map([[1, 7]]);
        const [result] = applyItemLocationStockMap([{ item_id: 2, current_stock: 999, category: 'goods' }], stockMap);
        expect(result.current_stock).toBe(0);
    });

    it('forces current_stock to 0 for service items regardless of the stock map', () => {
        const stockMap = new Map([[1, 7]]);
        const [result] = applyItemLocationStockMap([{ item_id: 1, current_stock: 999, category: 'service' }], stockMap);
        expect(result.current_stock).toBe(0);
    });
});
