'use strict';

// Additive tenant-schema migration. The down path is a pure schema rollback that only removes
// structures created here; no existing user permission data is rewritten.
const SAFE = /^[A-Za-z0-9_-]+$/;
const quote = (value) => {
  const normalized = String(value || '').trim();
  if (!SAFE.test(normalized)) throw new Error(`Unsafe database identifier: ${value}`);
  return `\`${normalized}\``;
};

const databaseName = async (qi) => {
  const [rows] = await qi.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
};

const exists = async (qi, db, table) => {
  const [rows] = await qi.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [db, table] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const columnExists = async (qi, db, table, column) => {
  const [rows] = await qi.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    { replacements: [db, table, column] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const targets = async (qi) => {
  const landlord = await databaseName(qi);
  const databases = new Set([landlord]);
  if (await exists(qi, landlord, 'tenants')) {
    const [rows] = await qi.sequelize.query(
      "SELECT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
    );
    rows.forEach((row) => {
      const db = String(row?.db_name || '').trim();
      if (SAFE.test(db)) databases.add(db);
    });
  }
  return [...databases].filter(Boolean);
};

const migrateDatabase = async (qi, db) => {
  const qualified = quote(db);
  if (!(await exists(qi, db, 'staff_roles'))) {
    await qi.sequelize.query(`
      CREATE TABLE ${qualified}.\`staff_roles\` (
        \`staff_role_id\` INT NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(120) NOT NULL,
        \`capabilities\` JSON NOT NULL,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`created_by\` INT NULL,
        \`updated_by\` INT NULL,
        \`created_at\` DATETIME NOT NULL,
        \`updated_at\` DATETIME NOT NULL,
        PRIMARY KEY (\`staff_role_id\`),
        UNIQUE KEY \`staff_roles_name_unique\` (\`name\`),
        KEY \`staff_roles_active_idx\` (\`is_active\`),
        CONSTRAINT \`staff_roles_created_by_fk\` FOREIGN KEY (\`created_by\`) REFERENCES ${qualified}.\`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE RESTRICT,
        CONSTRAINT \`staff_roles_updated_by_fk\` FOREIGN KEY (\`updated_by\`) REFERENCES ${qualified}.\`users\` (\`user_id\`) ON DELETE SET NULL ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  if (await exists(qi, db, 'users') && !(await columnExists(qi, db, 'users', 'staff_role_id'))) {
    await qi.sequelize.query(`ALTER TABLE ${qualified}.\`users\` ADD COLUMN \`staff_role_id\` INT NULL, ADD KEY \`users_staff_role_id_idx\` (\`staff_role_id\`), ADD CONSTRAINT \`users_staff_role_id_fk\` FOREIGN KEY (\`staff_role_id\`) REFERENCES ${qualified}.\`staff_roles\` (\`staff_role_id\`) ON DELETE SET NULL ON UPDATE RESTRICT`);
  }
};

module.exports = {
  async up(queryInterface) {
    for (const db of await targets(queryInterface)) await migrateDatabase(queryInterface, db);
  },
  async down(queryInterface) {
    for (const db of await targets(queryInterface)) {
      const qualified = quote(db);
      if (await columnExists(queryInterface, db, 'users', 'staff_role_id')) {
        await queryInterface.sequelize.query(`ALTER TABLE ${qualified}.\`users\` DROP FOREIGN KEY \`users_staff_role_id_fk\`, DROP KEY \`users_staff_role_id_idx\`, DROP COLUMN \`staff_role_id\``);
      }
      if (await exists(queryInterface, db, 'staff_roles')) {
        await queryInterface.sequelize.query(`DROP TABLE ${qualified}.\`staff_roles\``);
      }
    }
  }
};
