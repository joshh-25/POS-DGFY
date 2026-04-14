import fs from 'fs/promises';
import { fileURLToPath } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        reportFile: '',
        baselineFile: ''
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--report-file') {
            options.reportFile = argv[i + 1] || '';
            i += 1;
            continue;
        }
        if (arg === '--baseline-file') {
            options.baselineFile = argv[i + 1] || '';
            i += 1;
        }
    }
    return options;
}

function makeKey(item) {
    return `${item.tenant_db}|${item.error_code}|${item.fingerprint}`;
}

function getFailedRows(report) {
    return Array.isArray(report?.results)
        ? report.results.filter((row) => row?.status === 'failed')
        : [];
}

export function compareTenantSyncFailures(report, baseline) {
    const currentFailures = getFailedRows(report);
    const baselineFailures = Array.isArray(baseline?.failures) ? baseline.failures : [];

    const currentByKey = new Map(currentFailures.map((row) => [makeKey(row), row]));
    const baselineByKey = new Map(baselineFailures.map((row) => [makeKey(row), row]));

    const newFailures = [...currentByKey.keys()]
        .filter((key) => !baselineByKey.has(key))
        .map((key) => currentByKey.get(key));

    const resolvedFailures = [...baselineByKey.keys()]
        .filter((key) => !currentByKey.has(key))
        .map((key) => baselineByKey.get(key));

    const baselineByTenant = new Map();
    for (const row of baselineFailures) {
        const rows = baselineByTenant.get(row.tenant_db) || [];
        rows.push(row);
        baselineByTenant.set(row.tenant_db, rows);
    }

    const currentByTenant = new Map();
    for (const row of currentFailures) {
        const rows = currentByTenant.get(row.tenant_db) || [];
        rows.push(row);
        currentByTenant.set(row.tenant_db, rows);
    }

    const mutatedFailures = [];
    for (const [tenantDb, currentRows] of currentByTenant.entries()) {
        const baselineRows = baselineByTenant.get(tenantDb);
        if (!baselineRows || baselineRows.length === 0) {
            continue;
        }

        const exactMatchExists = currentRows.some((currentRow) =>
            baselineRows.some((baselineRow) => makeKey(currentRow) === makeKey(baselineRow))
        );

        if (!exactMatchExists) {
            mutatedFailures.push({
                tenant_db: tenantDb,
                baseline: baselineRows,
                current: currentRows
            });
        }
    }

    return {
        summary: {
            baseline_failure_count: baselineFailures.length,
            current_failure_count: currentFailures.length,
            new_failure_count: newFailures.length,
            resolved_failure_count: resolvedFailures.length,
            mutated_failure_count: mutatedFailures.length
        },
        new_failures: newFailures,
        resolved_failures: resolvedFailures,
        mutated_failures: mutatedFailures
    };
}

async function readJson(path) {
    const content = await fs.readFile(path, 'utf8');
    return JSON.parse(content);
}

export async function runTenantSyncRegressionGate({ reportFile, baselineFile }) {
    if (!reportFile) {
        throw new Error('Missing required --report-file');
    }
    if (!baselineFile) {
        throw new Error('Missing required --baseline-file');
    }

    const report = await readJson(reportFile);
    const baseline = await readJson(baselineFile);

    const comparison = compareTenantSyncFailures(report, baseline);

    console.log('[TenantSchemaSyncGate] summary');
    console.log(JSON.stringify(comparison.summary, null, 2));

    if (comparison.new_failures.length > 0) {
        console.error('[TenantSchemaSyncGate] new failures detected:');
        console.error(JSON.stringify(comparison.new_failures, null, 2));
    }

    if (comparison.mutated_failures.length > 0) {
        console.error('[TenantSchemaSyncGate] mutated failures detected:');
        console.error(JSON.stringify(comparison.mutated_failures, null, 2));
    }

    if (comparison.resolved_failures.length > 0) {
        console.log('[TenantSchemaSyncGate] resolved baseline failures:');
        console.log(JSON.stringify(comparison.resolved_failures, null, 2));
    }

    const hasRegressions = comparison.new_failures.length > 0 || comparison.mutated_failures.length > 0;
    if (hasRegressions) {
        process.exitCode = 1;
    }

    return comparison;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
    const options = parseArgs();
    runTenantSyncRegressionGate(options).catch((error) => {
        console.error(`[TenantSchemaSyncGate] fatal: ${error.message}`);
        process.exit(1);
    });
}