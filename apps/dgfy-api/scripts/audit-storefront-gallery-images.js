import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import { Tenant, sequelize as landlordSequelize } from '../src/models/index.js';
import tenantConnector from '../src/utils/TenantConnector.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const GALLERY_SETTING_KEY = 'storefront_gallery_images';
const LOCAL_GALLERY_PATH_PATTERN = /^storefront-assets\/[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:jpe?g|png|gif|webp|bmp|avif)$/i;

const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        tenantIds: null,
        printJson: false,
        applyRemoveInvalid: false
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
        if (arg === '--apply-remove-invalid') {
            options.applyRemoveInvalid = true;
        }
    }

    return options;
};

const toPlain = (entry) => {
    if (!entry) return null;
    if (typeof entry.get === 'function') return entry.get({ plain: true });
    if (typeof entry.toJSON === 'function') return entry.toJSON();
    return entry;
};

const parseJsonValue = (value, fallback = null) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const normalizeLocalPath = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/^\/uploads\//, '').replace(/^[/\\]+/, '');
    return LOCAL_GALLERY_PATH_PATTERN.test(normalized) ? normalized : '';
};

const isExpiredSignedAssetUrl = (value, now = Date.now()) => {
    const raw = String(value || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return false;
    try {
        const parsed = new URL(raw);
        if (!parsed.hostname.toLowerCase().endsWith('file.notion.so')) return false;
        const expiration = Number(parsed.searchParams.get('expirationTimestamp'));
        return Number.isFinite(expiration) && expiration > 0 && expiration <= now;
    } catch {
        return false;
    }
};

const inspectGalleryRow = (row, index, now) => {
    const url = String(row?.url || '').trim();
    const path = String(row?.path || '').trim();
    const localPath = normalizeLocalPath(path || url);
    const expiredUrl = isExpiredSignedAssetUrl(url, now);
    const issues = [];

    if (expiredUrl && !localPath) {
        issues.push({
            code: 'expired_notion_url',
            message: 'Gallery row uses an expired signed Notion file URL and has no valid local upload path.'
        });
    }
    if (path && !normalizeLocalPath(path)) {
        issues.push({
            code: 'invalid_local_path',
            message: 'Gallery row has a local path that does not match the storefront asset convention.'
        });
    }
    if (!url && !path) {
        issues.push({
            code: 'empty_gallery_row',
            message: 'Gallery row has neither url nor path.'
        });
    }

    return {
        index,
        caption: String(row?.caption || '').slice(0, 140),
        alt: String(row?.alt || '').slice(0, 140),
        sort_order: row?.sort_order ?? index,
        url,
        path,
        local_path: localPath,
        valid_for_public_render: Boolean(localPath || (url && !expiredUrl)),
        issues
    };
};

const isInvalidRow = (inspection) => (
    inspection.issues.some((issue) => [
        'expired_notion_url',
        'invalid_local_path',
        'empty_gallery_row'
    ].includes(issue.code))
);

const inspectTenant = async ({ tenant, applyRemoveInvalid = false, now = Date.now() }) => {
    const tenantPlain = toPlain(tenant) || {};
    const result = {
        tenant_id: tenantPlain.id || null,
        tenant_name: tenantPlain.name || null,
        db_name: tenantPlain.db_name || null,
        status: 'healthy',
        rows_total: 0,
        rows_invalid: 0,
        rows_removed: 0,
        issues: [],
        rows: []
    };

    try {
        const tenantSequelize = await tenantConnector.getConnection(tenantPlain);
        const { SystemSetting } = getTenantModels(tenantSequelize);
        const setting = await SystemSetting.findOne({ where: { setting_key: GALLERY_SETTING_KEY } });
        if (!setting) return result;

        const settingPlain = toPlain(setting) || {};
        const rows = parseJsonValue(settingPlain.setting_value, []);
        if (!Array.isArray(rows)) {
            result.status = 'warning';
            result.issues.push({
                code: 'gallery_setting_not_array',
                message: 'storefront_gallery_images setting is not a JSON array.'
            });
            return result;
        }

        result.rows = rows.map((row, index) => inspectGalleryRow(row, index, now));
        result.rows_total = result.rows.length;
        result.rows_invalid = result.rows.filter(isInvalidRow).length;
        result.status = result.rows_invalid > 0 ? 'warning' : 'healthy';

        if (applyRemoveInvalid && result.rows_invalid > 0) {
            const repairedRows = rows.filter((_, index) => !isInvalidRow(result.rows[index]));
            await setting.update({
                setting_value: JSON.stringify(repairedRows),
                data_type: 'json'
            });
            result.rows_removed = rows.length - repairedRows.length;
        }
    } catch (error) {
        result.status = 'critical';
        result.issues.push({
            code: 'tenant_inspection_failed',
            message: error?.message || 'Tenant gallery inspection failed.'
        });
    }

    return result;
};

const printTextReport = (report) => {
    console.log('[StorefrontGalleryAudit] Complete');
    console.log(`mode=${report.mode}`);
    console.log(`checkedAt=${report.checked_at}`);
    console.log(`tenantCount=${report.summary.tenants_total}`);
    console.log(`healthy=${report.summary.healthy}`);
    console.log(`warning=${report.summary.warning}`);
    console.log(`critical=${report.summary.critical}`);
    console.log(`rowsTotal=${report.summary.rows_total}`);
    console.log(`rowsInvalid=${report.summary.rows_invalid}`);
    console.log(`rowsRemoved=${report.summary.rows_removed}`);

    for (const tenant of report.tenants) {
        if (tenant.status === 'healthy') continue;
        console.log(
            [
                `- tenantId=${tenant.tenant_id || ''}`,
                `tenantName=${tenant.tenant_name || ''}`,
                `db=${tenant.db_name || ''}`,
                `status=${tenant.status}`,
                `rowsTotal=${tenant.rows_total}`,
                `rowsInvalid=${tenant.rows_invalid}`,
                `rowsRemoved=${tenant.rows_removed}`
            ].join(' ')
        );
        for (const row of tenant.rows.filter(isInvalidRow)) {
            const codes = row.issues.map((issue) => issue.code).join(',');
            console.log(`  row=${row.index} issues=${codes} path=${row.path || ''} url=${row.url || ''}`);
        }
        for (const issue of tenant.issues) {
            console.log(`  issue=${issue.code} ${issue.message}`);
        }
    }
};

const main = async () => {
    const options = parseArgs();
    const where = options.tenantIds?.length
        ? { id: { [Op.in]: options.tenantIds } }
        : {};
    const tenants = await Tenant.findAll({
        where,
        order: [['created_at', 'ASC']]
    });
    const checkedAt = new Date().toISOString();

    const results = [];
    try {
        for (const tenant of tenants) {
            results.push(await inspectTenant({
                tenant,
                applyRemoveInvalid: options.applyRemoveInvalid
            }));
        }
    } finally {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    }

    const summary = results.reduce((acc, tenant) => {
        acc.tenants_total += 1;
        acc[tenant.status] += 1;
        acc.rows_total += tenant.rows_total;
        acc.rows_invalid += tenant.rows_invalid;
        acc.rows_removed += tenant.rows_removed;
        return acc;
    }, {
        tenants_total: 0,
        healthy: 0,
        warning: 0,
        critical: 0,
        rows_total: 0,
        rows_invalid: 0,
        rows_removed: 0
    });

    const report = {
        mode: options.applyRemoveInvalid ? 'apply-remove-invalid' : 'dry-run',
        checked_at: checkedAt,
        summary,
        tenants: results
    };

    if (options.printJson) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        printTextReport(report);
    }

    if (summary.critical > 0) {
        process.exitCode = 1;
    }
};

main().catch(async (error) => {
    console.error('[StorefrontGalleryAudit] Failed');
    console.error(error?.stack || error?.message || error);
    try {
        await tenantConnector.closeAll();
        await landlordSequelize.close();
    } catch {
        // no-op during fatal cleanup
    }
    process.exitCode = 1;
});
