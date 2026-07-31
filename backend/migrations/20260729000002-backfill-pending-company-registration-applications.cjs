'use strict';

const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const [tenants] = await queryInterface.sequelize.query(`
        SELECT t.id, t.name, t.admin_email, t.owner_dgfy_account_id, t.settings, t.created_at
        FROM tenants t
        LEFT JOIN company_registration_applications a ON a.tenant_id = t.id
        WHERE t.status = 'pending'
          AND t.provisioning_source = 'public_registration'
          AND t.owner_dgfy_account_id IS NOT NULL
          AND t.admin_email IS NOT NULL
          AND a.id IS NULL
      `, { transaction });

      for (const tenant of tenants) {
        const applicationId = randomUUID();
        const settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings || '{}') : (tenant.settings || {});
        const now = new Date();
        await queryInterface.bulkInsert('company_registration_applications', [{
          id: applicationId,
          tenant_id: tenant.id,
          dgfy_account_id: tenant.owner_dgfy_account_id,
          registration_email_snapshot: tenant.admin_email,
          current_attempt_no: 1,
          review_status: 'pending',
          provisioning_status: 'not_started',
          optimistic_version: 1,
          created_at: tenant.created_at || now,
          updated_at: now
        }], { transaction });
        await queryInterface.bulkInsert('company_registration_attempts', [{
          application_id: applicationId,
          attempt_no: 1,
          submission_snapshot: JSON.stringify({
            company_name: tenant.name,
            workflow_mode: settings.workflow_mode || null,
            industry_tag: settings.industry_tag || null,
            migration_source: 'pre_review_pending_tenant'
          }),
          legal_terms_snapshot: JSON.stringify({
            migration_source: 'pre_review_pending_tenant',
            evidence_status: 'legacy_record_not_available'
          }),
          decision: 'pending',
          submitted_at: tenant.created_at || now,
          created_at: now,
          updated_at: now
        }], { transaction });
        await queryInterface.bulkInsert('company_registration_events', [{
          application_id: applicationId,
          event_type: 'legacy_pending_backfilled',
          actor_type: 'system',
          actor_id: null,
          details: JSON.stringify({ migration: '20260729000002' }),
          created_at: now
        }], { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const [rows] = await queryInterface.sequelize.query(`
        SELECT DISTINCT application_id
        FROM company_registration_events
        WHERE event_type = 'legacy_pending_backfilled'
      `, { transaction });
      const ids = rows.map((row) => row.application_id);
      if (ids.length) {
        await queryInterface.bulkDelete('company_registration_email_deliveries', { application_id: ids }, { transaction });
        await queryInterface.bulkDelete('company_registration_events', { application_id: ids }, { transaction });
        await queryInterface.bulkDelete('company_registration_attempts', { application_id: ids }, { transaction });
        await queryInterface.bulkDelete('company_registration_applications', { id: ids }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
