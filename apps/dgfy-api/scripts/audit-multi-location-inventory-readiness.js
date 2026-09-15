#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { QueryTypes } from 'sequelize';
import {
  MULTI_LOCATION_OPERATION_MATRIX,
  evaluateMultiLocationInventoryReadiness
} from '../src/modules/inventory/services/multiLocationInventoryReadiness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { sequelize: landlordSequelize, Tenant } = await import('../src/models/index.js');
const { default: tenantConnector } = await import('../src/utils/TenantConnector.js');

const parseJsonOutputArg = () => {
  const index = process.argv.indexOf('--json-output');
  return index === -1 ? null : process.argv[index + 1] || null;
};

const tolerance = Number.isFinite(Number(process.env.LOCATION_STOCK_PARITY_TOLERANCE))
  ? Number(process.env.LOCATION_STOCK_PARITY_TOLERANCE)
  : 0.0001;
const jsonOutputPath = parseJsonOutputArg();
const REQUIRED_TABLES = ['items', 'item_location_stocks', 'tenant_locations', 'stock_movements'];

const tableSet = async (sequelize) => {
  const rows = await sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT });
  return new Set(rows.map((row) => String(Object.values(row)[0] || '').toLowerCase()));
};

const querySettings = async (sequelize, tables) => {
  if (!tables.has('system_settings')) return {};
  const rows = await sequelize.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN ('multi_location_inventory_enabled', 'store_has_no_location')`,
    { type: QueryTypes.SELECT }
  );
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
};

const auditTenant = async (tenant) => {
  const sequelize = await tenantConnector.getConnection(tenant);
  const tables = await tableSet(sequelize);
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
  if (missingTables.length > 0) {
    return {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      db_name: tenant.db_name,
      settings: {},
      active_locations: [],
      stock_by_location: [],
      movement_coverage: [],
      aggregate_drift_rows: [],
      missing_tables: missingTables,
      readiness: evaluateMultiLocationInventoryReadiness({ missingTables, tolerance })
    };
  }

  const [settings, activeLocations, stockByLocation, movementCoverage, aggregateDriftRows] = await Promise.all([
    querySettings(sequelize, tables),
    sequelize.query(
      `SELECT location_id, name, is_active, is_primary_storefront
       FROM tenant_locations WHERE is_active = 1
       ORDER BY is_primary_storefront DESC, location_id ASC`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT location_id, COUNT(*) AS stock_row_count,
              CAST(COALESCE(SUM(quantity_on_hand), 0) AS DECIMAL(18,6)) AS quantity_on_hand
       FROM item_location_stocks GROUP BY location_id ORDER BY location_id ASC`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT movement_type, COUNT(*) AS total_count,
              SUM(CASE WHEN movement_type <> 'transfer' AND location_id IS NULL THEN 1 ELSE 0 END) AS missing_location_count,
              SUM(CASE WHEN movement_type = 'transfer'
                        AND (source_location_id IS NULL OR destination_location_id IS NULL)
                       THEN 1 ELSE 0 END) AS missing_transfer_scope_count
       FROM stock_movements GROUP BY movement_type ORDER BY movement_type ASC`,
      { type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT * FROM (
         SELECT i.item_id, i.name, i.sku_code,
                CAST(i.current_stock AS DECIMAL(18,6)) AS current_stock,
                CAST(COALESCE(SUM(ils.quantity_on_hand), 0) AS DECIMAL(18,6)) AS location_stock_total,
                CAST(CAST(i.current_stock AS DECIMAL(18,6))
                  - CAST(COALESCE(SUM(ils.quantity_on_hand), 0) AS DECIMAL(18,6))
                AS DECIMAL(18,6)) AS stock_drift
         FROM items i LEFT JOIN item_location_stocks ils ON ils.item_id = i.item_id
         WHERE i.deleted_at IS NULL AND (i.status IS NULL OR i.status <> 'inactive')
         GROUP BY i.item_id, i.name, i.sku_code, i.current_stock
       ) parity_view
       WHERE ABS(parity_view.stock_drift) > :tolerance
       ORDER BY ABS(parity_view.stock_drift) DESC, parity_view.item_id ASC`,
      { type: QueryTypes.SELECT, replacements: { tolerance } }
    )
  ]);

  const readiness = evaluateMultiLocationInventoryReadiness({
    settings,
    activeLocations,
    stockByLocation,
    movementCoverage,
    aggregateDriftRows,
    tolerance
  });

  return {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    db_name: tenant.db_name,
    settings,
    active_locations: activeLocations,
    stock_by_location: stockByLocation,
    movement_coverage: movementCoverage,
    aggregate_drift_rows: aggregateDriftRows,
    missing_tables: [],
    readiness
  };
};

const loadTenants = async () => {
  const tenants = await Tenant.findAll({
    where: { status: 'active' },
    attributes: ['id', 'name', 'db_name'],
    raw: true
  });
  if (tenants.length > 0) return tenants;
  if (!process.env.DB_NAME) throw new Error('No active tenants and DB_NAME is not configured.');
  return [{ id: `fallback-${process.env.DB_NAME}`, name: `Fallback (${process.env.DB_NAME})`, db_name: process.env.DB_NAME }];
};

const run = async () => {
  try {
    const tenants = await loadTenants();
    const results = [];
    for (const tenant of tenants) {
      try {
        results.push(await auditTenant(tenant));
      } catch (error) {
        results.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          db_name: tenant.db_name,
          missing_tables: [],
          readiness: { status: 'blocked', findings: [{ code: 'AUDIT_ERROR', severity: 'blocking', details: { message: error.message } }] },
          error: error.message
        });
      }
    }

    for (const result of results) {
      const readiness = result.readiness || {};
      console.log(
        `[MultiLocationReadiness] tenant=${result.tenant_name} db=${result.db_name}`
        + ` status=${readiness.status} active_locations=${readiness.active_location_count || 0}`
        + ` operations=${readiness.operation_count || MULTI_LOCATION_OPERATION_MATRIX.length}`
        + ` findings=${(readiness.findings || []).length} warnings=${(readiness.warnings || []).length}`
      );
      for (const finding of readiness.findings || []) {
        console.log(` - ${finding.severity}: ${finding.code} ${JSON.stringify(finding.details || {})}`);
      }
      for (const warning of readiness.warnings || []) {
        console.log(` - ${warning.severity}: ${warning.code} ${JSON.stringify(warning.details || {})}`);
      }
    }

    const blockingTenantCount = results.filter((result) => result.readiness?.status === 'blocked').length;
    const payload = {
      generated_at: new Date().toISOString(),
      tolerance,
      operation_matrix: MULTI_LOCATION_OPERATION_MATRIX,
      tenant_count: results.length,
      blocked_tenant_count: blockingTenantCount,
      status: blockingTenantCount === 0 ? 'ready_for_controlled_rollout_review' : 'blocked',
      results
    };
    if (jsonOutputPath) {
      await fs.writeFile(jsonOutputPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[MultiLocationReadiness] wrote json artifact: ${jsonOutputPath}`);
    }
    process.exit(blockingTenantCount === 0 ? 0 : 1);
  } catch (error) {
    console.error(`[MultiLocationReadiness] failed: ${error.message}`);
    process.exit(1);
  } finally {
    try { await tenantConnector.closeAll(); } catch (error) { console.warn(`[MultiLocationReadiness] tenant close warning: ${error.message}`); }
    try { await landlordSequelize.close(); } catch (error) { console.warn(`[MultiLocationReadiness] landlord close warning: ${error.message}`); }
  }
};

run();
