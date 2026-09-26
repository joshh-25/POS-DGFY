'use strict';

// Phase 346. Durable, tenant-local POS device enrollment and one-use
// activation/challenge state. The migration runner is connected to the
// landlord database, so the additive DDL is fanned out to the landlord
// connection and every active tenant database. No private key, raw activation
// code, challenge, or request signature is persisted by this schema.

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const TABLES = [
  'pos_terminal_device_enrollments',
  'pos_terminal_device_activations',
  'pos_terminal_device_challenges'
];

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return rows?.[0]?.dbName || null;
};

const tableExists = async (queryInterface, databaseName, tableName) => {
  const [rows] = await queryInterface.sequelize.query(
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    { replacements: [databaseName, tableName] }
  );
  return Number(rows?.[0]?.count || 0) > 0;
};

const getActiveTenantDatabaseNames = async (queryInterface, currentDatabaseName) => {
  if (!(await tableExists(queryInterface, currentDatabaseName, 'tenants'))) return [];
  const [rows] = await queryInterface.sequelize.query(
    "SELECT DISTINCT db_name FROM tenants WHERE status = 'active' AND db_name IS NOT NULL AND db_name <> ''"
  );
  return rows.map((row) => String(row?.db_name || '').trim()).filter(Boolean);
};

const tableDefinitions = {
  pos_terminal_device_enrollments: `
    CREATE TABLE IF NOT EXISTS %TABLE% (
      \`pos_terminal_device_enrollment_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`device_id\` VARCHAR(160) NOT NULL,
      \`public_key\` LONGTEXT NOT NULL,
      \`key_algorithm\` VARCHAR(24) NOT NULL DEFAULT 'ES256',
      \`client_type\` VARCHAR(40) NOT NULL,
      \`terminal_id\` VARCHAR(100) NOT NULL,
      \`location_id\` INT UNSIGNED NOT NULL,
      \`status\` ENUM('active','revoked','replaced') NOT NULL DEFAULT 'active',
      \`version\` INT UNSIGNED NOT NULL DEFAULT 1,
      \`enrolled_by\` INT UNSIGNED NULL,
      \`enrolled_at\` DATETIME NOT NULL,
      \`last_seen_at\` DATETIME NULL,
      \`revoked_by\` INT UNSIGNED NULL,
      \`revoked_at\` DATETIME NULL,
      \`revoked_reason\` VARCHAR(500) NULL,
      \`replaced_by\` INT UNSIGNED NULL,
      \`active_terminal_key\` VARCHAR(100) NULL,
      \`active_device_key\` VARCHAR(160) NULL,
      \`metadata\` LONGTEXT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`pos_terminal_device_enrollment_id\`),
      UNIQUE KEY \`uq_pos_terminal_device_enrollments_active_terminal\` (\`active_terminal_key\`),
      UNIQUE KEY \`uq_pos_terminal_device_enrollments_active_device\` (\`active_device_key\`),
      KEY \`idx_pos_terminal_device_enrollments_device_status\` (\`device_id\`,\`status\`),
      KEY \`idx_pos_terminal_device_enrollments_terminal_status\` (\`terminal_id\`,\`status\`),
      KEY \`idx_pos_terminal_device_enrollments_location_status\` (\`location_id\`,\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `,
  pos_terminal_device_activations: `
    CREATE TABLE IF NOT EXISTS %TABLE% (
      \`pos_terminal_device_activation_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`activation_hash\` CHAR(64) NOT NULL,
      \`terminal_id\` VARCHAR(100) NOT NULL,
      \`location_id\` INT UNSIGNED NOT NULL,
      \`issued_by\` INT UNSIGNED NOT NULL,
      \`issued_reason\` VARCHAR(500) NOT NULL,
      \`expires_at\` DATETIME NOT NULL,
      \`consumed_at\` DATETIME NULL,
      \`consumed_by_device_id\` VARCHAR(160) NULL,
      \`metadata\` LONGTEXT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`pos_terminal_device_activation_id\`),
      UNIQUE KEY \`uq_pos_terminal_device_activations_hash\` (\`activation_hash\`),
      KEY \`idx_pos_terminal_device_activations_terminal_expiry\` (\`terminal_id\`,\`expires_at\`),
      KEY \`idx_pos_terminal_device_activations_consumed_at\` (\`consumed_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `,
  pos_terminal_device_challenges: `
    CREATE TABLE IF NOT EXISTS %TABLE% (
      \`pos_terminal_device_challenge_id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`challenge_hash\` CHAR(64) NOT NULL,
      \`device_id\` VARCHAR(160) NOT NULL,
      \`terminal_id\` VARCHAR(100) NOT NULL,
      \`location_id\` INT UNSIGNED NOT NULL,
      \`purpose\` VARCHAR(40) NOT NULL,
      \`request_path\` VARCHAR(255) NOT NULL,
      \`request_method\` VARCHAR(12) NOT NULL DEFAULT 'POST',
      \`session_id\` VARCHAR(128) NOT NULL,
      \`expires_at\` DATETIME NOT NULL,
      \`consumed_at\` DATETIME NULL,
      \`consumed_request_id\` VARCHAR(120) NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`pos_terminal_device_challenge_id\`),
      UNIQUE KEY \`uq_pos_terminal_device_challenges_hash\` (\`challenge_hash\`),
      KEY \`idx_pos_terminal_device_challenges_device_expiry\` (\`device_id\`,\`expires_at\`),
      KEY \`idx_pos_terminal_device_challenges_terminal_expiry\` (\`terminal_id\`,\`expires_at\`),
      KEY \`idx_pos_terminal_device_challenges_consumed_at\` (\`consumed_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `
};

const databasesForMigration = async (queryInterface) => {
  const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
  if (!currentDatabaseName) return [];
  const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);
  return [...new Set([currentDatabaseName, ...tenantDatabaseNames])];
};

module.exports = {
  async up(queryInterface) {
    const databases = await databasesForMigration(queryInterface);
    for (const databaseName of databases) {
      for (const tableName of TABLES) {
        const sql = tableDefinitions[tableName].replace('%TABLE%', `${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`);
        await queryInterface.sequelize.query(sql);
      }
    }
  },

  async down(queryInterface) {
    const databases = await databasesForMigration(queryInterface);
    for (const databaseName of databases) {
      for (const tableName of [...TABLES].reverse()) {
        if (!(await tableExists(queryInterface, databaseName, tableName))) continue;
        await queryInterface.sequelize.query(
          `DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`
        );
      }
    }
  }
};
