import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { Sequelize } from 'sequelize';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260812000003-fold-registration-industry-visibility.cjs');

// Issue #316 Phase 43: copies Phase 39's per-row hidden state and audit
// trail into the new registration_industries catalog table. Additive
// only - never drops the Phase 39 tables (that is migration
// 20260812000004, once every consumer has cut over).
describe('fold registration industry visibility migration', () => {
    const buildQueryInterface = ({
        tables = [
            'registration_industry_visibility',
            'registration_industries',
            'registration_industry_visibility_audit_logs',
            'registration_industry_audit_logs'
        ],
        visibilityRows = [],
        auditRows = [],
        existingCatalogAuditCount = 0
    } = {}) => {
        const updateCalls = [];
        const bulkInsertCalls = [];

        const queryInterface = {
            showAllTables: jest.fn().mockResolvedValue(tables),
            bulkInsert: jest.fn(async (tableName, rows) => {
                bulkInsertCalls.push([tableName, rows]);
            }),
            sequelize: {
                query: jest.fn(async (sql, options = {}) => {
                    if (sql.includes('SELECT industry_key, hidden, reason, updated_by FROM registration_industry_visibility')) {
                        return [visibilityRows];
                    }
                    if (sql.startsWith('UPDATE registration_industries')) {
                        updateCalls.push(options.replacements);
                        return [[]];
                    }
                    if (sql.includes('COUNT(*) AS existingCount')) {
                        return [[{ existingCount: existingCatalogAuditCount }]];
                    }
                    if (sql.includes('FROM registration_industry_visibility_audit_logs')) {
                        return [auditRows];
                    }
                    return [[]];
                })
            }
        };
        return { queryInterface, updateCalls, bulkInsertCalls };
    };

    it('is a no-op when the Phase 39 visibility table does not exist', async () => {
        const { queryInterface, updateCalls, bulkInsertCalls } = buildQueryInterface({
            tables: ['registration_industries', 'registration_industry_audit_logs']
        });

        await migration.up(queryInterface);

        expect(updateCalls).toHaveLength(0);
        expect(bulkInsertCalls).toHaveLength(0);
    });

    it('copies hidden/reason/updated_by from every visibility row into the matching catalog row', async () => {
        const { queryInterface, updateCalls } = buildQueryInterface({
            visibilityRows: [
                { industry_key: 'healthcare', hidden: true, reason: 'Not launched yet', updated_by: 'admin1' }
            ]
        });

        await migration.up(queryInterface);

        expect(updateCalls).toEqual([[true, 'Not launched yet', 'admin1', 'healthcare']]);
    });

    // Regression pin for the crash reported in PR #317 (dgfy-local-test-backend-1
    // crash-loop): mysql2 deserializes JSON columns into plain JS objects when
    // read via a raw SELECT, not strings. Handing an object straight to
    // bulkInsert() throws inside Sequelize's SqlString.escape() ("Invalid value
    // {...}") because bulkInsert has no attribute-type metadata to re-encode
    // it. This fixture uses the real, object-shaped return value - not a
    // pre-stringified one - so this test fails against unpatched code.
    it('JSON-encodes object-shaped before_snapshot/after_snapshot before bulkInsert (regression: PR #317 crash-loop)', async () => {
        const { queryInterface, bulkInsertCalls } = buildQueryInterface({
            auditRows: [{
                industry_key: 'ticketing_transport',
                action: 'hidden',
                actor_username: 'skupervisor',
                reason: 'not yet supported',
                before_snapshot: null,
                after_snapshot: { industry_key: 'ticketing_transport', hidden: true, reason: 'not yet supported', updated_by: 'skupervisor' },
                created_at: '2026-08-11T00:00:00.000Z',
                updated_at: '2026-08-11T00:00:00.000Z'
            }]
        });

        await migration.up(queryInterface);

        const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_audit_logs');
        expect(auditInsert[1]).toEqual([{
            industry_key: 'ticketing_transport',
            action: 'hidden',
            actor_username: 'skupervisor',
            reason: 'not yet supported',
            before_snapshot: null,
            after_snapshot: JSON.stringify({ industry_key: 'ticketing_transport', hidden: true, reason: 'not yet supported', updated_by: 'skupervisor' }),
            created_at: '2026-08-11T00:00:00.000Z',
            updated_at: '2026-08-11T00:00:00.000Z'
        }]);
        // Must be a JSON string, not the raw object - that's exactly what the
        // unpatched migration handed to bulkInsert() and crashed on.
        expect(typeof auditInsert[1][0].after_snapshot).toBe('string');
    });

    it('passes an already-string-shaped snapshot through unchanged (no double-encoding)', async () => {
        const { queryInterface, bulkInsertCalls } = buildQueryInterface({
            auditRows: [{
                industry_key: 'healthcare',
                action: 'hidden',
                actor_username: 'admin1',
                reason: 'Not launched yet',
                before_snapshot: null,
                after_snapshot: '{"hidden":true}',
                created_at: '2026-08-11T00:00:00.000Z',
                updated_at: '2026-08-11T00:00:00.000Z'
            }]
        });

        await migration.up(queryInterface);

        const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_audit_logs');
        expect(auditInsert[1][0].after_snapshot).toBe('{"hidden":true}');
    });

    it('keeps a null snapshot as null (not the string "null")', async () => {
        const { queryInterface, bulkInsertCalls } = buildQueryInterface({
            auditRows: [{
                industry_key: 'healthcare',
                action: 'unhidden',
                actor_username: 'admin1',
                reason: 'Ready',
                before_snapshot: { hidden: true },
                after_snapshot: null,
                created_at: '2026-08-11T00:00:00.000Z',
                updated_at: '2026-08-11T00:00:00.000Z'
            }]
        });

        await migration.up(queryInterface);

        const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_audit_logs');
        expect(auditInsert[1][0].before_snapshot).toBe(JSON.stringify({ hidden: true }));
        expect(auditInsert[1][0].after_snapshot).toBeNull();
    });

    it('skips the audit copy when the catalog audit table already has a hidden/unhidden row (idempotency guard)', async () => {
        const { queryInterface, bulkInsertCalls } = buildQueryInterface({
            auditRows: [{ industry_key: 'healthcare', action: 'hidden' }],
            existingCatalogAuditCount: 1
        });

        await migration.up(queryInterface);

        const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_audit_logs');
        expect(auditInsert).toBeUndefined();
    });

    it('down() is a documented no-op - the copy is additive and never drops a source table', async () => {
        const { queryInterface } = buildQueryInterface();
        await expect(migration.down(queryInterface)).resolves.toBeUndefined();
    });

    // Escape harness: runs the migration's exact bulkInsert() payload through
    // the real Sequelize mysql dialect generator (no DB connection opened -
    // this only builds the SQL string) to prove the values it produces don't
    // hit SqlString.escape()'s "Invalid value" throw. This is the same code
    // path that produced the crash-loop reported in PR #317.
    it('produces bulkInsert rows that the real mysql query generator can encode without throwing', async () => {
        const { queryInterface, bulkInsertCalls } = buildQueryInterface({
            auditRows: [
                {
                    industry_key: 'ticketing_transport',
                    action: 'hidden',
                    actor_username: 'skupervisor',
                    reason: 'not yet supported',
                    before_snapshot: null,
                    after_snapshot: { industry_key: 'ticketing_transport', hidden: true, reason: 'not yet supported', updated_by: 'skupervisor' },
                    created_at: '2026-08-11T00:00:00.000Z',
                    updated_at: '2026-08-11T00:00:00.000Z'
                },
                {
                    industry_key: 'healthcare',
                    action: 'unhidden',
                    actor_username: 'admin1',
                    reason: 'Ready',
                    before_snapshot: { hidden: true, reason: 'x' },
                    after_snapshot: null,
                    created_at: '2026-08-11T00:00:00.000Z',
                    updated_at: '2026-08-11T00:00:00.000Z'
                }
            ]
        });

        await migration.up(queryInterface);

        const auditInsert = bulkInsertCalls.find(([tableName]) => tableName === 'registration_industry_audit_logs');

        // No live connection - getQueryInterface().queryGenerator only builds SQL.
        const sequelize = new Sequelize('db', 'user', 'password', { dialect: 'mysql', logging: false });
        const queryGenerator = sequelize.getQueryInterface().queryGenerator;

        expect(() => queryGenerator.bulkInsertQuery('registration_industry_audit_logs', auditInsert[1])).not.toThrow();
    });
});
