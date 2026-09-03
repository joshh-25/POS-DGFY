'use strict';

// Phase 257 (#1318) — secondary item/category membership. Purely additive:
// `items.folder_id` stays the single primary-category pointer (ADR 0080
// clause 1/2); this table only ever adds extra, non-primary memberships.

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;
  return table?.tableName || table?.TABLE_NAME || '';
};

const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => normalizeTableName(table).toLowerCase() === tableName.toLowerCase());
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  return indexes.some((index) => index.name === indexName);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  if (!(await indexExists(queryInterface, tableName, options.name))) {
    await queryInterface.addIndex(tableName, fields, options);
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'item_folder_memberships'))) {
      await queryInterface.createTable('item_folder_memberships', {
        item_folder_membership_id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'items', key: 'item_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'CASCADE'
        },
        folder_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'item_folders', key: 'folder_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'CASCADE'
        },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
    }

    // No standalone KEY(folder_id) — the unique key's leftmost prefix already
    // covers "items in folder X" and InnoDB's FK-index requirement (ADR 0080
    // Correction 3 / audit:tenant-index-headroom). KEY(item_id) covers the
    // reverse "folders of item Y" hot-path lookup and its own FK requirement.
    await addIndexIfMissing(queryInterface, 'item_folder_memberships', ['folder_id', 'item_id'], {
      unique: true,
      name: 'uq_item_folder_memberships_folder_item'
    });
    await addIndexIfMissing(queryInterface, 'item_folder_memberships', ['item_id'], {
      name: 'idx_item_folder_memberships_item'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'item_folder_memberships')) {
      await queryInterface.dropTable('item_folder_memberships');
    }
  }
};
