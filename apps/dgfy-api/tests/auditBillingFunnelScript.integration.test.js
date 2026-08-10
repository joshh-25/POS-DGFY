import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

const runAuditScript = (fixturePath) => {
    return spawnSync(
        process.execPath,
        ['scripts/audit-billing-funnel.js'],
        {
            cwd: backendRoot,
            env: {
                ...process.env,
                BILLING_FUNNEL_AUDIT_FIXTURE_PATH: fixturePath,
                NODE_ENV: 'production'
            },
            encoding: 'utf8'
        }
    );
};

describe('audit-billing-funnel script integration', () => {
    it('exits 0 on a healthy fixture run', () => {
        const result = runAuditScript('tests/fixtures/billingFunnelAudit.healthy.js');
        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('status=healthy');
    });

    it('exits non-zero on a degraded fixture run', () => {
        const result = runAuditScript('tests/fixtures/billingFunnelAudit.degraded.js');
        expect(result.status).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain('status=degraded');
    });
});
