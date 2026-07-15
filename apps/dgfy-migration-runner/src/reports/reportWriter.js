import { promises as fs } from 'fs';
import { dirname, join } from 'path';

/**
 * Shared low-level mkdir-recursive + writeFile helper (ported from
 * backend/scripts/sync-tenant-schemas.js's private writeReport, lines
 * 430-436), exported here since both this module and summaryWriter.js need
 * it — the analog left it module-private.
 */
export async function writeReportFile(filePath, contents) {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, 'utf8');
}

/**
 * D-16's `{timestamp}-{command}.json` naming, e.g. `schema:migrate` becomes
 * `schema-migrate` after the replace.
 */
export function buildReportFileName(reportDir, command, generatedAt = new Date()) {
    const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
    const safeCommand = String(command).replace(/[^a-z0-9-]+/gi, '-');
    return join(reportDir, `${timestamp}-${safeCommand}.json`);
}

/**
 * D-15: machine-readable reports use JSON format.
 */
export async function writeJsonReport(reportDir, command, payload) {
    const generatedAt = payload && payload.generated_at ? new Date(payload.generated_at) : new Date();
    const filePath = buildReportFileName(reportDir, command, generatedAt);
    await writeReportFile(filePath, JSON.stringify(payload, null, 2));
    return filePath;
}
