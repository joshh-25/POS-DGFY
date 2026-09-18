'use strict';

// #1462: first-class, tenant-local proof-of-delivery evidence. The parent row is a
// one-per-delivery-job record; child rows are staff-captured images and the parent
// carries the optional recipient-supplied signature. This migration fans out across
// active tenant databases because the delivery tables are tenant-owned.
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;
const PARENT_TABLE = 'delivery_completion_evidence';
const IMAGE_TABLE = 'delivery_completion_evidence_images';

const quoteIdentifier = (identifier) => {
  const normalized = String(identifier || '').trim();
  if (!SAFE_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `\`${normalized}\``;
};

const getCurrentDatabaseName = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query('SELECT DATABASE() AS dbName');
  return String(rows?.[0]?.dbName || '').trim();
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
  return rows.map((row) => String(row?.db_name || '').trim()).filter((name) => SAFE_IDENTIFIER_PATTERN.test(name));
};

const createParentTable = (databaseName) => `
  CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(PARENT_TABLE)} (
    ${quoteIdentifier('delivery_completion_evidence_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('delivery_job_id')} INT NOT NULL,
    ${quoteIdentifier('signature_file_path')} VARCHAR(800) NULL,
    ${quoteIdentifier('signature_mime_type')} VARCHAR(120) NULL,
    ${quoteIdentifier('signature_file_size_bytes')} BIGINT NULL,
    ${quoteIdentifier('signature_sha256')} CHAR(64) NULL,
    ${quoteIdentifier('attached_by')} INT NULL,
    ${quoteIdentifier('attached_at')} DATETIME NOT NULL,
    ${quoteIdentifier('created_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ${quoteIdentifier('updated_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (${quoteIdentifier('delivery_completion_evidence_id')}),
    UNIQUE KEY ${quoteIdentifier('uq_delivery_completion_evidence_job')} (${quoteIdentifier('delivery_job_id')}),
    CONSTRAINT ${quoteIdentifier('fk_delivery_completion_evidence_job')} FOREIGN KEY (${quoteIdentifier('delivery_job_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('delivery_jobs')} (${quoteIdentifier('delivery_job_id')}) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT ${quoteIdentifier('fk_delivery_completion_evidence_attached_by')} FOREIGN KEY (${quoteIdentifier('attached_by')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier('users')} (${quoteIdentifier('user_id')}) ON DELETE SET NULL ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

const createImageTable = (databaseName) => `
  CREATE TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(IMAGE_TABLE)} (
    ${quoteIdentifier('delivery_completion_evidence_image_id')} INT NOT NULL AUTO_INCREMENT,
    ${quoteIdentifier('delivery_completion_evidence_id')} INT NOT NULL,
    ${quoteIdentifier('file_path')} VARCHAR(800) NOT NULL,
    ${quoteIdentifier('mime_type')} VARCHAR(120) NOT NULL,
    ${quoteIdentifier('file_size_bytes')} BIGINT NOT NULL,
    ${quoteIdentifier('sha256')} CHAR(64) NOT NULL,
    ${quoteIdentifier('sort_order')} INT NOT NULL DEFAULT 0,
    ${quoteIdentifier('created_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ${quoteIdentifier('updated_at')} DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (${quoteIdentifier('delivery_completion_evidence_image_id')}),
    KEY ${quoteIdentifier('idx_delivery_completion_evidence_images_parent')} (${quoteIdentifier('delivery_completion_evidence_id')}),
    CONSTRAINT ${quoteIdentifier('fk_delivery_completion_evidence_images_parent')} FOREIGN KEY (${quoteIdentifier('delivery_completion_evidence_id')}) REFERENCES ${quoteIdentifier(databaseName)}.${quoteIdentifier(PARENT_TABLE)} (${quoteIdentifier('delivery_completion_evidence_id')}) ON DELETE CASCADE ON UPDATE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
`;

module.exports = {
  async up(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      const hasDeliveryJobs = await tableExists(queryInterface, databaseName, 'delivery_jobs');
      const hasUsers = await tableExists(queryInterface, databaseName, 'users');
      if (!hasDeliveryJobs || !hasUsers) continue;

      if (!(await tableExists(queryInterface, databaseName, PARENT_TABLE))) {
        await queryInterface.sequelize.query(createParentTable(databaseName));
      }
      if (!(await tableExists(queryInterface, databaseName, IMAGE_TABLE))) {
        await queryInterface.sequelize.query(createImageTable(databaseName));
      }
    }
  },

  async down(queryInterface) {
    const currentDatabaseName = await getCurrentDatabaseName(queryInterface);
    if (!currentDatabaseName) return;
    const tenantDatabaseNames = await getActiveTenantDatabaseNames(queryInterface, currentDatabaseName);

    for (const databaseName of [...new Set([currentDatabaseName, ...tenantDatabaseNames])]) {
      if (await tableExists(queryInterface, databaseName, IMAGE_TABLE)) {
        await queryInterface.sequelize.query(`DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(IMAGE_TABLE)}`);
      }
      if (await tableExists(queryInterface, databaseName, PARENT_TABLE)) {
        await queryInterface.sequelize.query(`DROP TABLE ${quoteIdentifier(databaseName)}.${quoteIdentifier(PARENT_TABLE)}`);
      }
    }
  }
};
