export default {
    async up(queryInterface, Sequelize) {
        // Check if table already exists to make migration idempotent
        const tables = await queryInterface.showAllTables();
        if (tables.includes('receive_tokens')) {
            console.log('Table receive_tokens already exists, skipping creation');
            return;
        }

        await queryInterface.createTable('receive_tokens', {
            token_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            token_hash: {
                type: Sequelize.STRING(64),
                allowNull: false,
                comment: 'SHA-256 hash of the actual token'
            },
            token_type: {
                type: Sequelize.ENUM('PO', 'JO'),
                allowNull: false
            },
            order_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: 'References purchase_orders.po_id or job_orders.jo_id based on token_type'
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: false
            },
            used_at: {
                type: Sequelize.DATE,
                allowNull: true
            },
            used_by: {
                type: Sequelize.INTEGER,
                allowNull: true,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'SET NULL'
            },
            created_by: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            }
        });

        // Add unique index on token_hash for fast lookups
        await queryInterface.addIndex('receive_tokens', ['token_hash'], {
            name: 'idx_receive_tokens_hash',
            unique: true
        });

        // Add index on order lookup
        await queryInterface.addIndex('receive_tokens', ['token_type', 'order_id'], {
            name: 'idx_receive_tokens_order'
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('receive_tokens');
    }
};
