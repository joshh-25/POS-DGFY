import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateEnv } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function baseEnv(overrides = {}) {
    return {
        RUNTIME_MODE: 'development',
        SOURCE_DB_HOST: 'localhost',
        SOURCE_DB_PORT: '3306',
        SOURCE_DB_USER: 'source_user',
        SOURCE_DB_PASSWORD: 'source_pass',
        SOURCE_DB_NAME: 'legacy_ims',
        TARGET_DB_HOST: 'localhost',
        TARGET_DB_PORT: '3306',
        TARGET_DB_USER: 'target_user',
        TARGET_DB_PASSWORD: 'target_pass',
        TARGET_DB_NAME: 'dgfy_landlord',
        REPORT_DIR: './reports',
        MIGRATION_ACTOR: 'operator@dgfy.ph',
        ...overrides
    };
}

describe('validateEnv', () => {
    test('returns valid:true with a fully populated config for a complete env', () => {
        const result = validateEnv(baseEnv());

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.config).toEqual({
            runtimeMode: 'development',
            sourceDb: {
                host: 'localhost',
                port: 3306,
                user: 'source_user',
                password: 'source_pass',
                name: 'legacy_ims'
            },
            targetDb: {
                host: 'localhost',
                port: 3306,
                user: 'target_user',
                password: 'target_pass',
                name: 'dgfy_landlord'
            },
            metaDb: { name: 'dgfy_migration_meta' },
            reportDir: './reports',
            actor: 'operator@dgfy.ph',
            businessDbNames: [],
            migrationTargetManifestPath: null
        });
    });

    test('missing TARGET_DB_NAME returns valid:false with a TARGET_DB_NAME error', () => {
        const env = baseEnv({ TARGET_DB_NAME: '' });
        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.config).toBeNull();
        expect(result.errors.some((message) => message.includes('TARGET_DB_NAME'))).toBe(true);
    });

    test('TARGET_DB_NAME without the dgfy_ prefix returns valid:false', () => {
        const env = baseEnv({ TARGET_DB_NAME: 'legacy_prod' });
        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('TARGET_DB_NAME'))).toBe(true);
    });

    test('invalid RUNTIME_MODE returns valid:false', () => {
        const env = baseEnv({ RUNTIME_MODE: 'prod' });
        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('RUNTIME_MODE'))).toBe(true);
    });

    test('production RUNTIME_MODE without MIGRATION_ACTOR returns valid:false', () => {
        const env = baseEnv({ RUNTIME_MODE: 'production', MIGRATION_ACTOR: '' });
        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('MIGRATION_ACTOR'))).toBe(true);
    });

    test('reportDir defaults to /reports when REPORT_DIR is not set (D-20: container-safe default)', () => {
        const env = baseEnv();
        delete env.REPORT_DIR;

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.reportDir).toBe('/reports');
    });

    test('reportDir honors an explicit REPORT_DIR override instead of the /reports default', () => {
        const env = baseEnv({ REPORT_DIR: '/custom/mounted/reports' });

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.reportDir).toBe('/custom/mounted/reports');
    });

    test('DGFY_BUSINESS_DB_NAMES unset yields an empty businessDbNames list without errors (Plan 03 D-02)', () => {
        const env = baseEnv();
        delete env.DGFY_BUSINESS_DB_NAMES;

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.businessDbNames).toEqual([]);
    });

    test('DGFY_BUSINESS_DB_NAMES parses a comma-separated list of valid dgfy_business_* names', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha, dgfy_business_beta' });

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.businessDbNames).toEqual(['dgfy_business_alpha', 'dgfy_business_beta']);
    });

    test('DGFY_BUSINESS_DB_NAMES rejects an empty entry in the list', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha,,dgfy_business_beta' });

        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.config).toBeNull();
        expect(result.errors.some((message) => message.includes('DGFY_BUSINESS_DB_NAMES') && message.includes('empty'))).toBe(true);
    });

    test('DGFY_BUSINESS_DB_NAMES rejects a legacy (non dgfy_-prefixed) database name', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'sku_inventory_manager' });

        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('DGFY_BUSINESS_DB_NAMES'))).toBe(true);
    });

    test('DGFY_BUSINESS_DB_NAMES rejects a dgfy_core-style (non-business) database name', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_core' });

        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('DGFY_BUSINESS_DB_NAMES'))).toBe(true);
    });

    test('DGFY_BUSINESS_DB_NAMES rejects a display-name-derived entry', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: "dgfy_business_Joe's Cafe" });

        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('DGFY_BUSINESS_DB_NAMES'))).toBe(true);
    });

    test('DGFY_BUSINESS_DB_NAMES rejects a suffix-less dgfy_business_ entry', () => {
        const env = baseEnv({ DGFY_BUSINESS_DB_NAMES: 'dgfy_business_' });

        const result = validateEnv(env);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('DGFY_BUSINESS_DB_NAMES'))).toBe(true);
    });

    test('TARGET_DB_NAME=dgfy_core behavior is unaffected by DGFY_BUSINESS_DB_NAMES', () => {
        const env = baseEnv({
            TARGET_DB_NAME: 'dgfy_core',
            DGFY_BUSINESS_DB_NAMES: 'dgfy_business_alpha'
        });

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.targetDb.name).toBe('dgfy_core');
        expect(result.config.businessDbNames).toEqual(['dgfy_business_alpha']);
    });

    test('DGFY_MIGRATION_TARGET_MANIFEST unset yields migrationTargetManifestPath:null without error by default (Plan 03 D-01)', () => {
        const env = baseEnv();
        delete env.DGFY_MIGRATION_TARGET_MANIFEST;

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.migrationTargetManifestPath).toBeNull();
    });

    test('DGFY_MIGRATION_TARGET_MANIFEST set is exposed as a trimmed string path without reading the file', () => {
        const env = baseEnv({ DGFY_MIGRATION_TARGET_MANIFEST: '  /config/migration-targets.json  ' });

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
        expect(result.config.migrationTargetManifestPath).toBe('/config/migration-targets.json');
    });

    test('requireMigrationManifest:true rejects a missing DGFY_MIGRATION_TARGET_MANIFEST', () => {
        const env = baseEnv();
        delete env.DGFY_MIGRATION_TARGET_MANIFEST;

        const result = validateEnv(env, { requireMigrationManifest: true });

        expect(result.valid).toBe(false);
        expect(result.config).toBeNull();
        expect(result.errors.some((message) => message.includes('DGFY_MIGRATION_TARGET_MANIFEST'))).toBe(true);
    });

    test('requireMigrationManifest:true succeeds when DGFY_MIGRATION_TARGET_MANIFEST is set', () => {
        const env = baseEnv({ DGFY_MIGRATION_TARGET_MANIFEST: '/config/migration-targets.json' });

        const result = validateEnv(env, { requireMigrationManifest: true });

        expect(result.valid).toBe(true);
        expect(result.config.migrationTargetManifestPath).toBe('/config/migration-targets.json');
    });

    test('requireMigrationManifest defaults to false so schema/status/rollback-plan callers are unaffected', () => {
        const env = baseEnv();
        delete env.DGFY_MIGRATION_TARGET_MANIFEST;

        const result = validateEnv(env);

        expect(result.valid).toBe(true);
    });

    test('env.js source contains no sequelize/mysql2 import', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'config', 'env.js'), 'utf8');
        const withoutComments = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
            .join('\n');
        const matches = withoutComments.match(/from ['"]sequelize['"]|from ['"]mysql2['"]/g) || [];

        expect(matches.length).toBe(0);
    });
});
