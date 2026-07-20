module.exports = {
  async up(queryInterface, Sequelize) {
    const tenantTable = await queryInterface.describeTable('tenants');
    if (!tenantTable.owner_dgfy_account_id) {
      await queryInterface.addColumn('tenants', 'owner_dgfy_account_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'dgfy_accounts', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
    if (!tenantTable.ownership_transferred_at) {
      await queryInterface.addColumn('tenants', 'ownership_transferred_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!tenantTable.ownership_transferred_by) {
      await queryInterface.addColumn('tenants', 'ownership_transferred_by', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }
    await queryInterface.addIndex('tenants', ['owner_dgfy_account_id'], {
      name: 'idx_tenants_owner_dgfy_account_id'
    }).catch(() => {});

    const userInvitationTable = await queryInterface.describeTable('user_invitations');
    if (userInvitationTable.status) {
      await queryInterface.changeColumn('user_invitations', 'status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled', 'declined'),
        allowNull: false,
        defaultValue: 'pending'
      });
    }

    const userTable = await queryInterface.describeTable('users');
    if (userTable.invitation_status) {
      await queryInterface.changeColumn('users', 'invitation_status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled', 'declined'),
        allowNull: true
      });
    }

    const emailOtpTable = await queryInterface.describeTable('email_otps').catch(() => null);
    if (emailOtpTable?.purpose) {
      await queryInterface.changeColumn('email_otps', 'purpose', {
        type: Sequelize.ENUM(
          'company_registration',
          'tenant_user_registration',
          'invitation_acceptance',
          'email_change',
          'dgfy_account_verification',
          'dgfy_password_reset',
          'dgfy_business_step_up',
          'dgfy_legacy_link'
        ),
        allowNull: false
      });
    }

    const businessAuditTable = await queryInterface.describeTable('dgfy_account_business_audit_logs').catch(() => null);
    if (businessAuditTable?.action) {
      await queryInterface.changeColumn('dgfy_account_business_audit_logs', 'action', {
        type: Sequelize.ENUM(
          'company_switch_success',
          'company_switch_failed',
          'invitation_created',
          'invitation_accept_success',
          'invitation_accept_failed',
          'invitation_reject_success',
          'invitation_reject_failed',
          'company_leave_success',
          'company_leave_failed',
          'ownership_transfer_success',
          'ownership_transfer_failed',
          'legacy_link_completed',
          'legacy_link_failed',
          'pos_unlock_attempted',
          'pos_unlock_success',
          'pos_unlock_failed'
        ),
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const businessAuditTable = await queryInterface.describeTable('dgfy_account_business_audit_logs').catch(() => null);
    if (businessAuditTable?.action) {
      await queryInterface.changeColumn('dgfy_account_business_audit_logs', 'action', {
        type: Sequelize.ENUM(
          'company_switch_success',
          'company_switch_failed',
          'invitation_accept_success',
          'invitation_accept_failed'
        ),
        allowNull: false
      });
    }

    const emailOtpTable = await queryInterface.describeTable('email_otps').catch(() => null);
    if (emailOtpTable?.purpose) {
      await queryInterface.changeColumn('email_otps', 'purpose', {
        type: Sequelize.ENUM(
          'company_registration',
          'tenant_user_registration',
          'invitation_acceptance',
          'email_change',
          'dgfy_account_verification',
          'dgfy_password_reset',
          'dgfy_business_step_up'
        ),
        allowNull: false
      });
    }

    const userTable = await queryInterface.describeTable('users');
    if (userTable.invitation_status) {
      await queryInterface.changeColumn('users', 'invitation_status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
        allowNull: true
      });
    }

    const userInvitationTable = await queryInterface.describeTable('user_invitations');
    if (userInvitationTable.status) {
      await queryInterface.changeColumn('user_invitations', 'status', {
        type: Sequelize.ENUM('pending', 'accepted', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      });
    }

    const tenantTable = await queryInterface.describeTable('tenants');
    if (tenantTable.ownership_transferred_by) {
      await queryInterface.removeColumn('tenants', 'ownership_transferred_by');
    }
    if (tenantTable.ownership_transferred_at) {
      await queryInterface.removeColumn('tenants', 'ownership_transferred_at');
    }
    if (tenantTable.owner_dgfy_account_id) {
      await queryInterface.removeColumn('tenants', 'owner_dgfy_account_id');
    }
  }
};
