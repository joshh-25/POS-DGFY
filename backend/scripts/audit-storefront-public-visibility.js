import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        tenantIds: null,
        printJson: false,
        failOn: 'critical',
        repairMissingSettings: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--tenant-id' || arg === '--tenant') {
            const value = String(argv[i + 1] || '').trim();
            if (value) options.tenantIds = [...(options.tenantIds || []), value];
            i += 1;
            continue;
        }
        if (arg === '--tenant-ids') {
            const values = String(argv[i + 1] || '')
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean);
            if (values.length > 0) options.tenantIds = [...(options.tenantIds || []), ...values];
            i += 1;
            continue;
        }
        if (arg === '--json') {
            options.printJson = true;
            continue;
        }
        if (arg === '--fail-on') {
            const value = String(argv[i + 1] || '').trim().toLowerCase();
            if (['critical', 'warning', 'never'].includes(value)) {
                options.failOn = value;
            }
            i += 1;
            continue;
        }
        if (arg === '--repair-missing-settings') {
            options.repairMissingSettings = true;
        }
    }

    return options;
};

const shouldFail = (result, failOn) => {
    if (failOn === 'never') return false;
    if (failOn === 'warning') return result.summary.warning > 0 || result.summary.critical > 0;
    return result.summary.critical > 0;
};

const printTextReport = (result) => {
    console.log('[StorefrontPublicVisibilityAudit] Complete');
    console.log(`status=${result.status}`);
    console.log(`checkedAt=${result.checked_at}`);
    console.log(`tenantCount=${result.summary.total}`);
    console.log(`healthy=${result.summary.healthy}`);
    console.log(`warning=${result.summary.warning}`);
    console.log(`critical=${result.summary.critical}`);
    console.log(`issueCounts=${JSON.stringify(result.summary.issue_counts)}`);

    for (const tenant of result.tenants) {
        if (tenant.status === 'healthy') continue;
        const issues = (tenant.issues || [])
            .map((issue) => `${issue.severity}:${issue.code}`)
            .join(',');
        console.log(
            [
                `- tenantId=${tenant.tenant_id || ''}`,
                `tenantName=${tenant.tenant_name || ''}`,
                `db=${tenant.db_name || ''}`,
                `slug=${tenant.slug || ''}`,
                `storeVisible=${tenant.store_is_visible}`,
                `visibilityRepaired=${tenant.store_is_visible_repaired === true}`,
                `indexed=${tenant.discovery_indexed}`,
                `indexVisible=${tenant.discovery_index_visible}`,
                `primaryLocationId=${tenant.active_primary_location_id || ''}`,
                `indexLocationId=${tenant.discovery_location_id || ''}`,
                `status=${tenant.status}`,
                `issues=${issues}`
            ].join(' ')
        );
    }
};

const main = async () => {
    const options = parseArgs();
    const { auditStorefrontPublicVisibility } = await import('../src/services/storefrontPublicVisibilityAuditService.js');
    const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');
    const { sequelize: landlordSequelize } = await import('../src/models/index.js');

    let result;
    try {
        result = await auditStorefrontPublicVisibility({
            tenantIds: options.tenantIds,
            repairMissingSettings: options.repairMissingSettings
        });
    } finally {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    }

    if (options.printJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        printTextReport(result);
    }

    if (shouldFail(result, options.failOn)) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error('[StorefrontPublicVisibilityAudit] Failed');
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
});
