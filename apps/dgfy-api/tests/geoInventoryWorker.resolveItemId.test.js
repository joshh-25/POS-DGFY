import { jest } from '@jest/globals';

const databaseQueryMock = jest.fn();
const transaction = {
    commit: jest.fn(async () => {}),
    rollback: jest.fn(async () => {})
};
const transactionMock = jest.fn(async () => transaction);

jest.unstable_mockModule('../src/config/database.js', () => ({
    default: { query: databaseQueryMock, transaction: transactionMock }
}));

jest.unstable_mockModule('../src/config/redis.js', () => ({
    getRedisClient: jest.fn(),
    isRedisConnected: jest.fn()
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

let resolveItemId;

const configureQueries = ({ aliasRows = [], itemRows = [], itemInsertResult = [123, 1] } = {}) => {
    databaseQueryMock.mockImplementation(async (sql) => {
        if (sql.includes('SELECT item_id FROM geo_item_aliases')) return aliasRows;
        if (sql.includes('SELECT geo_item_id FROM geo_items')) return itemRows;
        if (sql.includes('INSERT INTO geo_items')) return itemInsertResult;
        if (sql.includes('INSERT INTO geo_item_aliases')) return [456, 1];
        throw new Error('Unexpected query: ' + sql);
    });
};

beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    transactionMock.mockResolvedValue(transaction);
    configureQueries();
    ({ resolveItemId } = await import('../src/workers/geoInventoryWorker.js'));
});

describe('resolveItemId', () => {
    it('uses the mysql insert id to create a pending alias and commit', async () => {
        const itemId = await resolveItemId('New Rice', 'tenant-1');

        expect(itemId).toBe(123);
        const aliasInsert = databaseQueryMock.mock.calls.find(([sql]) => sql.includes('INSERT INTO geo_item_aliases'));
        expect(aliasInsert[1].replacements.itemId).toBe(123);
        expect(aliasInsert[0]).toContain("'pending'");
        expect(transaction.commit).toHaveBeenCalledTimes(1);
        expect(transaction.rollback).not.toHaveBeenCalled();
    });

    it.each([
        ['zero id', [0, 0]],
        ['missing id', [undefined]]
    ])('rejects a %s and rolls back before inserting an alias', async (_label, insertResult) => {
        configureQueries({ itemInsertResult: insertResult });

        await expect(resolveItemId('New Rice', 'tenant-1')).rejects.toThrow('geo_items insert returned no id');

        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(databaseQueryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO geo_item_aliases'))).toBe(false);
    });

    it('returns an approved alias without opening a transaction', async () => {
        configureQueries({ aliasRows: [{ item_id: 77 }] });

        await expect(resolveItemId('Rice', 'tenant-1')).resolves.toBe(77);

        expect(transactionMock).not.toHaveBeenCalled();
        expect(databaseQueryMock).toHaveBeenCalledTimes(1);
    });

    it('returns a canonical item without opening a transaction', async () => {
        configureQueries({ itemRows: [{ geo_item_id: 88 }] });

        await expect(resolveItemId('Rice', 'tenant-1')).resolves.toBe(88);

        expect(transactionMock).not.toHaveBeenCalled();
        expect(databaseQueryMock).toHaveBeenCalledTimes(2);
    });

    it('shares one in-flight canonical create for concurrent misses', async () => {
        let releaseInsert;
        let signalInsertStarted;
        const insertStarted = new Promise((resolve) => { signalInsertStarted = resolve; });
        const deferredInsert = new Promise((resolve) => { releaseInsert = resolve; });
        let geoItemInsertCount = 0;

        databaseQueryMock.mockImplementation(async (sql) => {
            if (sql.includes('SELECT item_id FROM geo_item_aliases')) return [];
            if (sql.includes('SELECT geo_item_id FROM geo_items')) return [];
            if (sql.includes('INSERT INTO geo_items')) {
                geoItemInsertCount++;
                signalInsertStarted();
                return deferredInsert;
            }
            if (sql.includes('INSERT INTO geo_item_aliases')) return [456, 1];
            throw new Error('Unexpected query: ' + sql);
        });

        const first = resolveItemId('Rice', 'tenant-1');
        const second = resolveItemId('Rice', 'tenant-1');
        await insertStarted;
        releaseInsert([123, 1]);

        await expect(Promise.all([first, second])).resolves.toEqual([123, 123]);
        expect(geoItemInsertCount).toBe(1);
    });
});
