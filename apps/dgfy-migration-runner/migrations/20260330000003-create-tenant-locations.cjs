module.exports = {
    async up(queryInterface, Sequelize) {
        const existingTables = await queryInterface.showAllTables();
        const tableSet = new Set(
            (existingTables || []).map((entry) => (
                typeof entry === 'string'
                    ? entry.toLowerCase()
                    : String(entry.tableName || entry).toLowerCase()
            ))
        );

        if (!tableSet.has('tenant_locations')) {
            await queryInterface.createTable('tenant_locations', {
                location_id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true
                },
                name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                address_line: {
                    type: Sequelize.TEXT,
                    allowNull: false
                },
                latitude: {
                    type: Sequelize.DECIMAL(10, 8),
                    allowNull: false
                },
                longitude: {
                    type: Sequelize.DECIMAL(11, 8),
                    allowNull: false
                },
                delivery_radius_km: {
                    type: Sequelize.DECIMAL(5, 2),
                    allowNull: false,
                    defaultValue: 5
                },
                is_open: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                is_active: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                operating_hours: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                current_wait_time_minutes: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 15
                },
                allow_out_of_stock_sales: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: false
                },
                supports_delivery: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                supports_pickup: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                supports_dine_in: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                }
            });

            await queryInterface.addIndex('tenant_locations', ['name'], { name: 'idx_tenant_locations_name' });
            await queryInterface.addIndex('tenant_locations', ['is_active'], { name: 'idx_tenant_locations_active' });
            await queryInterface.addIndex('tenant_locations', ['is_open'], { name: 'idx_tenant_locations_open' });
            await queryInterface.addIndex('tenant_locations', ['latitude', 'longitude'], { name: 'idx_tenant_locations_lat_lng' });
        }
    },

    async down(queryInterface) {
        const existingTables = await queryInterface.showAllTables();
        const tableSet = new Set(
            (existingTables || []).map((entry) => (
                typeof entry === 'string'
                    ? entry.toLowerCase()
                    : String(entry.tableName || entry).toLowerCase()
            ))
        );

        if (tableSet.has('tenant_locations')) {
            await queryInterface.dropTable('tenant_locations');
        }
    }
};
