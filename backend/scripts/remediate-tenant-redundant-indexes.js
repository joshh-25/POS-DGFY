import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { runTenantIndexHeadroomAudit } from './audit-tenant-index-headroom.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const quoteId = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;

const parseArgs = (argv = process.argv.slice(2)) => {
  const options = {
    reportFile: '',
    sqlFile: '',
    apply: false,
    yes: false,
    tenantDb: '',
    maxDropsPerTable: 10,
    warnThreshold: 56,
    criticalThreshold: 64
  };

  const toInt = (value, fallback) => {
    const normalized = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isInteger(normalized) ? normalized : fallback;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report-file') {
      options.reportFile = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--sql-file') {
      options.sqlFile = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--tenant-db') {
      options.tenantDb = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--max-drops-per-table') {
      options.maxDropsPerTable = toInt(argv[i + 1], options.maxDropsPerTable);
      i += 1;
      continue;
    }
    if (arg === '--warn-threshold') {
      options.warnThreshold = toInt(argv[i + 1], options.warnThreshold);
      i += 1;
      continue;
    }
    if (arg === '--critical-threshold') {
      options.criticalThreshold = toInt(argv[i + 1], options.criticalThreshold);
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--yes') {
      options.yes = true;
    }
  }

  if (options.maxDropsPerTable < 1) options.maxDropsPerTable = 1;
  return options;
};

const pickKeeper = (indexNames) => {
  if (indexNames.includes('PRIMARY')) return 'PRIMARY';
  const sorted = [...indexNames].sort((a, b) => {
    const aHasSuffix = /_[0-9]+$/.test(a) ? 1 : 0;
    const bHasSuffix = /_[0-9]+$/.test(b) ? 1 : 0;
    if (aHasSuffix !== bHasSuffix) return aHasSuffix - bHasSuffix;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return sorted[0];
};

const buildPlan = ({ auditReport, tenantDbFilter, maxDropsPerTable }) => {
  const plan = {
    generated_at: new Date().toISOString(),
    tenant_filter: tenantDbFilter || null,
    max_drops_per_table: maxDropsPerTable,
    tenants: [],
    totals: {
      tables_considered: 0,
      drop_statements: 0
    }
  };

  for (const tenant of auditReport.results || []) {
    if (tenant.status !== 'ok') continue;
    if (tenantDbFilter && tenant.tenant_db !== tenantDbFilter) continue;

    const tenantPlan = {
      tenant_db: tenant.tenant_db,
      tenant_name: tenant.tenant_name,
      tables: []
    };

    for (const table of tenant.tables || []) {
      if (!Array.isArray(table.redundant_groups) || table.redundant_groups.length === 0) continue;
      plan.totals.tables_considered += 1;

      const drops = [];
      for (const group of table.redundant_groups) {
        const keeper = pickKeeper(group.indexes || []);
        const dropIndexes = (group.indexes || []).filter(
          (indexName) => indexName !== keeper && indexName !== 'PRIMARY'
        );
        for (const indexName of dropIndexes) {
          drops.push({
            index_name: indexName,
            keep_index_name: keeper
          });
        }
      }

      if (drops.length > maxDropsPerTable) {
        drops.splice(maxDropsPerTable);
      }
      if (drops.length === 0) continue;

      tenantPlan.tables.push({
        table_name: table.table_name,
        drops
      });
      plan.totals.drop_statements += drops.length;
    }

    if (tenantPlan.tables.length > 0) {
      plan.tenants.push(tenantPlan);
    }
  }

  return plan;
};

const indexTypeKeyword = (indexType, nonUnique) => {
  const normalized = String(indexType || 'BTREE').toUpperCase();
  if (normalized === 'FULLTEXT') return 'FULLTEXT INDEX';
  if (normalized === 'SPATIAL') return 'SPATIAL INDEX';
  if (nonUnique === 0) return 'UNIQUE INDEX';
  return 'INDEX';
};

const formatColumnList = (columns = []) =>
  columns
    .map((column) => {
      const suffix = column.sub_part == null ? '' : `(${column.sub_part})`;
      return `${quoteId(column.column_name)}${suffix}`;
    })
    .join(', ');

const buildRollbackAddClause = ({ indexMeta }) => {
  const keyword = indexTypeKeyword(indexMeta.index_type, indexMeta.non_unique);
  const usingClause =
    indexMeta.index_type && !['BTREE', 'FULLTEXT', 'SPATIAL'].includes(indexMeta.index_type)
      ? ` USING ${indexMeta.index_type}`
      : '';
  return `ADD ${keyword} ${quoteId(indexMeta.index_name)}${usingClause} (${formatColumnList(indexMeta.columns)})`;
};

const fetchIndexMetadata = async ({ connection, dbName, tableName, indexName }) => {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
       FROM information_schema.statistics
      WHERE table_schema = ? AND table_name = ? AND index_name = ?
      ORDER BY SEQ_IN_INDEX ASC`,
    [dbName, tableName, indexName]
  );
  if (!rows.length) return null;
  return {
    index_name: String(rows[0].INDEX_NAME),
    non_unique: Number(rows[0].NON_UNIQUE ?? 1),
    index_type: String(rows[0].INDEX_TYPE || 'BTREE').toUpperCase(),
    columns: rows.map((row) => ({
      column_name: String(row.COLUMN_NAME),
      sub_part: row.SUB_PART == null ? null : Number(row.SUB_PART)
    }))
  };
};

export async function runTenantRedundantIndexRemediation({
  reportFile = '',
  sqlFile = '',
  apply = false,
  yes = false,
  tenantDb = '',
  maxDropsPerTable = 10,
  warnThreshold = 56,
  criticalThreshold = 64
} = {}) {
  if (apply && !yes) {
    throw new Error('Refusing to apply without --yes confirmation.');
  }

  const auditReport = await runTenantIndexHeadroomAudit({
    reportFile: '',
    warnThreshold,
    criticalThreshold,
    strict: false,
    includeInactive: false
  });

  const plan = buildPlan({
    auditReport,
    tenantDbFilter: tenantDb,
    maxDropsPerTable
  });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  const execution = {
    generated_at: new Date().toISOString(),
    apply_mode: apply,
    statements: [],
    rollback_statements: [],
    dropped_count: 0
  };

  try {
    for (const tenantPlan of plan.tenants) {
      for (const tablePlan of tenantPlan.tables) {
        for (const drop of tablePlan.drops) {
          // eslint-disable-next-line no-await-in-loop
          const indexMeta = await fetchIndexMetadata({
            connection,
            dbName: tenantPlan.tenant_db,
            tableName: tablePlan.table_name,
            indexName: drop.index_name
          });
          if (!indexMeta) continue;

          const dropSql = `ALTER TABLE ${quoteId(tenantPlan.tenant_db)}.${quoteId(tablePlan.table_name)} DROP INDEX ${quoteId(drop.index_name)};`;
          const rollbackSql = `ALTER TABLE ${quoteId(tenantPlan.tenant_db)}.${quoteId(tablePlan.table_name)} ${buildRollbackAddClause({
            indexMeta
          })};`;

          execution.statements.push(dropSql);
          execution.rollback_statements.push(rollbackSql);

          if (apply) {
            // eslint-disable-next-line no-await-in-loop
            await connection.query(dropSql);
            execution.dropped_count += 1;
          }
        }
      }
    }
  } finally {
    await connection.end();
  }

  if (!apply) {
    execution.dropped_count = execution.statements.length;
  }

  const output = {
    ...plan,
    execution
  };

  if (reportFile) {
    await fs.mkdir(dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(output, null, 2), 'utf8');
  }

  if (sqlFile) {
    await fs.mkdir(dirname(sqlFile), { recursive: true });
    const payload = [
      '-- Generated by backend/scripts/remediate-tenant-redundant-indexes.js',
      '-- Forward statements',
      ...execution.statements,
      '',
      '-- Rollback statements',
      ...execution.rollback_statements
    ].join('\n');
    await fs.writeFile(sqlFile, payload, 'utf8');
  }

  console.log(
    `[TenantRedundantIndexRemediation] apply=${apply} drop_statements=${execution.statements.length} dropped=${execution.dropped_count}`
  );
  if (reportFile) {
    console.log(`[TenantRedundantIndexRemediation] report_file=${reportFile}`);
  }
  if (sqlFile) {
    console.log(`[TenantRedundantIndexRemediation] sql_file=${sqlFile}`);
  }
  console.log(JSON.stringify(output, null, 2));

  return output;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const options = parseArgs();
  runTenantRedundantIndexRemediation(options).catch((error) => {
    console.error(`[TenantRedundantIndexRemediation] fatal: ${error.message}`);
    process.exit(1);
  });
}
