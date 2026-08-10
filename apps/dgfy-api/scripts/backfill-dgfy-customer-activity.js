#!/usr/bin/env node
import { dgfyHistoricalBackfillUseCase } from '../src/modules/dgfy/index.js';
import db from '../src/models/index.js';
import tenantConnector from '../src/utils/TenantConnector.js';

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getValue = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    const inline = args.find((arg) => arg.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1) || fallback;
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const options = {
    dryRun: !hasFlag('--apply'),
    includeInactiveTenants: hasFlag('--include-inactive-tenants'),
    failFast: hasFlag('--fail-fast'),
    tenantPageSize: getValue('--tenant-page-size'),
    orderBatchSize: getValue('--order-batch-size'),
    accountPageSize: getValue('--account-page-size'),
    requiredActivityTypes: getValue('--require-activity-types'),
    transactionLimitPerTenant: hasFlag('--all-transactions')
        ? null
        : getValue('--transaction-limit-per-tenant', null)
};

const result = await dgfyHistoricalBackfillUseCase({ options });

const payload = result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        error: {
            message: result.error?.message,
            code: result.error?.code,
            statusCode: result.error?.statusCode,
            details: result.error?.details || null
        }
    };

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

await tenantConnector.closeAll().catch(() => null);
await db.sequelize.close().catch(() => null);

if (!result.success) {
    process.exitCode = 1;
}
