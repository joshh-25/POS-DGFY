import { jest } from '@jest/globals';
import {
    COMMAND_EXECUTIONS_TABLE,
    SCHEMA_MIGRATIONS_TABLE,
    ensureMetadataSchema,
    recordCommandStart,
    recordCommandComplete
} from '../src/metadata/bootstrap.js';
import { MetaSequelizeStorage } from '../src/metadata/storage.js';
import { MetadataSchemaError } from '../src/utils/errors.js';

const EXPECTED_COMMAND_EXECUTIONS_COLUMNS = [
    'id', 'command', 'mode', 'args_json', 'actor', 'runtime_mode', 'migration_file', 'checksum',
    'started_at', 'completed_at', 'exit_status', 'report_json_path', 'report_summary_path',
    'error_message', 'created_at', 'updated_at'
];
// Plan 03 (D-21/T-02-03-02): target_database joins the composite key so the
// same migration filename can be tracked independently per dgfy_core /
// dgfy_business_* target.
const EXPECTED_SCHEMA_MIGRATIONS_COLUMNS = ['name', 'target_database', 'checksum', 'executed_at'];

function describeTableFixture(columnNames) {
    return columnNames.reduce((acc, name) => {
        acc[name] = { type: 'VARCHAR(255)' };
        return acc;
    }, {});
}

function buildMetaSequelize({ showAllTables, createTable, describeTable, addColumn, bulkInsert, bulkUpdate, query }) {
    return {
        config: { host: 'localhost', port: 3306, username: 'target_user', password: 'target_pass' },
        getQueryInterface: () => ({
            showAllTables,
            createTable,
            describeTable,
            addColumn,
            bulkInsert,
            bulkUpdate
        }),
        query,
        // recordCommandStart wraps its insert + LAST_INSERT_ID() lookup in a
        // transaction (WR-01) to guarantee same-connection affinity — mimic
        // Sequelize's real transaction() by just invoking the callback.
        transaction: jest.fn((callback) => callback('fake-transaction'))
    };
}

describe('ensureMetadataSchema', () => {
    test('first run (showAllTables returns []) calls createTable for both command_executions and schema_migrations', async () => {
        const createTable = jest.fn().mockResolvedValue();
        const metaSequelize = buildMetaSequelize({
            showAllTables: jest.fn().mockResolvedValue([]),
            createTable,
            describeTable: jest.fn(),
            addColumn: jest.fn(),
            bulkInsert: jest.fn(),
            bulkUpdate: jest.fn(),
            query: jest.fn()
        });

        await ensureMetadataSchema(metaSequelize);

        expect(createTable).toHaveBeenCalledTimes(2);
        expect(createTable).toHaveBeenCalledWith(COMMAND_EXECUTIONS_TABLE, expect.any(Object));
        expect(createTable).toHaveBeenCalledWith(SCHEMA_MIGRATIONS_TABLE, expect.any(Object));
    });

    test('is an idempotent no-op when both tables exist with every expected column', async () => {
        const createTable = jest.fn();
        const describeTable = jest.fn((tableName) => Promise.resolve(
            tableName === COMMAND_EXECUTIONS_TABLE
                ? describeTableFixture(EXPECTED_COMMAND_EXECUTIONS_COLUMNS)
                : describeTableFixture(EXPECTED_SCHEMA_MIGRATIONS_COLUMNS)
        ));
        const metaSequelize = buildMetaSequelize({
            showAllTables: jest.fn().mockResolvedValue([COMMAND_EXECUTIONS_TABLE, SCHEMA_MIGRATIONS_TABLE]),
            createTable,
            describeTable,
            addColumn: jest.fn(),
            bulkInsert: jest.fn(),
            bulkUpdate: jest.fn(),
            query: jest.fn()
        });

        await expect(ensureMetadataSchema(metaSequelize)).resolves.toBeUndefined();
        expect(createTable).not.toHaveBeenCalled();
    });

    test('rejects with MetadataSchemaError (never a silent addColumn) when command_executions is missing the actor column', async () => {
        const createTable = jest.fn();
        const addColumn = jest.fn();
        const columnsMissingActor = EXPECTED_COMMAND_EXECUTIONS_COLUMNS.filter((name) => name !== 'actor');
        const describeTable = jest.fn((tableName) => Promise.resolve(
            tableName === COMMAND_EXECUTIONS_TABLE
                ? describeTableFixture(columnsMissingActor)
                : describeTableFixture(EXPECTED_SCHEMA_MIGRATIONS_COLUMNS)
        ));
        const metaSequelize = buildMetaSequelize({
            showAllTables: jest.fn().mockResolvedValue([COMMAND_EXECUTIONS_TABLE, SCHEMA_MIGRATIONS_TABLE]),
            createTable,
            describeTable,
            addColumn,
            bulkInsert: jest.fn(),
            bulkUpdate: jest.fn(),
            query: jest.fn()
        });

        await expect(ensureMetadataSchema(metaSequelize)).rejects.toThrow(MetadataSchemaError);
        expect(addColumn).not.toHaveBeenCalled();
        expect(createTable).not.toHaveBeenCalled();
    });
});

describe('recordCommandStart', () => {
    test('calls bulkInsert with exit_status "running" and a started_at Date instance, and returns a numeric id', async () => {
        const bulkInsert = jest.fn().mockResolvedValue();
        const query = jest.fn().mockResolvedValue([[{ id: 42 }], []]);
        const metaSequelize = buildMetaSequelize({
            showAllTables: jest.fn(),
            createTable: jest.fn(),
            describeTable: jest.fn(),
            addColumn: jest.fn(),
            bulkInsert,
            bulkUpdate: jest.fn(),
            query
        });

        const id = await recordCommandStart(metaSequelize, {
            command: 'schema:migrate',
            mode: 'apply',
            argsJson: '{}',
            actor: 'operator@dgfy.ph',
            runtimeMode: 'production',
            migrationFile: null,
            checksum: null
        });

        expect(bulkInsert).toHaveBeenCalledTimes(1);
        const [tableName, rows] = bulkInsert.mock.calls[0];
        expect(tableName).toBe(COMMAND_EXECUTIONS_TABLE);
        expect(rows).toHaveLength(1);
        expect(rows[0].exit_status).toBe('running');
        expect(rows[0].started_at).toBeInstanceOf(Date);
        expect(typeof id).toBe('number');
        expect(id).toBe(42);
    });
});

describe('recordCommandComplete', () => {
    test('calls bulkUpdate with the given exitStatus and a non-null completed_at', async () => {
        const bulkUpdate = jest.fn().mockResolvedValue();
        const metaSequelize = buildMetaSequelize({
            showAllTables: jest.fn(),
            createTable: jest.fn(),
            describeTable: jest.fn(),
            addColumn: jest.fn(),
            bulkInsert: jest.fn(),
            bulkUpdate,
            query: jest.fn()
        });

        await recordCommandComplete(metaSequelize, 42, {
            exitStatus: 'success',
            reportJsonPath: '/reports/x.json',
            reportSummaryPath: '/reports/x.summary.txt',
            errorMessage: null
        });

        expect(bulkUpdate).toHaveBeenCalledTimes(1);
        const [tableName, values, where] = bulkUpdate.mock.calls[0];
        expect(tableName).toBe(COMMAND_EXECUTIONS_TABLE);
        expect(values.exit_status).toBe('success');
        expect(values.completed_at).toBeInstanceOf(Date);
        expect(where).toEqual({ id: 42 });
    });
});

describe('MetaSequelizeStorage — target-scoped metadata (Plan 03 D-21/T-02-03-02)', () => {
    function buildFakeMetaSequelize({ rows }) {
        // Simulates dgfy_migration_meta.schema_migrations as an in-memory list
        // of { name, target_database, executed_at } rows so bulkInsert/
        // bulkDelete/query can be asserted against target-scoped behavior
        // without a real MySQL connection.
        const bulkInsert = jest.fn(async (_table, records) => {
            rows.push(...records);
        });
        const bulkDelete = jest.fn(async (_table, where) => {
            for (let i = rows.length - 1; i >= 0; i -= 1) {
                if (rows[i].name === where.name && rows[i].target_database === where.target_database) {
                    rows.splice(i, 1);
                }
            }
        });
        const query = jest.fn(async (_sql, options) => {
            const targetDatabase = options?.replacements?.[0];
            const matched = rows
                .filter((row) => row.target_database === targetDatabase)
                .sort((a, b) => a.executed_at - b.executed_at);
            return [matched, []];
        });
        return {
            getQueryInterface: () => ({ bulkInsert, bulkDelete }),
            query
        };
    }

    test('the same migration name is recorded independently for dgfy_core and multiple dgfy_business_* targets', async () => {
        const rows = [];
        const metaSequelize = buildFakeMetaSequelize({ rows });

        const coreStorage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_core' });
        const alphaStorage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_business_alpha' });
        const betaStorage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_business_beta' });

        await coreStorage.logMigration({ name: '20260710021000-create-dgfy-business-foundation.cjs' });
        await alphaStorage.logMigration({ name: '20260710021000-create-dgfy-business-foundation.cjs' });

        expect(rows).toHaveLength(2);
        expect(await coreStorage.executed()).toEqual(['20260710021000-create-dgfy-business-foundation.cjs']);
        expect(await alphaStorage.executed()).toEqual(['20260710021000-create-dgfy-business-foundation.cjs']);
        // beta never had this migration logged — its own pending/executed state
        // must not be satisfied by alpha's or core's record of the same name.
        expect(await betaStorage.executed()).toEqual([]);
    });

    test("one business database's executed migrations never appear in another business database's pending/executed state", async () => {
        const rows = [];
        const metaSequelize = buildFakeMetaSequelize({ rows });
        const alphaStorage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_business_alpha' });
        const betaStorage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_business_beta' });

        await alphaStorage.logMigration({ name: 'shared-additive-migration.cjs' });

        expect(await alphaStorage.executed()).toEqual(['shared-additive-migration.cjs']);
        expect(await betaStorage.executed()).toEqual([]);

        await betaStorage.logMigration({ name: 'shared-additive-migration.cjs' });
        expect(await betaStorage.executed()).toEqual(['shared-additive-migration.cjs']);

        // unlogMigration on one target must not remove the other target's record.
        await alphaStorage.unlogMigration({ name: 'shared-additive-migration.cjs' });
        expect(await alphaStorage.executed()).toEqual([]);
        expect(await betaStorage.executed()).toEqual(['shared-additive-migration.cjs']);
    });

    test('logMigration writes target_database on every inserted row', async () => {
        const bulkInsert = jest.fn().mockResolvedValue();
        const metaSequelize = { getQueryInterface: () => ({ bulkInsert }), query: jest.fn() };
        const storage = new MetaSequelizeStorage({ sequelize: metaSequelize, targetDatabase: 'dgfy_business_gamma' });

        await storage.logMigration({ name: 'x.cjs' });

        const [, rows] = bulkInsert.mock.calls[0];
        expect(rows[0].target_database).toBe('dgfy_business_gamma');
    });
});
