'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});

const createIfMissing = async (queryInterface, name, definition) => {
  if (!await queryInterface.describeTable(name).catch(() => null)) {
    await queryInterface.createTable(name, definition);
  }
};

const addIndexIfMissing = async (queryInterface, table, fields, options) => {
  const indexes = await queryInterface.showIndex(table).catch(() => []);
  if (!indexes.some((index) => index.name === options.name)) {
    await queryInterface.addIndex(table, fields, options);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await createIfMissing(queryInterface, 'company_registration_drafts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      dgfy_account_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'dgfy_accounts', key: 'id' }, onDelete: 'RESTRICT' },
      registration_email_snapshot: { type: Sequelize.STRING(255), allowNull: false },
      status: { type: Sequelize.ENUM('draft', 'pending_review', 'approved', 'rejected', 'abandoned'), allowNull: false, defaultValue: 'draft' },
      current_step: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      draft_payload: { type: Sequelize.JSON, allowNull: false },
      submission_snapshot: { type: Sequelize.JSON, allowNull: true },
      legal_terms_snapshot: { type: Sequelize.JSON, allowNull: true },
      optimistic_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize)
    });
    await addIndexIfMissing(queryInterface, 'company_registration_drafts', ['dgfy_account_id', 'status'], {
      name: 'idx_registration_draft_owner_status'
    });
    await addIndexIfMissing(queryInterface, 'company_registration_drafts', ['dgfy_account_id', 'updated_at'], {
      name: 'idx_registration_draft_owner_updated'
    });

    // `company_registration_uploads` is owned by the established application
    // upload migration. The draft pipeline extends that shared table in the
    // later `20261008000001-extend-company-registration-uploads-for-drafts`
    // migration so the two registration flows do not race to create
    // incompatible versions of the same table.
  },

  async down(queryInterface) {
    await queryInterface.dropTable('company_registration_drafts').catch(() => {});
  }
};
