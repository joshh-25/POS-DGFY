import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        tenantIds: null,
        pruneStale: true,
        dryRun: false,
        concurrency: null,
        printJson: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--tenant-id' || arg === '--tenant') {
            const value = String(argv[i + 1] || '').trim();
            if (value) {
                options.tenantIds = [...(options.tenantIds || []), value];
            }
            i += 1;
            continue;
        }
        if (arg === '--tenant-ids') {
            const values = String(argv[i + 1] || '')
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean);
            if (values.length > 0) {
                options.tenantIds = [...(options.tenantIds || []), ...values];
            }
            i += 1;
            continue;
        }
        if (arg === '--no-prune') {
            options.pruneStale = false;
            continue;
        }
        if (arg === '--dry-run') {
            options.dryRun = true;
            continue;
        }
        if (arg === '--concurrency') {
            const parsed = Number.parseInt(String(argv[i + 1] || ''), 10);
            if (Number.isInteger(parsed) && parsed > 0) {
                options.concurrency = parsed;
            }
            i += 1;
            continue;
        }
        if (arg === '--json') {
            options.printJson = true;
        }
    }

    return options;
};

const main = async () => {
    const options = parseArgs();
    const { reconcileStorefrontDiscoveryIndex } = await import('../src/services/storefrontDiscoveryIndexService.js');
    const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');
    const { sequelize: landlordSequelize } = await import('../src/models/index.js');
    let result;
    try {
        result = await reconcileStorefrontDiscoveryIndex({
            tenantIds: options.tenantIds,
            pruneStale: options.pruneStale,
            dryRun: options.dryRun,
            ...(options.concurrency ? { concurrency: options.concurrency } : {})
        });
    } finally {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    }

    if (options.printJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log('[StorefrontDiscoveryIndex] Reconciliation complete');
        console.log(`status=${result.status}`);
        console.log(`dryRun=${result.dryRun === true ? 'true' : 'false'}`);
        console.log(`tenantCount=${result.tenantCount}`);
        console.log(`upserted=${result.upserted}`);
        console.log(`removed=${result.removed}`);
        console.log(`failed=${result.failed}`);
        console.log(`fallbackPrimaryCount=${result.fallbackPrimaryCount}`);
        if (Array.isArray(result.failures) && result.failures.length > 0) {
            console.log('failures=');
            result.failures.forEach((failure) => {
                console.log(`- tenantId=${failure.tenantId || ''} tenantName=${failure.tenantName || ''} error=${failure.error || 'unknown_error'}`);
            });
        }
        console.log(`durationMs=${result.durationMs}`);
        console.log(`checkedAt=${result.checkedAt}`);
    }

    if (result.failed > 0) {
        process.exitCode = 1;
    }
};

main().catch((error) => {
    console.error('[StorefrontDiscoveryIndex] Reconciliation failed');
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
});
