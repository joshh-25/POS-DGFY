export function buildSimpleRelatedItems({
  detailItem,
  catalog,
  limit = 3
}) {
  if (!detailItem) return [];
  const currentItemId = Number(detailItem.item_id);
  const currentFolder = String(detailItem?.folder_name || detailItem?.category || '').trim();
  const fallbackItems = (Array.isArray(catalog) ? catalog : []).filter((item) => Number(item?.item_id) !== currentItemId);
  const sameFolder = fallbackItems.filter((item) => (
    String(item?.folder_name || item?.category || '').trim() === currentFolder
  ));
  return (sameFolder.length > 0 ? sameFolder : fallbackItems).slice(0, limit);
}
