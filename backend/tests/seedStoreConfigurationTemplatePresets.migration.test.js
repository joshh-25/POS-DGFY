import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';
import { STORE_TEMPLATE_PRESETS } from '../src/modules/shared/constants/capabilityModules.js';

const require = createRequire(import.meta.url);
const migration = require('../migrations/20260810000002-seed-store-configuration-template-presets.cjs');

// Issue #178 Phase 20: this is the deploy-time seed the Phase 13-19 arc
// depended on but never had - seedCanonicalTemplatePresetsUseCase had zero
// production call sites, so no environment ever had a queryable template
// row until this migration.
describe('seed store configuration template presets migration', () => {
    describe('row builders pin migration output to STORE_TEMPLATE_PRESETS', () => {
        const now = new Date('2026-08-10T00:00:00.000Z');

        it('builds a published, platform-owned row for every preset with is_canonical matching the constant', () => {
            for (const [templateKey, preset] of Object.entries(STORE_TEMPLATE_PRESETS)) {
                const row = migration.buildTemplateRow(templateKey, preset, now);
                expect(row).toMatchObject({
                    template_key: templateKey,
                    label: preset.label,
                    version: 1,
                    status: 'published',
                    base_mode: preset.base_mode,
                    is_preset: true,
                    is_canonical: preset.canonical === true,
                    visibility: 'visible',
                    owner: 'platform'
                });
            }
        });

        it('builds one enabled module row per preset module, matching the preset module list exactly', () => {
            for (const preset of Object.values(STORE_TEMPLATE_PRESETS)) {
                const rows = migration.buildModuleRows(42, preset, now);
                expect(rows.every((row) => row.template_id === 42 && row.enabled === true)).toBe(true);
                expect(rows.map((row) => row.module_key).sort()).toEqual([...preset.modules].sort());
            }
        });

        it('reproduces exactly one canonical preset per base_mode', () => {
            const canonicalByMode = {};
            for (const preset of Object.values(STORE_TEMPLATE_PRESETS)) {
                if (preset.canonical !== true) continue;
                canonicalByMode[preset.base_mode] = (canonicalByMode[preset.base_mode] || 0) + 1;
            }
            expect(Object.values(canonicalByMode).every((count) => count === 1)).toBe(true);
        });

        it('builds a draft_created + published audit log pair per template', () => {
            const preset = STORE_TEMPLATE_PRESETS.fnb_counter_service;
            const rows = migration.buildAuditLogRows(7, 'fnb_counter_service', preset, now);
            expect(rows.map((row) => row.action)).toEqual(['draft_created', 'published']);
            expect(rows.every((row) => row.template_id === 7 && row.actor_username === 'system_seed')).toBe(true);
        });
    });

    describe('up()/down() against a mocked queryInterface', () => {
        const buildQueryInterface = ({ existingTemplateKeys = [] } = {}) => {
            const insertedTemplates = new Map();
            let nextTemplateId = 1;

            const queryInterface = {
                showAllTables: jest.fn().mockResolvedValue([
                    'store_configuration_templates',
                    'store_configuration_template_modules',
                    'store_configuration_template_audit_logs'
                ]),
                bulkInsert: jest.fn(async (tableName, rows) => {
                    if (tableName === 'store_configuration_templates') {
                        for (const row of rows) {
                            const templateId = nextTemplateId++;
                            insertedTemplates.set(row.template_key, { template_id: templateId, ...row });
                        }
                    }
                }),
                bulkDelete: jest.fn().mockResolvedValue(undefined),
                sequelize: {
                    query: jest.fn(async (sql, { replacements } = {}) => {
                        if (sql.includes('WHERE template_key = ?')) {
                            const [templateKey] = replacements;
                            if (existingTemplateKeys.includes(templateKey)) {
                                return [[{ template_id: -1 }]];
                            }
                            const found = insertedTemplates.get(templateKey);
                            return [found ? [{ template_id: found.template_id }] : []];
                        }
                        if (sql.includes('template_key IN')) {
                            const keys = replacements.slice(0, -1);
                            const rows = keys
                                .filter((key) => insertedTemplates.has(key))
                                .map((key) => ({ template_id: insertedTemplates.get(key).template_id }));
                            return [rows];
                        }
                        return [[]];
                    })
                }
            };
            return queryInterface;
        };

        it('inserts a template, its modules, and its audit logs for every preset when none exist', async () => {
            const queryInterface = buildQueryInterface();

            await migration.up(queryInterface);

            const templateInsertCalls = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'store_configuration_templates');
            expect(templateInsertCalls).toHaveLength(Object.keys(STORE_TEMPLATE_PRESETS).length);

            const moduleInsertCalls = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'store_configuration_template_modules');
            expect(moduleInsertCalls).toHaveLength(Object.keys(STORE_TEMPLATE_PRESETS).length);

            const auditInsertCalls = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'store_configuration_template_audit_logs');
            expect(auditInsertCalls).toHaveLength(Object.keys(STORE_TEMPLATE_PRESETS).length);
        });

        it('is idempotent - skips a template_key that already exists', async () => {
            const queryInterface = buildQueryInterface({ existingTemplateKeys: ['fnb_full_service'] });

            await migration.up(queryInterface);

            const insertedKeys = queryInterface.bulkInsert.mock.calls
                .filter(([tableName]) => tableName === 'store_configuration_templates')
                .map(([, rows]) => rows[0].template_key);
            expect(insertedKeys).not.toContain('fnb_full_service');
            expect(insertedKeys).toHaveLength(Object.keys(STORE_TEMPLATE_PRESETS).length - 1);
        });

        it('down() deletes audit logs and modules before templates, in FK-safe order', async () => {
            const queryInterface = buildQueryInterface();
            await migration.up(queryInterface);
            queryInterface.bulkDelete.mockClear();

            await migration.down(queryInterface);

            const deleteOrder = queryInterface.bulkDelete.mock.calls.map(([tableName]) => tableName);
            expect(deleteOrder).toEqual([
                'store_configuration_template_audit_logs',
                'store_configuration_template_modules',
                'store_configuration_templates'
            ]);
        });

        it('up() is a no-op when the templates table does not exist yet', async () => {
            const queryInterface = buildQueryInterface();
            queryInterface.showAllTables.mockResolvedValue([]);

            await migration.up(queryInterface);

            expect(queryInterface.bulkInsert).not.toHaveBeenCalled();
        });
    });
});
