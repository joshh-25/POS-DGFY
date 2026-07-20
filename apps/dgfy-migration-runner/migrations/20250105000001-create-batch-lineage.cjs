'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('batch_lineage', {
            lineage_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            parent_batch_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'fifo_batches',
                    key: 'batch_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT',
                comment: 'Batch of produced product'
            },
            child_batch_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'fifo_batches',
                    key: 'batch_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT',
                comment: 'Batch of consumed ingredient/sub-product'
            },
            quantity_consumed: {
                type: Sequelize.DECIMAL(12, 2),
                allowNull: false,
                comment: 'Quantity of child batch consumed'
            },
            jo_number: {
                type: Sequelize.STRING(50),
                allowNull: true,
                comment: 'Job order that created this lineage'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        }).catch(err => {
            if (!err.original || err.original.code !== 'ER_TABLE_EXISTS_ERROR') {
                if (err.name === 'SequelizeDatabaseError' && err.message.includes('already exists')) return;
                throw err;
            }
        });

        // Add indexes for efficient lineage queries
        try {
            await queryInterface.addIndex('batch_lineage', ['parent_batch_id'], {
                name: 'idx_batch_lineage_parent'
            });
        } catch (e) { }

        try {
            await queryInterface.addIndex('batch_lineage', ['child_batch_id'], {
                name: 'idx_batch_lineage_child'
            });
        } catch (e) { }

        try {
            await queryInterface.addIndex('batch_lineage', ['jo_number'], {
                name: 'idx_batch_lineage_jo'
            });
        } catch (e) { }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('batch_lineage');
    }
};
