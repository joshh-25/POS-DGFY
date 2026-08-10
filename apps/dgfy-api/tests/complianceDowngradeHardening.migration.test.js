import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Compliance downgrade hardening migration safety', () => {
    it('requires marker mutation and enforces cycle-aware revert constraints', () => {
        const migrationPath = path.join(
            __dirname,
            '..',
            'migrations',
            '20260422000002-harden-compliance-downgrade-controls.cjs'
        );

        expect(fs.existsSync(migrationPath)).toBe(true);
        const content = fs.readFileSync(migrationPath, 'utf8');

        expect(content).toContain('Compliance downgrade requires governed marker mutation in the same update');
        expect(content).toContain('Compliance downgrade must mutate either override markers or revert markers, not both');
        expect(content).toContain('compliance_mode_state IN (\'compliant_pending\', \'compliant_active\')');
        expect(content).toContain('Tenant revert to non-compliant already used for current compliance cycle');
        expect(content).toContain('Tenant revert must persist current compliance cycle version');
        expect(content).toContain('SET compliance_cycle_version = 1');
    });
});
