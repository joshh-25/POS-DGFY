'use strict';

const tableExists = async (queryInterface, tableName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table && table[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  return indexes.some((index) => index.name === indexName);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_personnel'))) {
      await queryInterface.createTable('delivery_personnel', {
        delivery_personnel_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        display_name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        phone: {
          type: Sequelize.STRING(40),
          allowNull: true
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
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
    }

    if (!(await indexExists(queryInterface, 'delivery_personnel', 'idx_delivery_personnel_name'))) {
      await queryInterface.addIndex('delivery_personnel', ['display_name'], {
        name: 'idx_delivery_personnel_name'
      });
    }
    if (!(await indexExists(queryInterface, 'delivery_personnel', 'idx_delivery_personnel_location_active'))) {
      await queryInterface.addIndex('delivery_personnel', ['location_id', 'is_active'], {
        name: 'idx_delivery_personnel_location_active'
      });
    }

    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    await addColumnIfMissing(queryInterface, 'delivery_jobs', 'delivery_personnel_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'delivery_personnel', key: 'delivery_personnel_id' },
      onUpdate: 'RESTRICT',
      onDelete: 'RESTRICT'
    });
    await addColumnIfMissing(queryInterface, 'delivery_jobs', 'assigned_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'user_id' },
      onUpdate: 'RESTRICT',
      onDelete: 'SET NULL'
    });
    await addColumnIfMissing(queryInterface, 'delivery_jobs', 'assigned_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    if (!(await indexExists(queryInterface, 'delivery_jobs', 'idx_delivery_jobs_personnel_status'))) {
      await queryInterface.addIndex('delivery_jobs', ['delivery_personnel_id', 'status'], {
        name: 'idx_delivery_jobs_personnel_status'
      });
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'delivery_jobs')) {
      if (await indexExists(queryInterface, 'delivery_jobs', 'idx_delivery_jobs_personnel_status')) {
        await queryInterface.removeIndex('delivery_jobs', 'idx_delivery_jobs_personnel_status');
      }
      for (const columnName of ['assigned_at', 'assigned_by', 'delivery_personnel_id']) {
        if (await columnExists(queryInterface, 'delivery_jobs', columnName)) {
          await queryInterface.removeColumn('delivery_jobs', columnName);
        }
      }
    }

    if (await tableExists(queryInterface, 'delivery_personnel')) {
      if (await indexExists(queryInterface, 'delivery_personnel', 'idx_delivery_personnel_location_active')) {
        await queryInterface.removeIndex('delivery_personnel', 'idx_delivery_personnel_location_active');
      }
      if (await indexExists(queryInterface, 'delivery_personnel', 'idx_delivery_personnel_name')) {
        await queryInterface.removeIndex('delivery_personnel', 'idx_delivery_personnel_name');
      }
      await queryInterface.dropTable('delivery_personnel');
    }
  }
};
