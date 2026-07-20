/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'pos_z_reading_snapshots'");
        if (Array.isArray(tables) && tables.length > 0) {
            return;
        }

        await queryInterface.createTable('pos_z_reading_snapshots', {
            pos_z_reading_snapshot_id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            business_date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            reading_identifier: {
                type: Sequelize.STRING(80),
                allowNull: false,
                unique: true
            },
            z_counter_value: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false
            },
            reset_counter_value: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false
            },
            lifetime_grand_total_cents: {
                type: Sequelize.BIGINT.UNSIGNED,
                allowNull: false
            },
            summary: {
                type: Sequelize.JSON,
                allowNull: false,
                defaultValue: {}
            },
            generated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        await queryInterface.addIndex('pos_z_reading_snapshots', ['business_date'], {
            name: 'pos_z_reading_snapshots_business_date_idx'
        });
        await queryInterface.addIndex('pos_z_reading_snapshots', ['z_counter_value'], {
            name: 'pos_z_reading_snapshots_z_counter_idx'
        });
        await queryInterface.addIndex('pos_z_reading_snapshots', ['generated_at'], {
            name: 'pos_z_reading_snapshots_generated_at_idx'
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('pos_z_reading_snapshots', 'pos_z_reading_snapshots_business_date_idx').catch(() => null);
        await queryInterface.removeIndex('pos_z_reading_snapshots', 'pos_z_reading_snapshots_z_counter_idx').catch(() => null);
        await queryInterface.removeIndex('pos_z_reading_snapshots', 'pos_z_reading_snapshots_generated_at_idx').catch(() => null);
        await queryInterface.dropTable('pos_z_reading_snapshots').catch(() => null);
    }
};
