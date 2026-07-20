'use strict';

const normalizeTableName = (table) => {
  if (!table) return '';
  if (typeof table === 'string') return table;
  return table.tableName || table.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).map(normalizeTableName).includes(tableName);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  if (!(await tableExists(queryInterface, tableName))) return false;
  const table = await queryInterface.describeTable(tableName);
  return Boolean(table?.[columnName]);
};

const addIndexSafe = async (queryInterface, tableName, fields, options = {}) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if ((indexes || []).some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'items'))) return;

    if (!(await tableExists(queryInterface, 'item_barcodes'))) {
      await queryInterface.createTable('item_barcodes', {
        item_barcode_id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true
        },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'items',
            key: 'item_id'
          },
          onDelete: 'CASCADE'
        },
        code: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        normalized_code: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        symbology: {
          type: Sequelize.ENUM('upc_a', 'ean13', 'code128', 'qr', 'gs1_datamatrix', 'unknown'),
          allowNull: false,
          defaultValue: 'unknown'
        },
        source: {
          type: Sequelize.ENUM('manufacturer', 'supplier', 'tenant_generated', 'legacy_import', 'system_generated_reference'),
          allowNull: false,
          defaultValue: 'manufacturer'
        },
        scope: {
          type: Sequelize.ENUM('inventory', 'pos', 'storefront_qr', 'batch', 'service', 'ticket', 'package'),
          allowNull: false,
          defaultValue: 'inventory'
        },
        packaging_level: {
          type: Sequelize.ENUM('unit', 'pack', 'case', 'carton', 'batch', 'service', 'ticket', 'shelf'),
          allowNull: false,
          defaultValue: 'unit'
        },
        quantity_multiplier: {
          type: Sequelize.DECIMAL(12, 4),
          allowNull: false,
          defaultValue: 1
        },
        is_primary: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        deactivated_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        deactivated_by: {
          type: Sequelize.INTEGER,
          allowNull: true
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

    if (!(await columnExists(queryInterface, 'item_barcodes', 'active_normalized_code'))) {
      await queryInterface.sequelize.query(`
        ALTER TABLE item_barcodes
        ADD COLUMN active_normalized_code VARCHAR(255)
        GENERATED ALWAYS AS (
          CASE
            WHEN is_active = 1 AND deactivated_at IS NULL THEN normalized_code
            ELSE NULL
          END
        ) STORED
      `);
    }

    await addIndexSafe(queryInterface, 'item_barcodes', ['item_id'], {
      name: 'idx_item_barcodes_item_id'
    });
    await addIndexSafe(queryInterface, 'item_barcodes', ['normalized_code'], {
      name: 'idx_item_barcodes_normalized_code'
    });
    await addIndexSafe(queryInterface, 'item_barcodes', ['scope'], {
      name: 'idx_item_barcodes_scope'
    });
    await addIndexSafe(queryInterface, 'item_barcodes', ['is_active'], {
      name: 'idx_item_barcodes_active'
    });
    await addIndexSafe(queryInterface, 'item_barcodes', ['active_normalized_code'], {
      unique: true,
      name: 'uq_item_barcodes_active_normalized_code'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'item_barcodes')) {
      await queryInterface.dropTable('item_barcodes');
    }
  }
};
