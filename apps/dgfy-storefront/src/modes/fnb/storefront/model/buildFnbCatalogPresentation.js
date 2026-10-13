const getFolderIdentity = (folderId) => {
  const numericFolderId = Number(folderId);
  return Number.isInteger(numericFolderId) && numericFolderId > 0
    ? `folder:${numericFolderId}`
    : null;
};

const getCatalogCategorySortOrder = (item, categoryOrderByIdentity) => {
  const secondaryCategories = Array.isArray(item?.secondary_categories) ? item.secondary_categories : [];
  const categoryIdentities = [
    getFolderIdentity(item?.folder_id),
    ...secondaryCategories.map((category) => getFolderIdentity(category?.folder_id))
  ];

  return categoryIdentities.reduce((earliestOrder, categoryIdentity) => {
    if (!categoryIdentity || !categoryOrderByIdentity.has(categoryIdentity)) return earliestOrder;
    return Math.min(earliestOrder, categoryOrderByIdentity.get(categoryIdentity));
  }, Number.MAX_SAFE_INTEGER);
};

function sortItems(items, sortOption, categoryOrderByIdentity = null) {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (sortOption === 'price_asc') {
        return Number(left.item?.default_sale_price || 0)
          - Number(right.item?.default_sale_price || 0)
          || left.index - right.index;
      }
      if (sortOption === 'price_desc') {
        return Number(right.item?.default_sale_price || 0)
          - Number(left.item?.default_sale_price || 0)
          || left.index - right.index;
      }
      if (categoryOrderByIdentity) {
        // Use the exact ordered sections rendered by the category selector as the source of truth.
        // A product in multiple sections stays unique and sorts under its earliest section.
        const categoryDifference = getCatalogCategorySortOrder(left.item, categoryOrderByIdentity)
          - getCatalogCategorySortOrder(right.item, categoryOrderByIdentity);
        if (categoryDifference !== 0) return categoryDifference;
      }
      return String(left.item?.name || '').localeCompare(String(right.item?.name || ''))
        || String(left.item?.item_id || '').localeCompare(String(right.item?.item_id || ''))
        || left.index - right.index;
    })
    .map(({ item }) => item);
}

/**
 * Builds the F&B-only catalog view model used by the shared catalog renderer.
 * Input data must already reflect the current storefront search/filter state.
 *
 * RF-4 (PR #1583 review): `activeSection`/`resolvedSection` are `sectionIdentity` values (the
 * stable, folder_id-based identity `fnbStorefrontViewModel.js` computes -- see
 * `resolveSectionIdentity`), never the normalized `sectionKey` display text. Two distinct folders
 * whose names normalize identically produce two `menuSections` entries with the same `sectionKey`
 * but different `sectionIdentity`; resolving/matching by `sectionKey` here would make the second
 * one permanently unreachable through the toolbar. `sectionKey`/`sectionLabel` stay available on
 * `activeSectionModel` for display only.
 */
export function buildFnbCatalogPresentation({
  activeSection,
  fnbViewModel,
  page,
  pageSize,
  sortOption
}) {
  const menuSections = Array.isArray(fnbViewModel?.menuSections)
    ? fnbViewModel.menuSections
    : [];
  const hasMultipleSections = menuSections.length > 1;
  const resolvedSection = hasMultipleSections && menuSections.some((section) => section.sectionIdentity === activeSection)
    ? activeSection
    : '';
  const activeSectionModel = resolvedSection
    ? (menuSections.find((section) => section.sectionIdentity === resolvedSection) || null)
    : null;
  const menuItems = Array.isArray(fnbViewModel?.menuItems) ? fnbViewModel.menuItems : [];
  const selectedItems = resolvedSection ? (activeSectionModel?.items || []) : menuItems;
  const categoryOrderByIdentity = new Map(
    menuSections.map((section, index) => [section.sectionIdentity, index])
  );
  const sortedItems = sortItems(selectedItems, sortOption, resolvedSection ? null : categoryOrderByIdentity);
  const normalizedPageSize = Math.max(1, Number(pageSize || 8));
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / normalizedPageSize));
  const resolvedPage = Math.min(Math.max(1, Number(page || 1)), totalPages);

  return {
    activeSectionModel,
    menuSections,
    resolvedPage,
    resolvedSection,
    selectedItems,
    sortedItems,
    totalPages,
    visibleItems: sortedItems.slice((resolvedPage - 1) * normalizedPageSize, resolvedPage * normalizedPageSize)
  };
}
