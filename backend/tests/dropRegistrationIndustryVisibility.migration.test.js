import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { Sequelize } from 'sequelize';

const require = createRequire(import.meta.url);
const migration = require('../migrations/20260812000004-drop-registration-industry-visibility.cjs');

// Issue #316 Phase 47: retires the Phase 39 visibility store now that every
// consumer has cut over to registration_industries (folded in migration
// 20260812000003, an earlier commit). up() drops both Phase 39 tables;
// down() recreates them and best-effort repopulates from the catalog - not
// an exact undo, since post-fold hide/unhide history is indistinguishable
// from the original Phase 39 data.
describe('drop registration industry visibility migration', () => {
    // Minimal stand-in for the Sequelize DataTypes namespace that
    // queryInterface.createTable()'s column definitions reference
    // (Sequelize.STRING, .BOOLEAN, .literal, etc.) - down() never actually
    // needs a live connection to build these definitions.
    const SequelizeTypes = {
        STRING: (n) => `STRING(${n})`,
        BOOLEAN: 'BOOLEAN',
        BIGINT: 'BIGINT',
        DATE: 'DATE',
        JSON: 'JSON',
        ENUM: (...values) => `ENUM(${values.join(',')})`,
        literal: (sql) => ({ literal: sql })
    };

    const buildQueryInterface = ({
        existingTables = [
            'registration_industry_visibility',
            'registration_industry_visibility_audit_logs'
        ],
        industryRows = [],
        auditRows = []
    } = {}) => {
        const droppedTables = [];
        const createdTables = [];
        const bulkInsertCalls = [];
        let currentTables = [...existingTables];

        const queryInterface = {
            showAllTables: jest.fn(async () => currentTables),
            dropTable: jest.fn(async (tableName) => {
                droppedTables.push(tableName);
                currentTables = currentTables.filter((t) => t !== tableName);
            }),
            createTable: jest.fn(async (tableName, definition) => {
                createdTables.push([tableName, definition]);
                currentTables = [...currentTables, tableName];
            }),
            showIndex: jest.fn(async () => []),
            addIndex: jest.fn(async () => {}),
            bulkInsert: jest.fn(async (tableName, rows) => {
                bulkInsertCalls.push([tableName, rows]);
            }),
            sequelize: {
                getDialect: jest.fn(() => 'mysql'),
                query: jest.fn(async (sql) => {
                    if (sql.includes('FROM registration_industries')) {
                        return [industryRows];
                    }
                    if (sql.includes('FROM registration_industry_audit_logs')) {
                        return [auditRows];
                    }
                    return [[]];
                })
            }
        };
        return { queryInterface, droppedTables, createdTables, bulkInsertCalls };
    };

    describe('up()', () => {
        it('drops the audit table before the parent table', async () => {
            const { queryInterface, droppedTables } = buildQueryInterface();

            await migration.up(queryInterface);

            expect(droppedTables).toEqual([
                'registration_industry_visibility_audit_logs',
                'registration_industry_visibility'
            ]);
        });

        it('no-ops when neither Phase 39 table exists', async () => {
            const { queryInterface, droppedTables } = buildQueryInterface({ existingTables: [] });

            await migration.up(queryInterface);

            expect(droppedTables).toHaveLength(0);
        });
    });

    describe('down()', () => {
        it('recreates both tables when absent', async () => {
            const { queryInterface, createdTables } = buildQueryInterface({ existingTables: [] });

            await migration.down(queryInterface, SequelizeTypes);

            const createdNames = createdTables.map(([name]) => name);
            expect(createdNames).toEqual(expect.arrayContaining([
                'registration_industry_visibility',
                'registration_industry_visibility_audit_logs'
            ]));
        });

        it('skips creation when the tables already exist', async () => {
            const { queryInterface, createdTables } = buildQueryInterface({
                existingTables: ['registration_industry_visibility', 'registration_industry_visibility_audit_logs']
            });

            await migration.down(queryInterface, SequelizeTypes);

            expect(createdTables).toHaveLength(0);
        });

        it('no-ops the catalog repopulation when registration_industries does not exist', async () => {
            const { queryInterface, bulkInsertCalls } = buildQueryInterface({ existingTables: [] });

            await migration.down(queryInterface, SequelizeTypes);

            expect(bulkInsertCalls).toHaveLength(0);
        });

        // Regression pin, mirror image of the fold migration's fix: mysql2
        // deserializes JSON columns into plain JS objects on a raw SELECT, and
        // queryInterface.bulkInsert() has no attribute-type metadata to
        // re-encode them - handing an object straight through throws inside
        // SqlString.escape(). This fixture uses object-shaped snapshots (what
        // the driver actually returns), so it fails against unpatched code.
        it('JSON-encodes object-shaped before_snapshot/after_snapshot before repopulating the audit table', async () => {
            const { queryInterface, bulkInsertCalls } = buildQueryInterface({
                existingTables: [
                    'registration_industry_visibility',
                    'registration_industry_visibility_audit_logs',
                    'registration_industries',
                    'registration_industry_audit_logs'
                ],
                auditRows: [{
                    industry_key: 'ticketing_transport',
                    action: 'hidden',
                    actor_username: 'skupervisor',
                    reason: 'not yet supported',
                    before_snapshot: null,
                    after_snapshot: { industry_key: 'ticketing_transport', workflow_mode: 'services', template_key: null },
                    created_at: '2026-08-12T00:00:00.000Z',
                    updated_at: '2026-08-12T00:00:00.000Z'
                }]
            });

            await migration.down(queryInterface, SequelizeTypes);

            const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_visibility_audit_logs');
            expect(auditInsert[1][0].after_snapshot).toBe(
                JSON.stringify({ industry_key: 'ticketing_transport', workflow_mode: 'services', template_key: null })
            );
            expect(typeof auditInsert[1][0].after_snapshot).toBe('string');
            expect(auditInsert[1][0].before_snapshot).toBeNull();
        });

        it('produces bulkInsert rows that the real mysql query generator can encode without throwing', async () => {
            const { queryInterface, bulkInsertCalls } = buildQueryInterface({
                existingTables: [
                    'registration_industry_visibility',
                    'registration_industry_visibility_audit_logs',
                    'registration_industries',
                    'registration_industry_audit_logs'
                ],
                auditRows: [{
                    industry_key: 'healthcare',
                    action: 'unhidden',
                    actor_username: 'admin1',
                    reason: 'Ready',
                    before_snapshot: { hidden: true, reason: 'x' },
                    after_snapshot: null,
                    created_at: '2026-08-12T00:00:00.000Z',
                    updated_at: '2026-08-12T00:00:00.000Z'
                }]
            });

            await migration.down(queryInterface, SequelizeTypes);

            const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_visibility_audit_logs');

            // No live connection - getQueryInterface().queryGenerator only builds SQL.
            const sequelize = new Sequelize('db', 'user', 'password', { dialect: 'mysql', logging: false });
            const queryGenerator = sequelize.getQueryInterface().queryGenerator;

            expect(() => queryGenerator.bulkInsertQuery('registration_industry_visibility_audit_logs', auditInsert[1])).not.toThrow();
        });
    });
});
