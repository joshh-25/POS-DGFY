'use strict';

// Phase 527 (#2667). Tenant-local additive delivery schema. Widening the ENUM is
// deliberately retained on rollback: narrowing it after orders use the new value
// would destroy data. Apply this migration before deploying the matching API.
const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/;
const quote = (value) => {
  if (!SAFE_IDENTIFIER.test(String(value || ''))) throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${value}\``;
};
const queryRows = async (queryInterface, sql, replacements = []) => {
  const [rows] = await queryInterface.sequelize.query(sql, { replacements });
  return rows;
};
const exists = async (queryInterface, database, table) => {
  const rows = await queryRows(queryInterface,
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [database, table]);
  return Number(rows?.[0]?.count || 0) > 0;
};
const column = async (queryInterface, database, table, name) => {
  const rows = await queryRows(queryInterface,
    'SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [database, table, name]);
  return rows?.[0] || null;
};
const tenants = async (queryInterface) => {
  const current = (await queryRows(queryInterface, 'SELECT DATABASE() AS dbName'))?.[0]?.dbName;
  if (!current) return [];
  if (!(await exists(queryInterface, current, 'tenants'))) return [current];
  const rows = await queryRows(queryInterface,
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''");
  return [...new Set([current, ...rows.map((row) => row.db_name).filter(Boolean)])];
};
const newColumns = Object.freeze({
  courier_service: 'VARCHAR(40) NULL',
  courier_service_name: 'VARCHAR(120) NULL',
  courier_reference: 'VARCHAR(120) NULL'
});

module.exports = {
  async up(queryInterface) {
    for (const database of await tenants(queryInterface)) {
      if (await exists(queryInterface, database, 'delivery_jobs')) {
        for (const [name, definition] of Object.entries(newColumns)) {
          if (await column(queryInterface, database, 'delivery_jobs', name)) continue;
          await queryInterface.sequelize.query(
            `ALTER TABLE ${quote(database)}.\`delivery_jobs\` ADD COLUMN ${quote(name)} ${definition}`);
        }
      }
      if (!(await exists(queryInterface, database, 'pos_transactions'))) continue;
      const info = await column(queryInterface, database, 'pos_transactions', 'fulfillment_status');
      if (!info || String(info.columnType).includes("'ready_for_rider'")) continue;
      const values = [...String(info.columnType).matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1].replace(/''/g, "'"));
      if (!/^enum\(/i.test(String(info.columnType)) || !values.length) throw new Error('Unexpected fulfillment_status column type');
      const position = values.indexOf('packed');
      values.splice(position < 0 ? values.length : position + 1, 0, 'ready_for_rider');
      const defaultClause = info.columnDefault == null
        ? (info.isNullable === 'YES' ? 'DEFAULT NULL' : '')
        : `DEFAULT '${String(info.columnDefault).replace(/'/g, "''")}'`;
      await queryInterface.sequelize.query(
        `ALTER TABLE ${quote(database)}.\`pos_transactions\` MODIFY COLUMN \`fulfillment_status\` ENUM(${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(',')}) ${info.isNullable === 'YES' ? 'NULL' : 'NOT NULL'} ${defaultClause}`);
    }
  },
  // Nullable courier fields and the widened ENUM are intentionally retained on
  // rollback so older application code can still read in-flight orders safely.
  async down() {}
};
