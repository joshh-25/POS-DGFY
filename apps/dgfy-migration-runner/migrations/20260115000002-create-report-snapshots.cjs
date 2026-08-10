'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('report_snapshots', {
            snapshot_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            report_type: {
                type: Sequelize.ENUM('expiry', 'stock_aging', 'production', 'po_analysis', 'executive_summary'),
                allowNull: false
            },
            report_name: {
                type: Sequelize.STRING(100),
                allowNull: true,
                comment: 'Optional custom name for the snapshot'
            },
            snapshot_data: {
                type: Sequelize.JSON,
                allowNull: false,
                comment: 'Full report data at time of snapshot'
            },
            summary_metrics: {
                type: Sequelize.JSON,
                allowNull: true,
                comment: 'Key metrics for quick preview'
            },
            date_range_start: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            date_range_end: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        // Add index for faster lookups by report type
        await queryInterface.addIndex('report_snapshots', ['report_type']);
        await queryInterface.addIndex('report_snapshots', ['created_at']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('report_snapshots');
    }
};
