import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { REGISTRATION_INDUSTRIES } from '../src/modules/shared/constants/registrationIndustries.js';
import { WORKFLOW_MODE_ENGINE } from '../src/modules/shared/constants/workflowModes.js';

const require = createRequire(import.meta.url);
const migration = require('../migrations/20260812000002-seed-registration-industries.cjs');

// Issue #316 Phase 43: the deploy-time seed that materializes
// REGISTRATION_INDUSTRIES into registration_industries rows, mirroring
// 20260810000002-seed-store-configuration-template-presets.cjs's own test.
describe('seed registration industries migration', () => {
    describe('row builders pin migration output to REGISTRATION_INDUSTRIES', () => {
        const now = new Date('2026-08-12T00:00:00.000Z');

        it('builds a system-owned, visible row for every constant entry with display_order matching order', () => {
            for (const [industryKey, entry] of Object.entries(REGISTRATION_INDUSTRIES)) {
                const row = migration.buildIndustryRow(industryKey, entry, now);
                expect(row).toMatchObject({
                    industry_key: industryKey,
                    label: entry.label,
                    summary: entry.summary,
                    workflow_mode: entry.workflow_mode,
                    template_key: entry.template_key,
                    display_order: entry.order,
                    hidden: false,
                    hidden_reason: null,
                    is_system: true,
                    created_by: 'system_seed',
                    updated_by: 'system_seed'
                });
                expect(JSON.parse(row.niches)).toEqual([...entry.niches]);
            }
        });

        it('gives a null template_key to exactly the industries whose mode is engine-external, matching the constant', () => {
            for (const [industryKey, entry] of Object.entries(REGISTRATION_INDUSTRIES)) {
                const row = migration.buildIndustryRow(industryKey, entry, now);
                const isExternal = WORKFLOW_MODE_ENGINE[entry.workflow_mode] === 'external';
                expect(row.template_key === null).toBe(isExternal);
            }
        });

        it('builds a single "created" seed audit row per industry, attributed to system_seed', () => {
            const entry = REGISTRATION_INDUSTRIES.micro_fnb;
            const row = migration.buildSeedAuditRow('micro_fnb', entry, now);
            expect(row).toMatchObject({
                industry_key: 'micro_fnb',
                action: 'created',
                actor_username: 'system_seed',
                before_snapshot: null
            });
            expect(JSON.parse(row.after_snapshot)).toEqual({
                industry_key: 'micro_fnb',
                workflow_mode: 'fnb',
                template_key: 'fnb_counter_service'
            });
        });

        it('is a pure function of up()/down() exports', () => {
            expect(typeof migration.up).toBe('function');
            expect(typeof migration.down).toBe('function');
        });
    });

    describe('up()/down() against a mocked queryInterface', () => {
        const buildQueryInterface = ({ existingIndustryKeys = [] } = {}) => {
            const insertedIndustries = new Map();

            const queryInterface = {
                showAllTables: jest.fn().mockResolvedValue([
                    'registration_industries',
                    'registration_industry_audit_logs'
                ]),
                bulkInsert: jest.fn(async (tableName, rows) => {
                    if (tableName === 'registration_industries') {
                        for (const row of rows) {
                            insertedIndustries.set(row.industry_key, row);
                        }
                    }
                }),
                sequelize: {
                    query: jest.fn(async (sql, { replacements } = {}) => {
                        if (sql.includes('SELECT industry_key FROM registration_industries WHERE industry_key = ?')) {
                            const [industryKey] = replacements;
                            if (existingIndustryKeys.includes(industryKey)) {
                                return [[{ industry_key: industryKey }]];
                            }
                            return [insertedIndustries.has(industryKey) ? [{ industry_key: industryKey }] : []];
                        }
                        if (sql.startsWith('DELETE FROM')) {
                            return [[]];
                        }
                        return [[]];
                    })
                }
            };
            return queryInterface;
        };

        it('inserts a row and a seed audit row for every constant entry when none exist', async () => {
            const queryInterface = buildQueryInterface();

            await migration.up(queryInterface);

            const industryInsertCalls = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'registration_industries');
            expect(industryInsertCalls).toHaveLength(Object.keys(REGISTRATION_INDUSTRIES).length);

            const auditInsertCalls = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'registration_industry_audit_logs');
            expect(auditInsertCalls).toHaveLength(Object.keys(REGISTRATION_INDUSTRIES).length);
        });

        it('is idempotent - skips an industry_key that already exists, never overwriting an admin edit', async () => {
            const queryInterface = buildQueryInterface({ existingIndustryKeys: ['micro_fnb'] });

            await migration.up(queryInterface);

            const insertedKeys = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'registration_industries')
                .map(([, rows]) => rows[0].industry_key);
            expect(insertedKeys).not.toContain('micro_fnb');
            expect(insertedKeys).toHaveLength(Object.keys(REGISTRATION_INDUSTRIES).length - 1);
        });

        it('up() is a no-op when the registration_industries table does not exist yet', async () => {
            const queryInterface = buildQueryInterface();
            queryInterface.showAllTables.mockResolvedValue([]);

            await migration.up(queryInterface);

            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        });

        it('down() issues delete queries scoped to system-seeded rows only', async () => {
            const queryInterface = buildQueryInterface();
            await migration.up(queryInterface);
            queryInterface.sequelize.query.mockClear();

            await migration.down(queryInterface);

            const deleteQueries = queryInterface.sequelize.query.mock.calls
                .map(([sql]) => sql)
                .filter((sql) => sql.startsWith('DELETE FROM'));
            expect(deleteQueries.some((sql) => sql.includes('registration_industry_audit_logs'))).toBe(true);
            expect(deleteQueries.some((sql) => sql.includes('registration_industries') && sql.includes('is_system = 1'))).toBe(true);
        });
    });
});
