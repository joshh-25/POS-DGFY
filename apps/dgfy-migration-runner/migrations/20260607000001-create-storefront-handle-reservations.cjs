'use strict';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).some((name) => String(name).toLowerCase() === String(tableName).toLowerCase());
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if ((indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'tenants'))) return;

    if (!(await tableExists(queryInterface, 'storefront_handle_reservations'))) {
      await queryInterface.createTable('storefront_handle_reservations', {
        storefront_handle_reservation_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'tenants',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        handle: {
          type: Sequelize.STRING(120),
          allowNull: false
        },
        source: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'settings'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    await addIndexSafe(queryInterface, 'storefront_handle_reservations', ['handle'], {
      unique: true,
      name: 'uq_storefront_handle_reservations_handle'
    });
    await addIndexSafe(queryInterface, 'storefront_handle_reservations', ['tenant_id'], {
      unique: true,
      name: 'uq_storefront_handle_reservations_tenant'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'storefront_handle_reservations')) {
      await queryInterface.dropTable('storefront_handle_reservations');
    }
  }
};
