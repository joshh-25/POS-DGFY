import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260815000001-normalize-registration-industry-niches.cjs');

describe('normalize registration industry niches migration', () => {
    it('parses only JSON array text', () => {
        expect(migration.parseArrayString('["Retail", "Grocery"]')).toEqual(['Retail', 'Grocery']);
        expect(migration.parseArrayString('{"niche":"Retail"}')).toBeNull();
        expect(migration.parseArrayString('not-json')).toBeNull();
    });

    it('repairs only scalar-string rows and leaves valid arrays untouched', async () => {
        const updates = [];
        const queryInterface = {
            showAllTables: jest.fn().mockResolvedValue(['registration_industries']),
            sequelize: {
                query: jest.fn(async (sql, { replacements } = {}) => {
                    if (sql.startsWith('SELECT industry_key')) {
                        return [[
                            { industry_key: 'retail', niches: '["Retail"]', niches_type: 'STRING' },
                            { industry_key: 'fnb', niches: '["Restaurant"]', niches_type: 'ARRAY' },
                            { industry_key: 'broken', niches: 'not-json', niches_type: 'STRING' }
                        ]];
                    }
                    if (sql.startsWith('UPDATE registration_industries')) {
                        updates.push({ sql, replacements });
                    }
                    return [[]];
                })
            }
        };

        await migration.up(queryInterface);

        expect(updates).toHaveLength(1);
        expect(updates[0].replacements).toEqual(['["Retail"]', 'retail']);
    });

    it('does nothing when the catalog table is not present', async () => {
        const query = jest.fn();
        await migration.up({
            showAllTables: jest.fn().mockResolvedValue([]),
            sequelize: { query }
        });
        expect(query).not.toHaveBeenCalled();
    });
});
