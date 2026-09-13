'use strict';

// Additive link for native delivery staff. This is a pure schema change; rollback drops only the
// new nullable column and never changes existing courier rows beyond removing that empty link.
const SAFE = /^[A-Za-z0-9_-]+$/;
const quote = (value) => {
  const normalized = String(value || '').trim();
  if (!SAFE.test(normalized)) throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${normalized}\``;
};
const currentDb = async (qi) => {
  const [rows] = await qi.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};
const tableExists = async (qi, db, table) => {
  const [rows] = await qi.sequelize.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', { replacements: [db, table] });
  return Number(rows?.[0]?.count || 0) > 0;
};
const columnExists = async (qi, db, table, column) => {
  const [rows] = await qi.sequelize.query('SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', { replacements: [db, table, column] });
  return Number(rows?.[0]?.count || 0) > 0;
};
const targetDatabases = async (qi) => {
  const landlord = await currentDb(qi);
  const names = new Set([landlord]);
  if (await tableExists(qi, landlord, 'tenants')) {
    const [rows] = await qi.sequelize.query("SELECT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''");
    rows.forEach((row) => { const db = String(row?.db_name || '').trim(); if (SAFE.test(db)) names.add(db); });
  }
  return [...names].filter(Boolean);
};

module.exports = {
  async up(queryInterface) {
    for (const db of await targetDatabases(queryInterface)) {
      if (!(await tableExists(queryInterface, db, 'delivery_personnel')) || !(await tableExists(queryInterface, db, 'users'))) continue;
      if (!(await columnExists(queryInterface, db, 'delivery_personnel', 'user_id'))) {
        const q = quote(db);
        await queryInterface.sequelize.query(`ALTER TABLE ${q}.\`delivery_personnel\` ADD COLUMN \`user_id\` INT NULL, ADD KEY \`delivery_personnel_user_id_idx\` (\`user_id\`), ADD CONSTRAINT \`delivery_personnel_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES ${q}.\`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE RESTRICT`);
      }
    }
  },
  async down(queryInterface) {
    for (const db of await targetDatabases(queryInterface)) {
      if (await columnExists(queryInterface, db, 'delivery_personnel', 'user_id')) {
        const q = quote(db);
        await queryInterface.sequelize.query(`ALTER TABLE ${q}.\`delivery_personnel\` DROP FOREIGN KEY \`delivery_personnel_user_id_fk\`, DROP KEY \`delivery_personnel_user_id_idx\`, DROP COLUMN \`user_id\``);
      }
    }
  }
};
