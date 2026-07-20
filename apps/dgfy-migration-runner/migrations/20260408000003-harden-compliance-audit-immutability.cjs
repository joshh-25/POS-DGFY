/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenant_compliance_audit_logs').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        await queryInterface.changeColumn('tenant_compliance_audit_logs', 'event_type', {
            type: Sequelize.ENUM(
                'mode_selection',
                'mode_upgrade',
                'mode_activation',
                'blocked_operation',
                'artifact_expiry',
                'device_mismatch',
                'preflight_evaluation',
                'security_login',
                'security_logout',
                'security_sensitive_action'
            ),
            allowNull: false
        });

        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenant_compliance_audit_logs_append_only_update');
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenant_compliance_audit_logs_append_only_delete');

        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_tenant_compliance_audit_logs_append_only_update
            BEFORE UPDATE ON tenant_compliance_audit_logs
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'tenant_compliance_audit_logs is append-only and cannot be updated';
            END
        `);

        await queryInterface.sequelize.query(`
            CREATE TRIGGER trg_tenant_compliance_audit_logs_append_only_delete
            BEFORE DELETE ON tenant_compliance_audit_logs
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'tenant_compliance_audit_logs is append-only and cannot be deleted';
            END
        `);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenant_compliance_audit_logs_append_only_update');
        await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS trg_tenant_compliance_audit_logs_append_only_delete');

        const tableInfo = await queryInterface.describeTable('tenant_compliance_audit_logs').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        await queryInterface.sequelize.query(`
            UPDATE tenant_compliance_audit_logs
            SET event_type = 'preflight_evaluation'
            WHERE event_type IN ('security_login', 'security_logout', 'security_sensitive_action')
        `).catch(() => null);

        await queryInterface.changeColumn('tenant_compliance_audit_logs', 'event_type', {
            type: Sequelize.ENUM(
                'mode_selection',
                'mode_upgrade',
                'mode_activation',
                'blocked_operation',
                'artifact_expiry',
                'device_mismatch',
                'preflight_evaluation'
            ),
            allowNull: false
        }).catch(() => null);
    }
};
