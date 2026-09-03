// DGFY landlord tables for the DGLaundry provider contract.
// These records contain identifiers and sanitized intent metadata only; no
// DGLaundry runtime data, passwords, refresh tokens, or private keys are stored.
const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return (tables || []).some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!await tableExists(queryInterface, 'dgfy_dglaundry_intents')) {
            await queryInterface.createTable('dgfy_dglaundry_intents', {
                id: { type: Sequelize.UUID, primaryKey: true },
                intent_type: { type: Sequelize.ENUM('registration', 'location', 'staff_invitation'), allowNull: false },
                idempotency_key: { type: Sequelize.STRING(160), allowNull: false, unique: true },
                dgfy_account_id: { type: Sequelize.UUID, allowNull: true },
                tenant_id: { type: Sequelize.UUID, allowNull: true },
                payload: { type: Sequelize.JSON, allowNull: false },
                status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'expired', 'consumed'), allowNull: false, defaultValue: 'pending' },
                expires_at: { type: Sequelize.DATE, allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('dgfy_dglaundry_intents', ['intent_type', 'status'], { name: 'idx_dglaundry_intents_type_status' });
            await queryInterface.addIndex('dgfy_dglaundry_intents', ['tenant_id', 'created_at'], { name: 'idx_dglaundry_intents_tenant_time' });
        }

        if (!await tableExists(queryInterface, 'dgfy_dglaundry_mappings')) {
            await queryInterface.createTable('dgfy_dglaundry_mappings', {
                id: { type: Sequelize.UUID, primaryKey: true },
                issuer: { type: Sequelize.STRING(255), allowNull: false },
                subject: { type: Sequelize.STRING(255), allowNull: false },
                dgfy_company_id: { type: Sequelize.UUID, allowNull: false },
                dgfy_location_id: { type: Sequelize.STRING(160), allowNull: true },
                dglaundry_organization_id: { type: Sequelize.STRING(160), allowNull: false },
                dglaundry_branch_id: { type: Sequelize.STRING(160), allowNull: true },
                status: { type: Sequelize.ENUM('active', 'revoked'), allowNull: false, defaultValue: 'active' },
                mapping_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
                approved_by: { type: Sequelize.STRING(160), allowNull: false },
                approved_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
                updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('dgfy_dglaundry_mappings', ['issuer', 'subject', 'dgfy_company_id', 'dgfy_location_id'], { unique: true, name: 'uq_dglaundry_mapping_identity' });
            await queryInterface.addIndex('dgfy_dglaundry_mappings', ['dglaundry_organization_id', 'dglaundry_branch_id'], { unique: true, name: 'uq_dglaundry_mapping_target' });
        }

        if (!await tableExists(queryInterface, 'dgfy_dglaundry_audit_logs')) {
            await queryInterface.createTable('dgfy_dglaundry_audit_logs', {
                id: { type: Sequelize.UUID, primaryKey: true },
                action: { type: Sequelize.STRING(80), allowNull: false },
                dgfy_account_id: { type: Sequelize.UUID, allowNull: true },
                dgfy_company_id: { type: Sequelize.UUID, allowNull: true },
                metadata: { type: Sequelize.JSON, allowNull: false },
                created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
            });
            await queryInterface.addIndex('dgfy_dglaundry_audit_logs', ['action', 'created_at'], { name: 'idx_dglaundry_audit_action_time' });
        }
    },

    async down(queryInterface) {
        for (const table of ['dgfy_dglaundry_audit_logs', 'dgfy_dglaundry_mappings', 'dgfy_dglaundry_intents']) {
            if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
        }
    }
};
