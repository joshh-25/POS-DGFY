'use strict';

const TABLE = 'pos_merchant_tender_reconciliations';

const normalizeTableName = (table) => typeof table === 'string'
    ? table
    : (table?.tableName || table?.TABLE_NAME || '');

const tableExists = async (queryInterface, tableName) => {
    const tables = await queryInterface.showAllTables();
    return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
    async up(queryInterface, Sequelize) {
        if (await tableExists(queryInterface, TABLE)) return;

        await queryInterface.createTable(TABLE, {
            pos_merchant_tender_reconciliation_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
            reconciliation_reference: { type: Sequelize.STRING(40), allowNull: false, unique: true },
            shift_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'pos_terminal_shifts', key: 'pos_terminal_shift_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            },
            location_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: 'tenant_locations', key: 'location_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            terminal_id: { type: Sequelize.STRING(100), allowNull: false },
            idempotency_key: { type: Sequelize.STRING(120), allowNull: false },
            request_hash: { type: Sequelize.STRING(64), allowNull: false },
            status: { type: Sequelize.ENUM('balanced', 'variance_reviewed'), allowNull: false },
            expected_breakdown: { type: Sequelize.JSON, allowNull: false },
            observed_breakdown: { type: Sequelize.JSON, allowNull: false },
            variance_breakdown: { type: Sequelize.JSON, allowNull: false },
            expected_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
            observed_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
            variance_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false },
            review_note: { type: Sequelize.STRING(500), allowNull: true },
            reviewed_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: { model: 'users', key: 'user_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            },
            reviewed_at: { type: Sequelize.DATE, allowNull: false },
            supersedes_reconciliation_id: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: { model: TABLE, key: 'pos_merchant_tender_reconciliation_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'SET NULL'
            },
            created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
            updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
        });

        await queryInterface.addIndex(TABLE, ['shift_id', 'idempotency_key'], {
            name: 'uq_pos_merchant_tender_reconciliations_shift_idempotency',
            unique: true
        });
        await queryInterface.addIndex(TABLE, ['shift_id', 'reviewed_at'], { name: 'idx_pos_merchant_tender_reconciliations_shift_reviewed' });
        await queryInterface.addIndex(TABLE, ['location_id', 'reviewed_at'], { name: 'idx_pos_merchant_tender_reconciliations_location_reviewed' });
        await queryInterface.addIndex(TABLE, ['status', 'reviewed_at'], { name: 'idx_pos_merchant_tender_reconciliations_status_reviewed' });
    },

    async down(queryInterface) {
        if (await tableExists(queryInterface, TABLE)) await queryInterface.dropTable(TABLE);
    }
};
