import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
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

const tolerance = parsePositiveNumber(process.env.FIFO_DRIFT_TOLERANCE, 0.0001);
const maxPrintedRows = Math.max(1, Math.floor(parsePositiveNumber(process.env.FIFO_DRIFT_MAX_PRINT, 20)));
const shouldRepairPositiveDrift = process.argv.includes('--repair-positive-drift');
const jsonOutputPath = parseJsonOutputArg();

const DRIFT_SQL = `
  SELECT *
  FROM (
    SELECT
      i.item_id,
      i.name,
      i.sku_code,
      CAST(i.cost_per_unit AS DECIMAL(18,6)) AS item_cost_per_unit,
      CAST(i.current_stock AS DECIMAL(18,6)) AS current_stock,
      CAST(COALESCE(SUM(
        CASE
          WHEN fb.quantity > fb.quantity_consumed THEN fb.quantity - fb.quantity_consumed
          ELSE 0
        END
      ), 0) AS DECIMAL(18,6)) AS batch_available,
      CAST(
        CAST(i.current_stock AS DECIMAL(18,6)) -
        CAST(COALESCE(SUM(
          CASE
            WHEN fb.quantity > fb.quantity_consumed THEN fb.quantity - fb.quantity_consumed
            ELSE 0
          END
        ), 0) AS DECIMAL(18,6))
      AS DECIMAL(18,6)) AS stock_drift
    FROM items i
    LEFT JOIN fifo_batches fb ON fb.item_id = i.item_id
    WHERE i.fifo_enabled = 1
      AND (i.deleted_at IS NULL)
      AND (i.status IS NULL OR i.status <> 'inactive')
    GROUP BY i.item_id, i.name, i.sku_code, i.current_stock
  ) drift_view
  WHERE ABS(drift_view.stock_drift) > :tolerance
  ORDER BY ABS(drift_view.stock_drift) DESC, drift_view.item_id ASC
`;

const OVERCONSUMED_SQL = `
  SELECT
    fb.batch_id,
    fb.item_id,
    CAST(fb.quantity AS DECIMAL(18,6)) AS quantity,
    CAST(fb.quantity_consumed AS DECIMAL(18,6)) AS quantity_consumed,
    CAST(fb.quantity_consumed - fb.quantity AS DECIMAL(18,6)) AS over_consumed
  FROM fifo_batches fb
  WHERE CAST(fb.quantity_consumed - fb.quantity AS DECIMAL(18,6)) > :tolerance
  ORDER BY over_consumed DESC, fb.batch_id ASC
`;

const toNumber = (value) => Number(value || 0);

const repairPositiveStockDriftForTenant = async (tenantSequelize, driftRows = []) => {
    const positiveRows = driftRows.filter((row) => toNumber(row.stock_drift) > tolerance);
    if (positiveRows.length === 0) {
        return { repaired: 0 };
    }

    await tenantSequelize.transaction(async (transaction) => {
        for (const row of positiveRows) {
            await tenantSequelize.query(
                `
                INSERT INTO fifo_batches (
                  item_id,
                  quantity,
                  quantity_consumed,
                  cost_per_unit,
                  received_date,
                  expiry_date,
                  po_number,
                  created_at,
                  updated_at
                )
                VALUES (
                  :itemId,
                  :quantity,
                  0,
                  :costPerUnit,
                  NOW(),
                  NULL,
                  'FIFO-DRIFT-REPAIR',
                  NOW(),
                  NOW()
                )
                `,
                {
                    transaction,
                    replacements: {
                        itemId: row.item_id,
                        quantity: toNumber(row.stock_drift),
                        costPerUnit: toNumber(row.item_cost_per_unit)
                    }
                }
            );
        }
    });

    return { repaired: positiveRows.length };
};

const auditTenantFifoDrift = async (tenant) => {
    const tenantSequelize = await tenantConnector.getConnection(tenant);
    let repairedCount = 0;

    let driftRows = await tenantSequelize.query(DRIFT_SQL, {
        type: QueryTypes.SELECT,
        replacements: { tolerance }
    });

    if (shouldRepairPositiveDrift) {
        const repairResult = await repairPositiveStockDriftForTenant(tenantSequelize, driftRows);
        repairedCount = repairResult.repaired || 0;
        if (repairedCount > 0) {
            driftRows = await tenantSequelize.query(DRIFT_SQL, {
                type: QueryTypes.SELECT,
                replacements: { tolerance }
            });
        }
    }

    const overConsumedRows = await tenantSequelize.query(OVERCONSUMED_SQL, {
        type: QueryTypes.SELECT,
        replacements: { tolerance }
    });

    const maxDriftAbs = driftRows.reduce((max, row) => {
        const drift = Math.abs(toNumber(row.stock_drift));
        return drift > max ? drift : max;
    }, 0);

    return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        dbName: tenant.db_name,
        status: driftRows.length === 0 && overConsumedRows.length === 0 ? 'healthy' : 'degraded',
        driftRows,
        overConsumedRows,
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
        `[FifoDriftAudit] tenant=${result.tenantName} db=${result.dbName} status=${result.status} drift_rows=${result.driftRows.length} over_consumed_rows=${result.overConsumedRows.length} repaired=${result.repairedCount || 0} max_abs_drift=${result.maxDriftAbs.toFixed(6)}`
    );

    if (result.driftRows.length > 0) {
        console.log(`[FifoDriftAudit] drift details (top ${Math.min(result.driftRows.length, maxPrintedRows)}):`);
        result.driftRows.slice(0, maxPrintedRows).forEach((row) => {
            console.log(
                ` - item_id=${row.item_id} sku=${row.sku_code || '-'} current_stock=${toNumber(row.current_stock).toFixed(6)} batch_available=${toNumber(row.batch_available).toFixed(6)} drift=${toNumber(row.stock_drift).toFixed(6)}`
            );
        });
    }

    if (result.overConsumedRows.length > 0) {
        console.log(`[FifoDriftAudit] over-consumed batch details (top ${Math.min(result.overConsumedRows.length, maxPrintedRows)}):`);
        result.overConsumedRows.slice(0, maxPrintedRows).forEach((row) => {
            console.log(
                ` - batch_id=${row.batch_id} item_id=${row.item_id} quantity=${toNumber(row.quantity).toFixed(6)} consumed=${toNumber(row.quantity_consumed).toFixed(6)} over=${toNumber(row.over_consumed).toFixed(6)}`
            );
        });
    }
};

const writeJsonArtifact = async (payload) => {
    if (!jsonOutputPath) return;
    const serialized = JSON.stringify(payload, null, 2);
    await fs.writeFile(jsonOutputPath, serialized, 'utf8');
    console.log(`[FifoDriftAudit] wrote json artifact: ${jsonOutputPath}`);
};

const run = async () => {
    try {
        const tenants = await loadTargetTenants();
        console.log(`[FifoDriftAudit] starting tenant_count=${tenants.length} tolerance=${tolerance} repair_positive_drift=${shouldRepairPositiveDrift}`);

        const results = [];
        for (const tenant of tenants) {
            try {
                const tenantResult = await auditTenantFifoDrift(tenant);
                results.push(tenantResult);
            } catch (error) {
                results.push({
                    tenantId: tenant.id,
                    tenantName: tenant.name,
                    dbName: tenant.db_name,
                    status: 'degraded',
                    driftRows: [],
                    overConsumedRows: [],
                    maxDriftAbs: 0,
                    error: error.message
                });
            }
        }

        results.forEach((result) => {
            printTenantResult(result);
            if (result.error) {
                console.log(`[FifoDriftAudit] tenant error: ${result.error}`);
            }
        });

        const degraded = results.filter((result) => result.status === 'degraded');
        const totalDriftRows = results.reduce((sum, result) => sum + result.driftRows.length, 0);
        const totalOverConsumedRows = results.reduce((sum, result) => sum + result.overConsumedRows.length, 0);
        const maxAbsDrift = results.reduce((max, result) => Math.max(max, result.maxDriftAbs || 0), 0);

        const summary = {
            generated_at: new Date().toISOString(),
            tolerance,
            repair_positive_drift: shouldRepairPositiveDrift,
            tenant_count: results.length,
            degraded_tenants: degraded.length,
            total_drift_rows: totalDriftRows,
            total_over_consumed_rows: totalOverConsumedRows,
            max_abs_drift: maxAbsDrift,
            status: degraded.length === 0 ? 'healthy' : 'degraded',
            results
        };

        console.log(`[FifoDriftAudit] summary status=${summary.status} degraded_tenants=${summary.degraded_tenants} total_drift_rows=${summary.total_drift_rows} total_over_consumed_rows=${summary.total_over_consumed_rows} max_abs_drift=${summary.max_abs_drift.toFixed(6)}`);
        await writeJsonArtifact(summary);

        process.exit(summary.status === 'healthy' ? 0 : 1);
    } catch (error) {
        console.error('[FifoDriftAudit] failed:', error.message);
        process.exit(1);
    } finally {
        try {
            await tenantConnector.closeAll();
        } catch (closeError) {
            console.warn('[FifoDriftAudit] warning: failed closing tenant connections:', closeError.message);
        }
        try {
            await landlordSequelize.close();
        } catch (closeError) {
            console.warn('[FifoDriftAudit] warning: failed closing landlord connection:', closeError.message);
        }
    }
};

run();
