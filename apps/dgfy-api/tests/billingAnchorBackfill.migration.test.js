import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Billing anchor backfill migration safety', () => {
    it('backfill migration exists and is conservative', () => {
        const migrationPath = path.join(
            __dirname,
            '..',
            '..',
            'dgfy-migration-runner',
            'migrations',
            '20260303000005-backfill-missing-billing-anchor.cjs'
        );

        expect(fs.existsSync(migrationPath)).toBe(true);

        const content = fs.readFileSync(migrationPath, 'utf8');
        expect(content).toContain("billing_cycle_anchor IS NULL");
        expect(content).toContain("plan = 'premium'");
        expect(content).toContain('current_period_end IS NOT NULL');
        expect(content).toContain('DAY(current_period_end)');
    });
});
