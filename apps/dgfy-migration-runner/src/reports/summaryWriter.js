import { writeReportFile, buildReportFileName } from './reportWriter.js';

/**
 * A terse key=value summary line (style of sync-tenant-schemas.js's stdout
 * line, lines 626-628) — deliberately does NOT dump the full JSON object;
 * that's the .json file's job per D-16's explicit split.
 */
export function buildSummaryLine(command, report, exitStatus) {
    // Callers that know the real outcome (every real command handler) pass
    // exitStatus explicitly — none of the report payloads produced by
    // src/commands/*.js ever populate summary.status/exit_status, so falling
    // back to inferring it from the report shape here always resolved to
    // 'unknown' in production. The inference fallback is kept only for
    // backward compatibility with callers that don't pass exitStatus.
    const status = exitStatus !== undefined ? exitStatus : (report?.summary?.status || report?.exit_status || 'unknown');
    const generatedAt = report?.generated_at || '';
    const parts = [`[${command}] status=${status} generated_at=${generatedAt}`];

    if (report?.summary && typeof report.summary === 'object') {
        Object.entries(report.summary).forEach(([key, value]) => {
            if (key === 'status') {
                return;
            }
            if (value !== null && typeof value === 'object') {
                return;
            }
            parts.push(`${key}=${value}`);
        });
    }

    return parts.join(' ');
}

/**
 * Writes the D-16 companion `.summary.txt` file (separate from the `.json`
 * report, same base timestamp prefix) and echoes the same line to stdout
 * (D-13 — visibility in deploy logs).
 */
export async function writeSummaryReport(reportDir, command, report, exitStatus) {
    const generatedAt = report && report.generated_at ? new Date(report.generated_at) : new Date();
    const jsonFilePath = buildReportFileName(reportDir, command, generatedAt);
    const summaryFilePath = jsonFilePath.replace(/\.json$/, '.summary.txt');
    const line = buildSummaryLine(command, report, exitStatus);

    await writeReportFile(summaryFilePath, line);
    console.log(line);

    return summaryFilePath;
}
