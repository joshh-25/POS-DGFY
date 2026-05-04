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

    if (!(await tableExists(queryInterface, 'storefront_catalog_overrides'))) {
      await queryInterface.createTable('storefront_catalog_overrides', {
        storefront_catalog_override_id: {
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
        storefront_visible: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        storefront_image_path: {
          type: Sequelize.STRING(500),
          allowNull: true
        },
        storefront_image_url: {
          type: Sequelize.STRING(500),
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

    await addIndexSafe(queryInterface, 'storefront_catalog_overrides', ['item_id'], {
      unique: true,
      name: 'uq_storefront_catalog_overrides_item_id'
    });

    const hasPosCatalogOverrides = await tableExists(queryInterface, 'pos_catalog_overrides');
    const hasServiceDetails = await tableExists(queryInterface, 'service_item_details');
    const hasItemStatus = await columnExists(queryInterface, 'items', 'status');

    const statusPredicate = hasItemStatus ? "AND COALESCE(i.status, 'active') <> 'inactive'" : '';
    const posJoin = hasPosCatalogOverrides
      ? 'LEFT JOIN pos_catalog_overrides pco ON pco.item_id = i.item_id'
      : 'LEFT JOIN (SELECT NULL AS item_id, NULL AS pos_visible, NULL AS pos_image_path, NULL AS pos_image_url) pco ON 1 = 0';
    const serviceJoin = hasServiceDetails
      ? 'LEFT JOIN service_item_details sid ON sid.item_id = i.item_id'
      : 'LEFT JOIN (SELECT NULL AS item_id, NULL AS visible_in_storefront, NULL AS bookable) sid ON 1 = 0';

    await queryInterface.sequelize.query(`
      INSERT INTO storefront_catalog_overrides (
        item_id,
        storefront_visible,
        storefront_image_path,
        storefront_image_url,
        created_at,
        updated_at
      )
      SELECT
        i.item_id,
        CASE
          WHEN pco.pos_visible IS NOT NULL THEN pco.pos_visible
          WHEN i.category = 'service' THEN COALESCE(sid.visible_in_storefront, 1) <> 0 AND COALESCE(sid.bookable, 1) <> 0
          WHEN i.category = 'product' AND i.product_type = 'finished_goods' THEN 1
          ELSE 0
        END AS storefront_visible,
        pco.pos_image_path,
        pco.pos_image_url,
        NOW(),
        NOW()
      FROM items i
      ${posJoin}
      ${serviceJoin}
      WHERE 1 = 1
      ${statusPredicate}
      ON DUPLICATE KEY UPDATE
        storefront_visible = storefront_catalog_overrides.storefront_visible,
        storefront_image_path = storefront_catalog_overrides.storefront_image_path,
        storefront_image_url = storefront_catalog_overrides.storefront_image_url
    `);
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'storefront_catalog_overrides')) {
      await queryInterface.dropTable('storefront_catalog_overrides');
    }
  }
};
