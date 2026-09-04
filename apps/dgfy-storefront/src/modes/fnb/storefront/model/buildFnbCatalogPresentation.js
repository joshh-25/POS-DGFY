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
