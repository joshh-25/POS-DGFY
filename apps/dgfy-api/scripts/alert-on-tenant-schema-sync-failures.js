// #2027: entrypoint.sh's `sync-tenant-schemas.js --mode repair-apply` startup step is
// deliberately non-blocking (see that script's own header comment -- one permanently-broken
// orphan tenant must never block API startup for everyone). Before this script existed, an
// unresolved tenant only produced an ASCII banner in a container's stdout / a log file nobody
// tails live -- exactly how a production tenant went unnoticed for days between restarts. This
// raises one Sentry event per unresolved run, reusing the app's own initSentry() (not a
// hand-rolled DSN/env resolution) so this can never drift from what the live API reports under.
//
// Fires unconditionally whenever any tenant is unresolved -- no custom baseline-diffing against
// a deploy-time-curated file (that would need a Dockerfile change to ship a deploy-tooling file
// into the runtime image, and conflates two different semantics: deploy-time "accepted risk" vs.
// a runtime signal). Instead this relies on Sentry's own issue grouping via an EXPLICIT
// fingerprint (below) so a standing, already-known failure collapses into one grouped Sentry
// issue's event count across restarts rather than paging repeatedly or fragmenting into a new
// issue every time the unresolved count happens to change.
//
// Never throws, never exits non-zero -- stays exactly as non-blocking as the step it follows.
import fs from 'fs/promises';
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSentry } from '../src/config/sentry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
    const reportFilePath = process.argv[2];
    if (!reportFilePath) {
        console.error('[TenantSchemaSyncAlert] usage: alert-on-tenant-schema-sync-failures.js <report-file-path>');
        return;
    }

    let report;
    try {
        report = JSON.parse(await fs.readFile(reportFilePath, 'utf8'));
    } catch (error) {
        console.error(`[TenantSchemaSyncAlert] could not read ${reportFilePath}: ${error.message}`);
        return;
    }

    const unresolved = Array.isArray(report?.results)
        ? report.results.filter((row) => row?.status === 'failed')
        : [];
    if (unresolved.length === 0) {
        return;
    }

    const { active } = initSentry({ logger: console });
    if (!active) {
        console.error(`[TenantSchemaSyncAlert] Sentry not configured; ${unresolved.length} tenant(s) unresolved after repair-apply.`);
        return;
    }

    Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('alert_key', 'tenant_schema_sync.repair_incomplete');
        // Explicit fingerprint -- the message text below varies by tenant count, which would
        // otherwise create a new Sentry issue every time the count changes instead of one
        // grouped issue whose event count tracks how often this keeps firing.
        scope.setFingerprint(['tenant_schema_sync', 'repair_incomplete']);
        scope.setExtra('unresolved_tenant_count', unresolved.length);
        scope.setExtra('unresolved_tenants', unresolved.map((row) => ({
            tenant_db: row.tenant_db,
            error_code: row.error_code,
            repair_attempted: row.repair_attempted,
            missing_tables: row.missing_tables,
            missing_columns: row.missing_columns,
            missing_indexes: row.missing_indexes,
            missing_seeds: row.missing_seeds,
            missing_enum_values: row.missing_enum_values
        })));
        Sentry.captureMessage(
            `[TenantSchemaSync] ${unresolved.length} tenant(s) left schema-incomplete after repair-apply at container startup`
        );
    });

    // Short-lived process, unlike the long-running API -- must flush before exit or the event
    // can be dropped.
    await Sentry.flush(2000);
    console.log(`[TenantSchemaSyncAlert] reported ${unresolved.length} unresolved tenant(s) to Sentry.`);
}

main().catch((error) => {
    console.error(`[TenantSchemaSyncAlert] unexpected error: ${error.message}`);
});
