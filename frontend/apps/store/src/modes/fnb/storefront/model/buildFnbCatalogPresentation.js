function sortItems(items, sortOption) {
  return [...items].sort((left, right) => {
    if (sortOption === 'price_asc') {
      return Number(left?.default_sale_price || 0) - Number(right?.default_sale_price || 0);
    }
    if (sortOption === 'price_desc') {
      return Number(right?.default_sale_price || 0) - Number(left?.default_sale_price || 0);
    }
    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });
}

/**
 * Builds the F&B-only catalog view model used by the shared catalog renderer.
 * Input data must already reflect the current storefront search/filter state.
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
  const resolvedSection = hasMultipleSections && menuSections.some((section) => section.sectionKey === activeSection)
    ? activeSection
    : '';
  const activeSectionModel = resolvedSection
    ? (menuSections.find((section) => section.sectionKey === resolvedSection) || null)
    : null;
  const menuItems = Array.isArray(fnbViewModel?.menuItems) ? fnbViewModel.menuItems : [];
  const selectedItems = resolvedSection ? (activeSectionModel?.items || []) : menuItems;
  const sortedItems = sortItems(selectedItems, sortOption);
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
