'use strict';

const TABLES = Object.freeze({
  ITEMS: 'items',
  FIFO_BATCHES: 'fifo_batches',
  STOCK_MOVEMENTS: 'stock_movements',
  TENANT_LOCATIONS: 'tenant_locations',
  SYSTEM_SETTINGS: 'system_settings',
  ITEM_LOCATION_STOCKS: 'item_location_stocks',
  USER_LOCATION_GRANTS: 'user_location_grants'
});

const hasTable = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  const normalized = (tables || []).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry?.tableName) return entry.tableName;
    return '';
  });
  return normalized.includes(tableName);
};

const hasColumn = async (queryInterface, tableName, columnName) => {
  const def = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(def, columnName);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      if (!await hasTable(queryInterface, TABLES.ITEM_LOCATION_STOCKS)) {
        await queryInterface.createTable(TABLES.ITEM_LOCATION_STOCKS, {
          item_location_stock_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          item_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: TABLES.ITEMS, key: 'item_id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
          },
          location_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
          },
          quantity_on_hand: {
            type: Sequelize.DECIMAL(24, 12),
            allowNull: false,
            defaultValue: 0
          },
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
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
        }, { transaction });

        await queryInterface.addIndex(TABLES.ITEM_LOCATION_STOCKS, ['item_id', 'location_id'], {
          unique: true,
          name: 'uniq_item_location_stock',
          transaction
        });
        await queryInterface.addIndex(TABLES.ITEM_LOCATION_STOCKS, ['item_id'], {
          name: 'idx_item_location_stock_item',
          transaction
        });
        await queryInterface.addIndex(TABLES.ITEM_LOCATION_STOCKS, ['location_id'], {
          name: 'idx_item_location_stock_location',
          transaction
        });
      }

      if (!await hasTable(queryInterface, TABLES.USER_LOCATION_GRANTS)) {
        await queryInterface.createTable(TABLES.USER_LOCATION_GRANTS, {
          user_location_grant_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
          },
          location_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
          },
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'user_id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        }, { transaction });

        await queryInterface.addIndex(TABLES.USER_LOCATION_GRANTS, ['user_id', 'location_id'], {
          unique: true,
          name: 'uniq_user_location_grant',
          transaction
        });
        await queryInterface.addIndex(TABLES.USER_LOCATION_GRANTS, ['user_id'], {
          name: 'idx_user_location_grant_user',
          transaction
        });
        await queryInterface.addIndex(TABLES.USER_LOCATION_GRANTS, ['location_id'], {
          name: 'idx_user_location_grant_location',
          transaction
        });
      }

      if (!await hasColumn(queryInterface, TABLES.FIFO_BATCHES, 'location_id')) {
        await queryInterface.addColumn(TABLES.FIFO_BATCHES, 'location_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        }, { transaction });
        await queryInterface.addIndex(TABLES.FIFO_BATCHES, ['location_id'], {
          name: 'idx_fifo_batches_location_id',
          transaction
        });
      }

      if (!await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'location_id')) {
        await queryInterface.addColumn(TABLES.STOCK_MOVEMENTS, 'location_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        }, { transaction });
        await queryInterface.addIndex(TABLES.STOCK_MOVEMENTS, ['location_id'], {
          name: 'idx_stock_movements_location_id',
          transaction
        });
      }

      if (!await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'source_location_id')) {
        await queryInterface.addColumn(TABLES.STOCK_MOVEMENTS, 'source_location_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        }, { transaction });
        await queryInterface.addIndex(TABLES.STOCK_MOVEMENTS, ['source_location_id'], {
          name: 'idx_stock_movements_source_location_id',
          transaction
        });
      }

      if (!await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'destination_location_id')) {
        await queryInterface.addColumn(TABLES.STOCK_MOVEMENTS, 'destination_location_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: TABLES.TENANT_LOCATIONS, key: 'location_id' },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        }, { transaction });
        await queryInterface.addIndex(TABLES.STOCK_MOVEMENTS, ['destination_location_id'], {
          name: 'idx_stock_movements_destination_location_id',
          transaction
        });
      }

      if (!await hasColumn(queryInterface, TABLES.SYSTEM_SETTINGS, 'setting_key')) {
        throw new Error('system_settings table missing expected setting_key column');
      }

      await queryInterface.sequelize.query(
        `INSERT INTO ${TABLES.SYSTEM_SETTINGS}
         (setting_key, setting_value, data_type, description, updated_at)
         SELECT :settingKey, :settingValue, :dataType, :description, NOW()
         FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM ${TABLES.SYSTEM_SETTINGS} WHERE setting_key = :settingKey
         )`,
        {
          transaction,
          replacements: {
            settingKey: 'multi_location_inventory_enabled',
            settingValue: 'false',
            dataType: 'boolean',
            description: 'Feature flag for multi-location authoritative inventory ledger'
          }
        }
      );

      // Bootstrap legacy stock into primary location to preserve operational continuity.
      const [primaryRows] = await queryInterface.sequelize.query(
        `SELECT location_id
           FROM ${TABLES.TENANT_LOCATIONS}
          WHERE is_active = 1
          ORDER BY is_primary_storefront DESC, is_open DESC, updated_at DESC, location_id DESC
          LIMIT 1`,
        { transaction }
      );

      const primaryLocationId = primaryRows?.[0]?.location_id || null;

      if (primaryLocationId) {
        await queryInterface.sequelize.query(
          `INSERT INTO ${TABLES.ITEM_LOCATION_STOCKS} (item_id, location_id, quantity_on_hand, updated_by, created_at, updated_at)
           SELECT i.item_id, :locationId, COALESCE(i.current_stock, 0), NULL, NOW(), NOW()
           FROM ${TABLES.ITEMS} i
           LEFT JOIN ${TABLES.ITEM_LOCATION_STOCKS} ils
             ON ils.item_id = i.item_id AND ils.location_id = :locationId
           WHERE ils.item_location_stock_id IS NULL`,
          {
            transaction,
            replacements: { locationId: primaryLocationId }
          }
        );

        await queryInterface.sequelize.query(
          `UPDATE ${TABLES.FIFO_BATCHES}
              SET location_id = :locationId
            WHERE location_id IS NULL`,
          {
            transaction,
            replacements: { locationId: primaryLocationId }
          }
        );
      }

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `DELETE FROM ${TABLES.SYSTEM_SETTINGS}
          WHERE setting_key = 'multi_location_inventory_enabled'`,
        { transaction }
      );

      if (await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'destination_location_id')) {
        await queryInterface.removeIndex(TABLES.STOCK_MOVEMENTS, 'idx_stock_movements_destination_location_id', { transaction });
        await queryInterface.removeColumn(TABLES.STOCK_MOVEMENTS, 'destination_location_id', { transaction });
      }
      if (await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'source_location_id')) {
        await queryInterface.removeIndex(TABLES.STOCK_MOVEMENTS, 'idx_stock_movements_source_location_id', { transaction });
        await queryInterface.removeColumn(TABLES.STOCK_MOVEMENTS, 'source_location_id', { transaction });
      }
      if (await hasColumn(queryInterface, TABLES.STOCK_MOVEMENTS, 'location_id')) {
        await queryInterface.removeIndex(TABLES.STOCK_MOVEMENTS, 'idx_stock_movements_location_id', { transaction });
        await queryInterface.removeColumn(TABLES.STOCK_MOVEMENTS, 'location_id', { transaction });
      }

      if (await hasColumn(queryInterface, TABLES.FIFO_BATCHES, 'location_id')) {
        await queryInterface.removeIndex(TABLES.FIFO_BATCHES, 'idx_fifo_batches_location_id', { transaction });
        await queryInterface.removeColumn(TABLES.FIFO_BATCHES, 'location_id', { transaction });
      }

      if (await hasTable(queryInterface, TABLES.USER_LOCATION_GRANTS)) {
        await queryInterface.dropTable(TABLES.USER_LOCATION_GRANTS, { transaction });
      }
      if (await hasTable(queryInterface, TABLES.ITEM_LOCATION_STOCKS)) {
        await queryInterface.dropTable(TABLES.ITEM_LOCATION_STOCKS, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }
};
