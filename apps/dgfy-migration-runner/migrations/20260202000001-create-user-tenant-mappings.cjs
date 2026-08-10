/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('user_tenant_mappings', {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER
            },
            email: {
                type: Sequelize.STRING(255),
                allowNull: false
            },
            tenant_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'tenants',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE
            }
        });

        // Add unique constraint on email + tenant_id combination
        await queryInterface.addIndex('user_tenant_mappings', ['email', 'tenant_id'], {
            unique: true,
            name: 'unique_email_tenant'
        });

        // Add index on email for fast lookups
        await queryInterface.addIndex('user_tenant_mappings', ['email'], {
            name: 'idx_email'
        });

        // Add index on tenant_id for fast cascade deletes
        await queryInterface.addIndex('user_tenant_mappings', ['tenant_id'], {
            name: 'idx_tenant'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('user_tenant_mappings');
    }
};
