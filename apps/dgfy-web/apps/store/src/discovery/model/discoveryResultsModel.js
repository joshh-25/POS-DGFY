export const getDiscoveryResultsPerPage = ({
  viewMode,
  isMobileViewport,
  isTabletViewport
} = {}) => {
  if (viewMode === 'list') return 3;
  if (isMobileViewport) return 4;
  if (isTabletViewport) return 4;
  return 6;
};

export const getDiscoveryTotalPages = (storeCount, perPage) => (
  Math.max(1, Math.ceil(Number(storeCount || 0) / Math.max(1, Number(perPage || 1))))
);

export const getPaginatedDiscoveryStores = ({
  stores,
  page,
  perPage
} = {}) => {
  const rows = Array.isArray(stores) ? stores : [];
  const safePage = Math.max(1, Number(page || 1));
  const safePerPage = Math.max(1, Number(perPage || rows.length || 1));
  const startIndex = (safePage - 1) * safePerPage;
  return rows.slice(startIndex, startIndex + safePerPage);
};

export const getDiscoveryMobilePanelLayout = ({
  isMobile,
  isVisible,
  storeCount,
  viewMode
} = {}) => {
  if (!isMobile || !isVisible) {
    return {
      maxHeight: undefined,
      overflowY: undefined
    };
  }

  const visibleRows = Math.min(Math.max(Number(storeCount || 0), 1), 3);
  const rowHeight = viewMode === 'grid' ? 250 : 188;
  const headerHeight = 178;
  const padding = 28;

  return {
    maxHeight: headerHeight + (visibleRows * rowHeight) + padding,
    overflowY: storeCount > visibleRows ? 'auto' : 'visible'
  };
};

export const getDiscoveryFilterState = ({
  discoverySortBy,
  discoveryCategoryFilter,
  discoveryOpenFilter,
  discoveryDistanceFilter,
  discoveryRatingFilter,
  discoveryAvailabilityFilter
} = {}) => {
  const isOpenNowFilterActive = discoveryOpenFilter === 'open';
  const isSortFilterActive = discoverySortBy !== 'nearest';
  const isCategoryFilterActive = discoveryCategoryFilter !== 'all';
  const isDistanceFilterActive = discoveryDistanceFilter !== 'all';
  const hasActiveDiscoveryFilters = (
    isSortFilterActive
    || isCategoryFilterActive
    || discoveryOpenFilter !== 'all'
    || isDistanceFilterActive
    || discoveryRatingFilter !== 'all'
    || discoveryAvailabilityFilter !== 'all'
  );

  return {
    activeDiscoveryFilterCount: Number(isOpenNowFilterActive)
      + Number(isSortFilterActive)
      + Number(isCategoryFilterActive)
      + Number(isDistanceFilterActive),
    hasActiveDiscoveryFilters,
    isCategoryFilterActive,
    isDistanceFilterActive,
    isOpenNowFilterActive,
    isSortFilterActive
  };
};

export const getDiscoveryPaginationItems = ({
  currentPage,
  totalPages
} = {}) => {
  const safeCurrentPage = Math.max(1, Number(currentPage || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  if (safeTotalPages <= 1) return [];
  if (safeTotalPages <= 6) return Array.from({ length: safeTotalPages }, (_, index) => index + 1);

  const items = [1];
  if (safeCurrentPage > 3) items.push('ellipsis-left');

  const middlePages = [];
  for (
    let page = Math.max(2, safeCurrentPage - 1);
    page <= Math.min(safeTotalPages - 1, safeCurrentPage + 1);
    page += 1
  ) {
    middlePages.push(page);
  }

  if (!middlePages.includes(2) && safeCurrentPage <= 3) middlePages.unshift(2);
  if (!middlePages.includes(safeTotalPages - 1) && safeCurrentPage >= safeTotalPages - 2) {
    middlePages.push(safeTotalPages - 1);
  }

  items.push(...middlePages);
  if (safeCurrentPage < safeTotalPages - 2) items.push('ellipsis-right');
  items.push(safeTotalPages);
  return items;
};
