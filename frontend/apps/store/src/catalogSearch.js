const SEARCHABLE_ITEM_FIELDS = [
  'name',
  'sku',
  'sku_code',
  'item_code',
  'code',
  'description'
];

const normalizeQuery = (value) => String(value || '').trim().toLowerCase();

const collectItemSearchText = (item = {}) => SEARCHABLE_ITEM_FIELDS
  .map((field) => item?.[field])
  .filter((value) => value != null && value !== '')
  .map((value) => String(value).toLowerCase())
  .join(' ');

export const filterCatalogItems = (catalog = [], rawQuery = '') => {
  const query = normalizeQuery(rawQuery);
  if (!query) return Array.isArray(catalog) ? catalog : [];
  if (!Array.isArray(catalog)) return [];

  return catalog.filter((item) => collectItemSearchText(item).includes(query));
};

export default {
  filterCatalogItems
};
