import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { writeJsonReport } from '../src/reports/reportWriter.js';
import { writeSummaryReport, buildSummaryLine } from '../src/reports/summaryWriter.js';

describe('reportWriter + summaryWriter', () => {
    let reportDir;

    beforeEach(async () => {
        reportDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgfy-migration-runner-reports-'));
    });

    afterEach(async () => {
        await fs.rm(reportDir, { recursive: true, force: true });
    });

    test('writeJsonReport creates a .json file whose parsed contents deep-equal the input payload', async () => {
        const payload = {
            generated_at: '2026-07-10T12:00:00.000Z',
            command: 'schema:migrate',
            exit_status: 'success',
            summary: { status: 'ok' }
        };

        const filePath = await writeJsonReport(reportDir, 'schema:migrate', payload);

        expect(filePath.endsWith('.json')).toBe(true);
        const contents = await fs.readFile(filePath, 'utf8');
        expect(JSON.parse(contents)).toEqual(payload);
    });

    test('writeSummaryReport creates a SEPARATE .summary.txt file (a different path than the .json one)', async () => {
        const payload = { generated_at: '2026-07-10T12:00:00.000Z', exit_status: 'success' };

        const jsonFilePath = await writeJsonReport(reportDir, 'verify', payload);
        const summaryFilePath = await writeSummaryReport(reportDir, 'verify', payload);

        expect(summaryFilePath).not.toBe(jsonFilePath);
        expect(summaryFilePath.endsWith('.summary.txt')).toBe(true);

        const contents = await fs.readFile(summaryFilePath, 'utf8');
        expect(contents).toContain('[verify]');
    });

    test('both writers create the target directory recursively when reportDir does not exist yet', async () => {
        const nestedDir = path.join(reportDir, 'nested', 'deeper');
        const payload = { generated_at: '2026-07-10T12:00:00.000Z', exit_status: 'success' };

        const jsonFilePath = await writeJsonReport(nestedDir, 'status', payload);
        const summaryFilePath = await writeSummaryReport(nestedDir, 'status', payload);

        await expect(fs.access(jsonFilePath)).resolves.toBeUndefined();
        await expect(fs.access(summaryFilePath)).resolves.toBeUndefined();
    });

    test('the JSON and summary file for the same command run share the same base timestamp prefix but different extensions/suffixes', async () => {
        const payload = { generated_at: '2026-07-10T12:00:00.000Z', exit_status: 'success' };

        const jsonFilePath = await writeJsonReport(reportDir, 'data:dry-run', payload);
        const summaryFilePath = await writeSummaryReport(reportDir, 'data:dry-run', payload);

        const jsonBase = path.basename(jsonFilePath, '.json');
        const summaryBase = path.basename(summaryFilePath, '.summary.txt');
        expect(summaryBase).toBe(jsonBase);
        expect(jsonFilePath).not.toBe(summaryFilePath);
    });
});

describe('buildSummaryLine', () => {
    test('never dumps the full JSON object into the summary line', () => {
        const report = {
            generated_at: '2026-07-10T12:00:00.000Z',
            exit_status: 'success',
            summary: { status: 'ok', tenants_total: 3 },
            results: [{ tenant_id: 1 }]
        };

        const line = buildSummaryLine('status', report);

        const jsonDumpMatches = (line.match(/"summary":|"results":/g) || []).length;
        expect(jsonDumpMatches).toBe(0);
        expect(line).toContain('[status]');
        expect(line).toContain('status=ok');
    });
});
