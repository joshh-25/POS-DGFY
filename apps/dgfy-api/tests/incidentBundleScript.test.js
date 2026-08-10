import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
    createIncidentBundle,
    createRedactor
} = require('../../../scripts/create-incident-bundle.js');

describe('incident bundle script', () => {
    it('redacts secrets and PII from excerpts', () => {
        const redactor = createRedactor();
        const sanitized = redactor.redact('authorization Bearer abcdefghijklmnop email user@example.com phone +63 917 123 4567 password supersecret paymongo_sk_live_123456789');

        expect(sanitized).not.toContain('abcdefghijklmnop');
        expect(sanitized).not.toContain('user@example.com');
        expect(sanitized).not.toContain('+63 917 123 4567');
        expect(sanitized).not.toContain('supersecret');
        expect(sanitized).toContain('[EMAIL_HASH:');
        expect(sanitized).toContain('[PHONE_HASH:');
        expect(redactor.counts.authorization).toBeGreaterThan(0);
        expect(redactor.counts.email).toBeGreaterThan(0);
    });

    it('creates the expected dry-run bundle files', async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-incident-bundle-'));
        const outputDir = path.join(rootDir, '.tmp', 'incident-bundles', 'probe');

        const result = await createIncidentBundle({
            rootDir,
            outputDir,
            requestId: 'req-bundle-123',
            dryRun: true
        });

        expect(result.outputDir).toBe(outputDir);
        expect(fs.existsSync(path.join(outputDir, 'incident_bundle.json'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'ai_trace_index.md'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'sanitized_log_excerpts.ndjson'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'reproduction_template.md'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'redaction_report.json'))).toBe(true);

        const bundle = JSON.parse(fs.readFileSync(path.join(outputDir, 'incident_bundle.json'), 'utf8'));
        expect(bundle.filters.request_id).toBe('req-bundle-123');
        expect(bundle.dry_run).toBe(true);
    });
});
