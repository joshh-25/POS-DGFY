'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
});
const createIfMissing = async (queryInterface, name, definition) => {
  if (!await queryInterface.describeTable(name).catch(() => null)) await queryInterface.createTable(name, definition);
};
const addIndexIfMissing = async (queryInterface, table, fields, options) => {
  const indexes = await queryInterface.showIndex(table).catch(() => []);
  if (!indexes.some((index) => index.name === options.name)) await queryInterface.addIndex(table, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await createIfMissing(queryInterface, 'company_registration_applications', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false }, tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' }, onDelete: 'RESTRICT' }, dgfy_account_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'dgfy_accounts', key: 'id' }, onDelete: 'RESTRICT' }, registration_email_snapshot: { type: Sequelize.STRING(255), allowNull: false }, current_attempt_no: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }, review_status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' }, provisioning_status: { type: Sequelize.ENUM('not_started', 'in_progress', 'succeeded', 'failed'), allowNull: false, defaultValue: 'not_started' }, optimistic_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 }, ...timestamps(Sequelize)
    });
    await addIndexIfMissing(queryInterface, 'company_registration_applications', ['tenant_id'], { name: 'unique_company_registration_application_tenant', unique: true });
    await addIndexIfMissing(queryInterface, 'company_registration_applications', ['dgfy_account_id', 'review_status'], { name: 'idx_company_registration_owner_status' });
    await createIfMissing(queryInterface, 'company_registration_attempts', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true }, application_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' }, attempt_no: { type: Sequelize.INTEGER, allowNull: false }, submission_snapshot: { type: Sequelize.JSON, allowNull: false }, legal_terms_snapshot: { type: Sequelize.JSON, allowNull: false }, decision: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' }, denial_reason: { type: Sequelize.STRING(500), allowNull: true }, actor_admin_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'platform_admin_users', key: 'id' }, onDelete: 'RESTRICT' }, actor_username_snapshot: { type: Sequelize.STRING(120), allowNull: true }, decided_at: { type: Sequelize.DATE, allowNull: true }, submitted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }, ...timestamps(Sequelize)
    });
    await addIndexIfMissing(queryInterface, 'company_registration_attempts', ['application_id', 'attempt_no'], { name: 'unique_company_registration_attempt', unique: true });
    await createIfMissing(queryInterface, 'company_registration_events', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true }, application_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' }, event_type: { type: Sequelize.STRING(80), allowNull: false }, actor_type: { type: Sequelize.ENUM('applicant', 'platform_admin', 'system'), allowNull: false }, actor_id: { type: Sequelize.UUID, allowNull: true }, details: { type: Sequelize.JSON, allowNull: true }, created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await createIfMissing(queryInterface, 'company_registration_email_deliveries', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false }, application_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'company_registration_applications', key: 'id' }, onDelete: 'RESTRICT' }, event_type: { type: Sequelize.STRING(80), allowNull: false }, recipient_email_snapshot: { type: Sequelize.STRING(255), allowNull: false }, status: { type: Sequelize.ENUM('queued', 'sent_to_provider', 'failed'), allowNull: false, defaultValue: 'queued' }, provider_message_id: { type: Sequelize.STRING(255), allowNull: true }, last_error_summary: { type: Sequelize.STRING(500), allowNull: true }, sent_at: { type: Sequelize.DATE, allowNull: true }, ...timestamps(Sequelize)
    });
  },
  async down(queryInterface) {
    for (const table of ['company_registration_email_deliveries', 'company_registration_events', 'company_registration_attempts', 'company_registration_applications']) await queryInterface.dropTable(table).catch(() => {});
  }
};
