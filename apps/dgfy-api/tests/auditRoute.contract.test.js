import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('tenant audit route contract', () => {
    it('is admin-only without incorrectly requiring a paid plan', () => {
        const source = fs.readFileSync(path.join(testDir, '../src/routes/audit.js'), 'utf8');

        expect(source).toContain('requireTenantAdminRole');
        expect(source).toContain('router.use(authenticate)');
        expect(source).not.toContain('requirePremium');
    });
});
