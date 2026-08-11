import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Tenant } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Security: tenant credential storage surface', () => {
    it('Tenant model must not define db_username/db_password fields', () => {
        const attrs = Tenant.rawAttributes || {};
        expect(attrs.db_username).toBeUndefined();
        expect(attrs.db_password).toBeUndefined();
    });

    it('removal migration must exist and remove both credential columns', () => {
        const migrationPath = path.join(
            __dirname,
            '..',
            '..',
            'dgfy-migration-runner',
            'migrations',
            '20260303000003-remove-tenant-plaintext-db-credentials.cjs'
        );

        expect(fs.existsSync(migrationPath)).toBe(true);

        const content = fs.readFileSync(migrationPath, 'utf8');
        expect(content).toContain("removeColumn('tenants', 'db_username')");
        expect(content).toContain("removeColumn('tenants', 'db_password')");
    });
});
