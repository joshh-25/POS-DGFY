import dotenv from 'dotenv';
import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { QueryTypes } from 'sequelize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { sequelize: landlordSequelize, Tenant } = await import('../src/models/index.js');
const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');

const parsePositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseJsonOutputArg = () => {
    const idx = process.argv.indexOf('--json-output');
    if (idx === -1) return null;
    return process.argv[idx + 1] || null;
};

const hasArg = (flag) => process.argv.includes(flag);

const tolerance = parsePositiveNumber(process.env.LOCATION_STOCK_PARITY_TOLERANCE, 0.0001);
const maxPrintedRows = Math.max(1, Math.floor(parsePositiveNumber(process.env.LOCATION_STOCK_PARITY_MAX_PRINT, 20)));
const jsonOutputPath = parseJsonOutputArg();
const shouldRepairCurrentStock = hasArg('--repair-current-stock');
const allowMissingTables = hasArg('--allow-missing-tables');

if (shouldRepairCurrentStock) {
    throw new Error(
        'Automatic location-stock repair is disabled. Review each item and reconcile it through an audited inventory movement; do not overwrite item stock from this audit.'
    );
}

const DRIFT_SQL = `
  SELECT *
  FROM (
    SELECT
      i.item_id,
      i.name,
      i.sku_code,
      CAST(i.current_stock AS DECIMAL(18,6)) AS current_stock,
      CAST(COALESCE(SUM(ils.quantity_on_hand), 0) AS DECIMAL(18,6)) AS location_stock_total,
      CAST(
        CAST(i.current_stock AS DECIMAL(18,6)) -
        CAST(COALESCE(SUM(ils.quantity_on_hand), 0) AS DECIMAL(18,6))
      AS DECIMAL(18,6)) AS stock_drift
    FROM items i
    LEFT JOIN item_location_stocks ils ON ils.item_id = i.item_id
    WHERE i.deleted_at IS NULL
      AND (i.status IS NULL OR i.status <> 'inactive')
    GROUP BY i.item_id, i.name, i.sku_code, i.current_stock
  ) parity_view
  WHERE ABS(parity_view.stock_drift) > :tolerance
  ORDER BY ABS(parity_view.stock_drift) DESC, parity_view.item_id ASC
`;

const ORPHAN_SQL = `
  SELECT
    ils.item_location_stock_id,
    ils.item_id,
    ils.location_id,
    CAST(ils.quantity_on_hand AS DECIMAL(18,6)) AS quantity_on_hand
  FROM item_location_stocks ils
  LEFT JOIN items i ON i.item_id = ils.item_id
  LEFT JOIN tenant_locations tl ON tl.location_id = ils.location_id
  WHERE i.item_id IS NULL OR tl.location_id IS NULL
  ORDER BY ils.item_location_stock_id ASC
`;

const hasRequiredTables = async (tenantSequelize) => {
    const rows = await tenantSequelize.query('SHOW TABLES', { type: QueryTypes.SELECT });
    const tables = new Set(
        rows.map((row) => String(Object.values(row)[0] || '').toLowerCase())
    );
    return ['items', 'item_location_stocks', 'tenant_locations'].every((tableName) => tables.has(tableName));
};

const countActiveLocations = async (tenantSequelize) => {
    const rows = await tenantSequelize.query(
        'SELECT COUNT(*) AS active_location_count FROM tenant_locations WHERE is_active = 1',
        { type: QueryTypes.SELECT }
    );
    return Number(rows[0]?.active_location_count || 0);
};

const repairCurrentStockFromLocationLedger = async (tenantSequelize) => {
    const [result] = await tenantSequelize.query(
        `
        UPDATE items i
        LEFT JOIN (
            SELECT item_id, CAST(COALESCE(SUM(quantity_on_hand), 0) AS DECIMAL(18,6)) AS location_total
            FROM item_location_stocks
            GROUP BY item_id
        ) s ON s.item_id = i.item_id
        SET i.current_stock = COALESCE(s.location_total, 0)
        WHERE i.deleted_at IS NULL
          AND (i.status IS NULL OR i.status <> 'inactive')
          AND ABS(CAST(i.current_stock AS DECIMAL(18,6)) - COALESCE(s.location_total, 0)) > :tolerance
        `,
        {
            replacements: { tolerance }
        }
    );

    return Number(result?.affectedRows || 0);
};

const toNumber = (value) => Number(value || 0);

const auditTenantLocationParity = async (tenant) => {
    const tenantSequelize = await tenantConnector.getConnection(tenant);
    const hasTables = await hasRequiredTables(tenantSequelize);
    if (!hasTables) {
        return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            dbName: tenant.db_name,
            status: allowMissingTables ? 'skipped' : 'degraded',
            missingTables: true,
            driftRows: [],
            orphanRows: [],
            maxDriftAbs: 0,
            repairedCount: 0
        };
    }

    const activeLocationCount = await countActiveLocations(tenantSequelize);
    if (activeLocationCount === 0) {
        return {
            tenantId: tenant.id,
            tenantName: tenant.name,
            dbName: tenant.db_name,
            status: 'skipped',
            missingTables: false,
            noActiveLocations: true,
            driftRows: [],
            orphanRows: [],
            maxDriftAbs: 0,
            repairedCount: 0
        };
    }

    let repairedCount = 0;
    if (shouldRepairCurrentStock) {
        repairedCount = await repairCurrentStockFromLocationLedger(tenantSequelize);
    }

    const driftRows = await tenantSequelize.query(DRIFT_SQL, {
        type: QueryTypes.SELECT,
        replacements: { tolerance }
    });
    const orphanRows = await tenantSequelize.query(ORPHAN_SQL, {
        type: QueryTypes.SELECT
    });

    const maxDriftAbs = driftRows.reduce((max, row) => {
        const drift = Math.abs(toNumber(row.stock_drift));
        return drift > max ? drift : max;
    }, 0);

    return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        dbName: tenant.db_name,
        status: driftRows.length === 0 && orphanRows.length === 0 ? 'healthy' : 'degraded',
        missingTables: false,
        driftRows,
        orphanRows,
        maxDriftAbs,
        repairedCount
    };
};

const loadTargetTenants = async () => {
    const activeTenants = await Tenant.findAll({
        where: { status: 'active' },
        attributes: ['id', 'name', 'db_name', 'status'],
        raw: true
    });

    if (activeTenants.length > 0) {
        return activeTenants;
    }

    const fallbackDb = process.env.DB_NAME;
    if (!fallbackDb) {
        throw new Error('No active tenants found and DB_NAME is not configured for fallback audit.');
    }

    return [{
        id: `fallback-${fallbackDb}`,
        name: `Fallback Tenant (${fallbackDb})`,
        db_name: fallbackDb,
        status: 'active'
    }];
};

const printTenantResult = (result) => {
    console.log(
        `[LocationParityAudit] tenant=${result.tenantName} db=${result.dbName} status=${result.status} drift_rows=${result.driftRows.length} orphan_rows=${result.orphanRows.length} max_abs_drift=${result.maxDriftAbs.toFixed(6)} missing_tables=${result.missingTables === true} no_active_locations=${result.noActiveLocations === true} repaired=${result.repairedCount || 0}`
    );

    if (result.driftRows.length > 0) {
        console.log(`[LocationParityAudit] drift details (top ${Math.min(result.driftRows.length, maxPrintedRows)}):`);
        result.driftRows.slice(0, maxPrintedRows).forEach((row) => {
            console.log(
                ` - item_id=${row.item_id} sku=${row.sku_code || '-'} current_stock=${toNumber(row.current_stock).toFixed(6)} location_stock_total=${toNumber(row.location_stock_total).toFixed(6)} drift=${toNumber(row.stock_drift).toFixed(6)}`
            );
        });
    }

    if (result.orphanRows.length > 0) {
        console.log(`[LocationParityAudit] orphan details (top ${Math.min(result.orphanRows.length, maxPrintedRows)}):`);
        result.orphanRows.slice(0, maxPrintedRows).forEach((row) => {
            console.log(
                ` - item_location_stock_id=${row.item_location_stock_id} item_id=${row.item_id} location_id=${row.location_id} qty=${toNumber(row.quantity_on_hand).toFixed(6)}`
            );
        });
    }
};

const writeJsonArtifact = async (payload) => {
    if (!jsonOutputPath) return;
    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(jsonOutputPath, serialized, 'utf8');
    console.log(`[LocationParityAudit] wrote json artifact: ${jsonOutputPath}`);
};

const run = async () => {
    try {
        const tenants = await loadTargetTenants();
        console.log(`[LocationParityAudit] starting tenant_count=${tenants.length} tolerance=${tolerance} repair_current_stock=${shouldRepairCurrentStock} allow_missing_tables=${allowMissingTables}`);

        const results = [];
        for (const tenant of tenants) {
            try {
                const tenantResult = await auditTenantLocationParity(tenant);
                results.push(tenantResult);
            } catch (error) {
                results.push({
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    dbName: tenant.db_name,
                    status: 'degraded',
                    missingTables: false,
                    driftRows: [],
                    orphanRows: [],
                    maxDriftAbs: 0,
                    repairedCount: 0,
                    error: error.message
                });
            }
        }

        results.forEach((result) => {
            printTenantResult(result);
            if (result.error) {
                console.log(`[LocationParityAudit] tenant error: ${result.error}`);
            }
        });

        const degraded = results.filter((result) => result.status === 'degraded');
        const skipped = results.filter((result) => result.status === 'skipped');
        const totalDriftRows = results.reduce((sum, result) => sum + result.driftRows.length, 0);
        const totalOrphanRows = results.reduce((sum, result) => sum + result.orphanRows.length, 0);
        const totalRepaired = results.reduce((sum, result) => sum + Number(result.repairedCount || 0), 0);
        const maxAbsDrift = results.reduce((max, result) => Math.max(max, result.maxDriftAbs || 0), 0);

        const summary = {
            generated_at: new Date().toISOString(),
            tolerance,
            tenant_count: results.length,
            degraded_tenants: degraded.length,
            skipped_tenants: skipped.length,
            total_drift_rows: totalDriftRows,
            total_orphan_rows: totalOrphanRows,
            total_repaired_rows: totalRepaired,
            max_abs_drift: maxAbsDrift,
            status: degraded.length === 0 ? 'healthy' : 'degraded',
            results
        };

        console.log(
            `[LocationParityAudit] summary status=${summary.status} degraded_tenants=${summary.degraded_tenants} skipped_tenants=${summary.skipped_tenants} total_drift_rows=${summary.total_drift_rows} total_orphan_rows=${summary.total_orphan_rows} total_repaired_rows=${summary.total_repaired_rows} max_abs_drift=${summary.max_abs_drift.toFixed(6)}`
        );

        await writeJsonArtifact(summary);

        process.exit(summary.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[LocationParityAudit] failed:', error.message);
        process.exit(1);
    } finally {
        try {
            await tenantConnector.closeAll();
        } catch (closeError) {
            console.warn('[LocationParityAudit] warning: failed closing tenant connections:', closeError.message);
        }
        try {
            await landlordSequelize.close();
        } catch (closeError) {
            console.warn('[LocationParityAudit] warning: failed closing landlord connection:', closeError.message);
        }
    }
};

run();
