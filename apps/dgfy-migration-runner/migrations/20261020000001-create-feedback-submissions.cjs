'use strict';

const TABLE = 'feedback_submissions';

const addIndexIfMissing = async (queryInterface, fields, name, unique = false) => {
  const indexes = await queryInterface.showIndex(TABLE).catch(() => []);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(TABLE, fields, { name, unique });
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((table) => typeof table === 'object' ? table.tableName || table.name : table);
    if (names.includes(TABLE)) return;

    await queryInterface.createTable(TABLE, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      type: { type: Sequelize.STRING(32), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.ENUM('new', 'triaged', 'accepted', 'rejected', 'resolved'), allowNull: false, defaultValue: 'new' },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      reviewed_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
      review_note: { type: Sequelize.TEXT, allowNull: true },
      linked_issue_url: { type: Sequelize.STRING(2048), allowNull: true },
      surface: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'unknown' },
      client_platform: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'unknown' },
      app_version: { type: Sequelize.STRING(64), allowNull: true },
      page_url: { type: Sequelize.STRING(2048), allowNull: true },
      context_json: { type: Sequelize.JSON, allowNull: true },
      tenant_id: { type: Sequelize.UUID, allowNull: true },
      tenant_name: { type: Sequelize.STRING(255), allowNull: true },
      submitter_type: { type: Sequelize.STRING(32), allowNull: false },
      tenant_user_id: { type: Sequelize.INTEGER, allowNull: true },
      dgfy_account_id: { type: Sequelize.UUID, allowNull: true },
      submitter_name: { type: Sequelize.STRING(255), allowNull: true },
      submitter_email: { type: Sequelize.STRING(320), allowNull: true },
      contact_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      subject_type: { type: Sequelize.STRING(32), allowNull: true },
      subject_ref: { type: Sequelize.STRING(128), allowNull: true },
      subject_label: { type: Sequelize.STRING(255), allowNull: true },
      correlation_id: { type: Sequelize.STRING(128), allowNull: true },
      legacy_source_hash: { type: Sequelize.CHAR(64), allowNull: true },
      submitted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    });

    await addIndexIfMissing(queryInterface, ['submitted_at'], 'idx_feedback_submissions_submitted_at');
    await addIndexIfMissing(queryInterface, ['tenant_id', 'submitted_at'], 'idx_feedback_submissions_tenant_submitted');
    await addIndexIfMissing(queryInterface, ['type', 'submitted_at'], 'idx_feedback_submissions_type_submitted');
    await addIndexIfMissing(queryInterface, ['status', 'submitted_at'], 'idx_feedback_submissions_status_submitted');
    await addIndexIfMissing(queryInterface, ['surface', 'client_platform'], 'idx_feedback_submissions_origin');
    await addIndexIfMissing(queryInterface, ['correlation_id'], 'idx_feedback_submissions_correlation');
    await addIndexIfMissing(queryInterface, ['legacy_source_hash'], 'idx_feedback_submissions_legacy_hash', true);
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const names = tables.map((table) => typeof table === 'object' ? table.tableName || table.name : table);
    if (!names.includes(TABLE)) return;
    await queryInterface.dropTable(TABLE);
  }
};
