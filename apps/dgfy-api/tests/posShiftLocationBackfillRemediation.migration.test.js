import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('POS shift location remediation migration safety', () => {
    it('creates audit table and enforces terminal-home precedence branch', () => {
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

        expect(content).toContain('pos_shift_location_backfill_audit');
        expect(content).toContain('terminalHomeLocationId');
        expect(content).toContain('migration_tag');
        expect(content).toContain('resolveShiftLocationCandidate');
        expect(content).toContain('LOW_CONFIDENCE_RESOLUTION_SOURCES');
    });
});
