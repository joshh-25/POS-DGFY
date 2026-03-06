import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

process.env.NODE_ENV = 'production';

const { auditBillingFunnelIntegrity } = await import('../src/services/engagementIntegrityAuditService.js');

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const loadFixtureRows = async () => {
    const fixturePath = process.env.BILLING_FUNNEL_AUDIT_FIXTURE_PATH;
    if (!fixturePath) return null;

    const absolutePath = path.isAbsolute(fixturePath)
        ? fixturePath
        : path.resolve(process.cwd(), fixturePath);

    const moduleUrl = pathToFileURL(absolutePath).href;
    const loadedModule = await import(moduleUrl);
    const rows = loadedModule.rows || loadedModule.default?.rows || loadedModule.default;

    if (!Array.isArray(rows)) {
        throw new Error(
            `Invalid fixture module at ${absolutePath}. Export rows array or default rows array.`
        );
    }

    return rows;
};

const run = async () => {
    try {
        const rows = await loadFixtureRows();
        const lookbackHours = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_LOOKBACK_HOURS, 24);
        const attemptGraceMinutes = parsePositiveInt(process.env.BILLING_FUNNEL_AUDIT_ATTEMPT_GRACE_MINUTES, 15);

        const result = await auditBillingFunnelIntegrity({
            engagementEventModel: rows ? {
                findAll: async () => rows
            } : undefined,
            paymentModel: rows ? null : undefined,
            tenantModel: rows ? null : undefined,
            lookbackHours,
            attemptGraceMinutes
        });

        console.log(
            `[BillingFunnelAudit] status=${result.status} rows_scanned=${result.rowsScanned} `
            + `missing_correlation=${result.missingCorrelationCount} missing_outcome=${result.missingOutcomeCount} `
            + `orphan_attempts=${result.orphanAttemptCount} duplicate_events=${result.duplicateEventCount} `
            + `write_failures=${result.recentWriteFailures} skips=${result.recentSkips}`
        );

        if (result.errors.length > 0) {
            console.log('[BillingFunnelAudit] warnings/errors:');
            result.errors.forEach((error) => {
                console.log(` - scope=${error.scope} message=${error.message}`);
            });
        }

        if (result.issues.length > 0) {
            console.log('[BillingFunnelAudit] issues:');
            result.issues.forEach((issue) => {
                console.log(` - type=${issue.type}${issue.event_type ? ` event_type=${issue.event_type}` : ''}${issue.correlation_id ? ` correlation_id=${issue.correlation_id}` : ''}${issue.count ? ` count=${issue.count}` : ''}`);
            });
        }

        process.exit(result.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[BillingFunnelAudit] audit failed:', error.message);
        process.exit(1);
    }
};

run();
