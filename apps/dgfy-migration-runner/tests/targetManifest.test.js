import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
    validateMigrationTargetManifest,
    loadMigrationTargetManifest,
    BUSINESS_DB_NAME_PATTERN
} from '../src/data/targetManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function validEntry(overrides = {}) {
    return {
        legacy_tenant_id: 'tenant-1',
        legacy_tenant_db_name: 'sku_tenant_1',
        target_business_db_name: 'dgfy_business_alpha',
        expected_business_id: 'biz-uuid-1',
        expected_owner_account_id: 'acct-uuid-1',
        ...overrides
    };
}

describe('validateMigrationTargetManifest', () => {
    test('accepts a valid manifest and returns normalized targets', () => {
        const result = validateMigrationTargetManifest([validEntry()]);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.targets).toEqual([validEntry()]);
    });

    test('rejects a non-array payload', () => {
        const result = validateMigrationTargetManifest({ not: 'an array' });

        expect(result.valid).toBe(false);
        expect(result.targets).toBeNull();
        expect(result.errors.some((message) => message.includes('must be a JSON array'))).toBe(true);
    });

    test('rejects an empty manifest (D-01: no implicit/auto-discovered targets)', () => {
        const result = validateMigrationTargetManifest([]);

        expect(result.valid).toBe(false);
        expect(result.targets).toBeNull();
        expect(result.errors.some((message) => message.includes('must not be empty'))).toBe(true);
    });

    test('rejects an entry missing required fields', () => {
        const result = validateMigrationTargetManifest([
            { legacy_tenant_id: 'tenant-1', legacy_tenant_db_name: 'sku_tenant_1' }
        ]);

        expect(result.valid).toBe(false);
        expect(result.targets).toBeNull();
        expect(result.errors.some((message) => message.includes('missing required field'))).toBe(true);
    });

    test('rejects a non-object entry', () => {
        const result = validateMigrationTargetManifest(['not-an-object']);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('must be an object'))).toBe(true);
    });

    test('rejects a duplicate legacy_tenant_id across entries', () => {
        const result = validateMigrationTargetManifest([
            validEntry({ target_business_db_name: 'dgfy_business_alpha' }),
            validEntry({ target_business_db_name: 'dgfy_business_beta' })
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('duplicate legacy_tenant_id'))).toBe(true);
    });

    test('rejects a duplicate legacy_tenant_db_name across entries', () => {
        const result = validateMigrationTargetManifest([
            validEntry({ legacy_tenant_id: 'tenant-1', target_business_db_name: 'dgfy_business_alpha' }),
            validEntry({ legacy_tenant_id: 'tenant-2', target_business_db_name: 'dgfy_business_beta' })
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('duplicate legacy_tenant_db_name'))).toBe(true);
    });

    test('rejects a duplicate target_business_db_name across entries', () => {
        const result = validateMigrationTargetManifest([
            validEntry({ legacy_tenant_id: 'tenant-1', legacy_tenant_db_name: 'sku_tenant_1' }),
            validEntry({ legacy_tenant_id: 'tenant-2', legacy_tenant_db_name: 'sku_tenant_2' })
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('duplicate target_business_db_name'))).toBe(true);
    });

    test('rejects a target_business_db_name that does not match the required pattern', () => {
        const result = validateMigrationTargetManifest([
            validEntry({ target_business_db_name: 'sku_inventory_manager' })
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('does not match required pattern'))).toBe(true);
    });

    test('rejects a target_business_db_name that is dgfy_core (non-business target)', () => {
        const result = validateMigrationTargetManifest([validEntry({ target_business_db_name: 'dgfy_core' })]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('does not match required pattern'))).toBe(true);
    });

    test('rejects a legacy_tenant_db_name that looks like a dgfy_* target', () => {
        const result = validateMigrationTargetManifest([
            validEntry({ legacy_tenant_db_name: 'dgfy_business_alpha' })
        ]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('looks like a DGFY target name'))).toBe(true);
    });

    test('rejects a blank expected_owner_account_id', () => {
        const result = validateMigrationTargetManifest([validEntry({ expected_owner_account_id: '   ' })]);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('missing required field'))).toBe(true);
    });

    test('does not open a DB connection or read the filesystem (source has no sequelize/mysql2/fs-read import at module scope for this function)', () => {
        const source = readFileSync(join(__dirname, '..', 'src', 'data', 'targetManifest.js'), 'utf8');
        const withoutComments = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
            .join('\n');
        const matches = withoutComments.match(/from ['"]sequelize['"]|from ['"]mysql2['"]/g) || [];

        expect(matches.length).toBe(0);
    });
});

describe('loadMigrationTargetManifest', () => {
    let tmpDir;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-manifest-'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('loads and validates a well-formed manifest file', async () => {
        const filePath = path.join(tmpDir, 'targets.json');
        await fs.writeFile(filePath, JSON.stringify([validEntry()]), 'utf8');

        const result = await loadMigrationTargetManifest(filePath);

        expect(result.valid).toBe(true);
        expect(result.targets).toEqual([validEntry()]);
    });

    test('returns a structured error (does not throw) when the file does not exist', async () => {
        const filePath = path.join(tmpDir, 'missing.json');

        const result = await loadMigrationTargetManifest(filePath);

        expect(result.valid).toBe(false);
        expect(result.targets).toBeNull();
        expect(result.errors.some((message) => message.includes('Failed to read migration target manifest'))).toBe(true);
    });

    test('returns a structured error (does not throw) for invalid JSON content', async () => {
        const filePath = path.join(tmpDir, 'invalid.json');
        await fs.writeFile(filePath, '{ not valid json', 'utf8');

        const result = await loadMigrationTargetManifest(filePath);

        expect(result.valid).toBe(false);
        expect(result.targets).toBeNull();
        expect(result.errors.some((message) => message.includes('Failed to parse migration target manifest'))).toBe(true);
    });

    test('returns a structured error for a blank file path', async () => {
        const result = await loadMigrationTargetManifest('   ');

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('file path is required'))).toBe(true);
    });

    test('propagates duplicate/invalid manifest content errors from the loaded file', async () => {
        const filePath = path.join(tmpDir, 'duplicates.json');
        await fs.writeFile(
            filePath,
            JSON.stringify([
                validEntry({ legacy_tenant_id: 'tenant-1' }),
                validEntry({ legacy_tenant_id: 'tenant-1', target_business_db_name: 'dgfy_business_beta' })
            ]),
            'utf8'
        );

        const result = await loadMigrationTargetManifest(filePath);

        expect(result.valid).toBe(false);
        expect(result.errors.some((message) => message.includes('duplicate legacy_tenant_id'))).toBe(true);
    });
});

describe('BUSINESS_DB_NAME_PATTERN', () => {
    test('matches valid dgfy_business_* names and rejects legacy/dgfy_core-style names', () => {
        expect(BUSINESS_DB_NAME_PATTERN.test('dgfy_business_alpha')).toBe(true);
        expect(BUSINESS_DB_NAME_PATTERN.test('dgfy_core')).toBe(false);
        expect(BUSINESS_DB_NAME_PATTERN.test('sku_inventory_manager')).toBe(false);
    });
});
