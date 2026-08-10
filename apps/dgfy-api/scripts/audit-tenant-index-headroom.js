import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const DEFAULT_WARN_THRESHOLD = 56;
const DEFAULT_CRITICAL_THRESHOLD = 64;

const toInt = (value, fallback) => {
  const normalized = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(normalized) ? normalized : fallback;
};

const parseArgs = (argv = process.argv.slice(2)) => {
    const options = {
        reportFile: '',
        warnThreshold: DEFAULT_WARN_THRESHOLD,
        criticalThreshold: DEFAULT_CRITICAL_THRESHOLD,
        strict: false,
        includeInactive: false,
        printJson: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report-file') {
      options.reportFile = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--warn-threshold') {
      options.warnThreshold = toInt(argv[i + 1], DEFAULT_WARN_THRESHOLD);
      i += 1;
      continue;
    }
    if (arg === '--critical-threshold') {
      options.criticalThreshold = toInt(argv[i + 1], DEFAULT_CRITICAL_THRESHOLD);
      i += 1;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--include-inactive') {
      options.includeInactive = true;
      continue;
    }
    if (arg === '--print-json') {
      options.printJson = true;
    }
  }

  if (options.warnThreshold < 1) options.warnThreshold = DEFAULT_WARN_THRESHOLD;
  if (options.criticalThreshold < 1) options.criticalThreshold = DEFAULT_CRITICAL_THRESHOLD;
  if (options.warnThreshold >= options.criticalThreshold) {
    options.warnThreshold = Math.max(1, options.criticalThreshold - 1);
  }

  return options;
};

const quoteId = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const baseIndexName = (indexName) => {
  const match = String(indexName || '').match(/^(.+)_([0-9]+)$/);
  return match ? match[1] : String(indexName || '');
};

export const normalizeIndexRows = (rows = []) => {
  const byIndex = new Map();
  for (const row of rows) {
    const indexName = String(row.INDEX_NAME || '');
    const tableName = String(row.TABLE_NAME || '');
    const key = `${tableName}||${indexName}`;
    if (!byIndex.has(key)) {
      byIndex.set(key, {
        table_name: tableName,
        index_name: indexName,
        non_unique: Number(row.NON_UNIQUE ?? 1),
        index_type: String(row.INDEX_TYPE || 'BTREE').toUpperCase(),
        columns: []
      });
    }

    byIndex.get(key).columns.push({
      seq_in_index: Number(row.SEQ_IN_INDEX ?? 0),
      column_name: String(row.COLUMN_NAME || ''),
      sub_part: row.SUB_PART == null ? null : Number(row.SUB_PART),
      collation: row.COLLATION == null ? null : String(row.COLLATION)
    });
  }

  const indexes = [...byIndex.values()].map((index) => ({
    ...index,
    columns: index.columns
      .sort((a, b) => a.seq_in_index - b.seq_in_index)
      .map((column) => ({
        column_name: column.column_name,
        sub_part: column.sub_part,
        collation: column.collation
      }))
  }));

  indexes.forEach((index) => {
    const columnSignature = index.columns
      .map((column) => `${column.column_name}:${column.sub_part ?? ''}:${column.collation ?? ''}`)
      .join('|');
    index.signature = [
      index.non_unique === 0 ? 'UNIQUE' : 'INDEX',
      index.index_type,
      columnSignature
    ].join('::');
  });

  return indexes;
};

const classifyTable = ({ indexCount, warnThreshold, criticalThreshold }) => {
  if (indexCount >= criticalThreshold) return 'critical';
  if (indexCount >= warnThreshold) return 'warning';
  return 'healthy';
};

export const buildTableRisk = ({ tableName, indexes, warnThreshold, criticalThreshold }) => {
  const indexCount = indexes.length;
  const status = classifyTable({ indexCount, warnThreshold, criticalThreshold });

  const groups = new Map();
  for (const index of indexes) {
    const entries = groups.get(index.signature) || [];
    entries.push(index);
    groups.set(index.signature, entries);
  }

  const redundantGroups = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      signature: group[0].signature,
      indexes: group
        .map((index) => index.index_name)
        .sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.indexes[0].localeCompare(b.indexes[0]));

  const numberedSuffixDuplicates = indexes
    .filter((index) => /_[0-9]+$/.test(index.index_name))
    .map((index) => ({
      index_name: index.index_name,
      base_index_name: baseIndexName(index.index_name)
    }))
    .sort((a, b) => a.index_name.localeCompare(b.index_name));

  return {
    table_name: tableName,
    status,
    index_count: indexCount,
    headroom_to_limit: Math.max(0, criticalThreshold - indexCount),
    redundant_group_count: redundantGroups.length,
    redundant_groups: redundantGroups,
    numbered_suffix_duplicates: numberedSuffixDuplicates
  };
};

const addSummary = (summary, tenantReport) => {
  summary.tenants_total += 1;
  if (tenantReport.status === 'failed') {
    summary.tenants_failed += 1;
    return;
  }

  summary.tenants_healthy += 1;
  summary.tables_total += tenantReport.tables_total;
  summary.tables_warning += tenantReport.tables_warning;
  summary.tables_critical += tenantReport.tables_critical;
  summary.tables_with_redundant_indexes += tenantReport.tables_with_redundant_indexes;
  summary.redundant_groups_total += tenantReport.redundant_groups_total;
};

const fetchTenantRows = async ({ connection, landlordDb, includeInactive }) => {
  const whereClause = includeInactive ? '' : "WHERE status = 'active'";
  const [rows] = await connection.query(
    `SELECT id, name, db_name, status FROM ${quoteId(landlordDb)}.tenants ${whereClause}`
  );
  return rows;
};

const fetchTableNames = async ({ connection, dbName }) => {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME
       FROM information_schema.tables
      WHERE table_schema = ? AND table_type = 'BASE TABLE'
      ORDER BY TABLE_NAME ASC`,
    [dbName]
  );
  return rows.map((row) => String(row.TABLE_NAME));
};

const fetchIndexRows = async ({ connection, dbName, tableName }) => {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, COLLATION
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ?
      ORDER BY INDEX_NAME ASC, SEQ_IN_INDEX ASC`,
    [dbName, tableName]
  );
  return rows;
};

const inspectTenant = async ({
  connection,
  tenant,
  warnThreshold,
  criticalThreshold
}) => {
  try {
    const tableNames = await fetchTableNames({ connection, dbName: tenant.db_name });
    const tableRisks = [];

    for (const tableName of tableNames) {
      const indexRows = await fetchIndexRows({
        connection,
        dbName: tenant.db_name,
        tableName
      });
      const indexes = normalizeIndexRows(indexRows);
      tableRisks.push(
        buildTableRisk({
          tableName,
          indexes,
          warnThreshold,
          criticalThreshold
        })
      );
    }

    const tablesWarning = tableRisks.filter((row) => row.status === 'warning').length;
    const tablesCritical = tableRisks.filter((row) => row.status === 'critical').length;
    const tablesWithRedundantIndexes = tableRisks.filter((row) => row.redundant_group_count > 0).length;
    const redundantGroupsTotal = tableRisks.reduce(
      (total, row) => total + row.redundant_group_count,
      0
    );

    return {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_db: tenant.db_name,
      tenant_status: tenant.status,
      status: 'ok',
      tables_total: tableRisks.length,
      tables_warning: tablesWarning,
      tables_critical: tablesCritical,
      tables_with_redundant_indexes: tablesWithRedundantIndexes,
      redundant_groups_total: redundantGroupsTotal,
      tables: tableRisks
    };
  } catch (error) {
    return {
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      tenant_db: tenant.db_name,
      tenant_status: tenant.status,
      status: 'failed',
      error_message: String(error?.message || error)
    };
  }
};

const buildOverallStatus = (summary) => {
  if (summary.tenants_failed > 0 || summary.tables_critical > 0) return 'degraded';
  if (summary.tables_warning > 0 || summary.tables_with_redundant_indexes > 0) return 'warning';
  return 'healthy';
};

const writeReport = async ({ reportFile, payload }) => {
  if (!reportFile) return;
  await fs.mkdir(dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, JSON.stringify(payload, null, 2), 'utf8');
};

export async function runTenantIndexHeadroomAudit({
  reportFile = '',
  warnThreshold = DEFAULT_WARN_THRESHOLD,
  criticalThreshold = DEFAULT_CRITICAL_THRESHOLD,
  strict = false,
  includeInactive = false,
  printJson = false
} = {}) {
  const landlordDb = process.env.DB_NAME || 'sku_inventory_manager';
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  const report = {
    generated_at: new Date().toISOString(),
    landlord_db: landlordDb,
    host: process.env.DB_HOST || 'localhost',
    thresholds: {
      warn: warnThreshold,
      critical: criticalThreshold
    },
    summary: {
      tenants_total: 0,
      tenants_healthy: 0,
      tenants_failed: 0,
      tables_total: 0,
      tables_warning: 0,
      tables_critical: 0,
      tables_with_redundant_indexes: 0,
      redundant_groups_total: 0
    },
    results: []
  };

  try {
    const tenantRows = await fetchTenantRows({ connection, landlordDb, includeInactive });
    const landlordTenant = {
      id: 'landlord',
      name: 'Landlord DB',
      db_name: landlordDb,
      status: 'active'
    };
    const tenants = [landlordTenant, ...tenantRows].filter(
      (tenant, index, arr) => arr.findIndex((row) => row.db_name === tenant.db_name) === index
    );

    for (const tenant of tenants) {
      // eslint-disable-next-line no-await-in-loop
      const tenantReport = await inspectTenant({
        connection,
        tenant,
        warnThreshold,
        criticalThreshold
      });
      report.results.push(tenantReport);
      addSummary(report.summary, tenantReport);
    }
  } finally {
    await connection.end();
  }

  report.status = buildOverallStatus(report.summary);
  await writeReport({ reportFile, payload: report });

  console.log(
    `[TenantIndexHeadroom] status=${report.status} tenants=${report.summary.tenants_total} warnings=${report.summary.tables_warning} critical=${report.summary.tables_critical} redundant_groups=${report.summary.redundant_groups_total}`
  );
  if (reportFile) {
    console.log(`[TenantIndexHeadroom] report_file=${reportFile}`);
  }
  if (printJson) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (strict && report.status !== 'healthy') {
    process.exitCode = 1;
  }

  return report;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const options = parseArgs();
  runTenantIndexHeadroomAudit(options).catch((error) => {
    console.error(`[TenantIndexHeadroom] fatal: ${error.message}`);
    process.exit(1);
  });
}
