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
                'security_sensitive_action',
                'security_signal'
            ),
            allowNull: false
        });
    },

    async down(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('tenant_compliance_audit_logs').catch(() => ({}));
        if (!tableInfo || Object.keys(tableInfo).length === 0) {
            return;
        }

        await queryInterface.sequelize.query(`
            UPDATE tenant_compliance_audit_logs
            SET event_type = 'preflight_evaluation'
            WHERE event_type = 'security_signal'
        `).catch(() => null);

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
        }).catch(() => null);
    }
};

