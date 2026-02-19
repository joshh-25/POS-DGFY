
/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('tenants', {
            id: {
                allowNull: false,
                primaryKey: true,
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            domain: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: true
            },
            subdomain: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: true
            },
            db_name: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            company_token: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true
            },
            db_host: {
                type: Sequelize.STRING,
                defaultValue: 'localhost'
            },
            db_username: {
                type: Sequelize.STRING,
                allowNull: true
            },
            db_password: {
                type: Sequelize.STRING,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('active', 'inactive', 'archived'),
                defaultValue: 'active'
            },
            plan: {
                type: Sequelize.STRING,
                defaultValue: 'free'
            },
            settings: {
                type: Sequelize.JSON,
                defaultValue: {}
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

        // Add indexes for performance
        await queryInterface.addIndex('tenants', ['company_token']);
        await queryInterface.addIndex('tenants', ['domain']);
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable('tenants');
    }
};
