import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

const runAuditScript = (contractPath) => {
    return spawnSync(
        process.execPath,
        ['scripts/audit-indexes.js'],
        {
            cwd: backendRoot,
            env: {
                ...process.env,
                SCHEMA_INDEX_AUDIT_CONTRACT_PATH: contractPath,
                NODE_ENV: 'production'
            },
            encoding: 'utf8'
        }
    );
};

describe('audit-indexes script integration', () => {
    it('exits 0 on a healthy contract run', () => {
        const result = runAuditScript('tests/fixtures/requiredIndexContract.empty.js');
        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('status=healthy');
    });

    it('exits non-zero on a degraded contract run', () => {
        const result = runAuditScript('tests/fixtures/requiredIndexContract.missing.js');
        expect(result.status).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain('status=degraded');
    });
});
