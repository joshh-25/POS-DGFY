import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Trimmed (#1441): kept only the "migrations must not import app code" negative -- the one
// assertion here that isn't a literal-text pin duplicating the migration's own source.
describe('POS shift location remediation migration safety', () => {
    it('does not import application code from the migration file', () => {
        const migrationPath = path.join(
            __dirname,
            '..',
            '..',
            'dgfy-migration-runner',
            'migrations',
            '20260421000002-remediate-pos-shift-location-backfill.cjs'
        );

        expect(fs.existsSync(migrationPath)).toBe(true);
        const content = fs.readFileSync(migrationPath, 'utf8');

        expect(content).not.toContain("import('../src/modules/pos/utils/shiftLocationResolution.js')");
    });
});
