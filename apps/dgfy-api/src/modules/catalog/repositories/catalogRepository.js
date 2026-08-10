import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';

export const CATALOG_ITEM_IDENTITY_ATTRIBUTES = Object.freeze([
  'item_id',
  'sku_code',
  'name',
  'description',
  'category',
  'product_type',
  'mode_item_preset',
  'unit_of_measure',
  'default_sale_price',
  'status'
]);

const toPlain = (row) => (typeof row?.get === 'function' ? row.get({ plain: true }) : row);

export const catalogRepository = {
  async findCatalogItemById(itemId, options = {}) {
    const Item = dbStore.get('Item');
    if (!Item) return null;

    const row = await Item.findOne({
      where: buildVisibleWhere(
        { item_id: itemId },
        { statusField: 'status', excludeInactiveStatus: false }
      ),
      attributes: CATALOG_ITEM_IDENTITY_ATTRIBUTES,
      transaction: options.transaction,
      lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
    });

    return row ? toPlain(row) : null;
  },

  async listCatalogItems({ itemIds = [], limit = 100 } = {}, options = {}) {
    const Item = dbStore.get('Item');
    if (!Item) return [];

    const where = buildVisibleWhere(
      {},
      { statusField: 'status', excludeInactiveStatus: false }
    );
    if (Array.isArray(itemIds) && itemIds.length > 0) {
      where.item_id = itemIds;
    }

    const rows = await Item.findAll({
      where,
      attributes: CATALOG_ITEM_IDENTITY_ATTRIBUTES,
      limit: Math.max(1, Math.min(Number.parseInt(limit, 10) || 100, 500)),
      order: [['name', 'ASC']],
      transaction: options.transaction
    });

    return rows.map(toPlain);
  }
};

export default catalogRepository;
