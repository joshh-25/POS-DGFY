import { useEffect, useRef, useState } from 'react';

export function useDiscoveryState({ search = '' } = {}) {
  const [discoveryResultMode, setDiscoveryResultMode] = useState('union');
  const [discoveryStockFilter, setDiscoveryStockFilter] = useState('include_out_of_stock');
  const [discoveryPinScope, setDiscoveryPinScope] = useState('tenant_primary');
  const [discoveryIncludeMatchMeta, setDiscoveryIncludeMatchMeta] = useState(true);
  const [discoveryAppliedFilters, setDiscoveryAppliedFilters] = useState(null);
  const [isDiscoverySearchFocused, setIsDiscoverySearchFocused] = useState(false);
  const [hasDiscoveryExplorationStarted, setHasDiscoveryExplorationStarted] = useState(false);
  const [isDiscoveryNoMatchToastActive, setIsDiscoveryNoMatchToastActive] = useState(false);

  const [discoveryResultsPage, setDiscoveryResultsPage] = useState(1);
  const [discoverySortBy, setDiscoverySortBy] = useState('nearest');
  const [discoveryCategoryFilter, setDiscoveryCategoryFilter] = useState('all');
  const [discoveryDistanceFilter, setDiscoveryDistanceFilter] = useState('all');
  const [discoveryOpenFilter, setDiscoveryOpenFilter] = useState('all');
  const [discoveryRatingFilter, setDiscoveryRatingFilter] = useState('all');
  const [discoveryAvailabilityFilter, setDiscoveryAvailabilityFilter] = useState('all');
  const [activeDiscoveryFilterDropdown, setActiveDiscoveryFilterDropdown] = useState(null);
  const [renderDiscoveryResetButton, setRenderDiscoveryResetButton] = useState(false);
  const [showDiscoveryResetButton, setShowDiscoveryResetButton] = useState(false);

  const [discoveryCoords, setDiscoveryCoords] = useState(null);
  const discoveryCoordsRef = useRef(discoveryCoords);
  const [discoveryLocationMap, setDiscoveryLocationMap] = useState({});
  const [loadingDiscoveryLocations, setLoadingDiscoveryLocations] = useState(false);
  const [highlightedDiscoveryMarkerKey, setHighlightedDiscoveryMarkerKey] = useState('');
  const [highlightedStoreSlug, setHighlightedStoreSlug] = useState('');
  const [selectedMapPin, setSelectedMapPin] = useState(null);
  const [isStoreListVisible, setIsStoreListVisible] = useState(false);
  const [isMobileResultsCollapsed, setIsMobileResultsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('list');

  const [openDiscoveryFaqIndex, setOpenDiscoveryFaqIndex] = useState(0);
  const [isDiscoveryNavMenuOpen, setIsDiscoveryNavMenuOpen] = useState(false);
  const [activeDiscoveryNavItem, setActiveDiscoveryNavItem] = useState('Explore');
  const searchRef = useRef(search);

  useEffect(() => {
    discoveryCoordsRef.current = discoveryCoords;
  }, [discoveryCoords]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  return {
    activeDiscoveryFilterDropdown,
    activeDiscoveryNavItem,
    discoveryAppliedFilters,
    discoveryAvailabilityFilter,
    discoveryCategoryFilter,
    discoveryCoords,
    discoveryCoordsRef,
    discoveryDistanceFilter,
    discoveryIncludeMatchMeta,
    discoveryLocationMap,
    discoveryOpenFilter,
    discoveryPinScope,
    discoveryRatingFilter,
    discoveryResultMode,
    discoveryResultsPage,
    discoverySortBy,
    discoveryStockFilter,
    hasDiscoveryExplorationStarted,
    highlightedDiscoveryMarkerKey,
    highlightedStoreSlug,
    isMobileResultsCollapsed,
    isDiscoveryNavMenuOpen,
    isDiscoveryNoMatchToastActive,
    isDiscoverySearchFocused,
    isStoreListVisible,
    loadingDiscoveryLocations,
    openDiscoveryFaqIndex,
    selectedMapPin,
    viewMode,
    renderDiscoveryResetButton,
    searchRef,
    setActiveDiscoveryFilterDropdown,
    setActiveDiscoveryNavItem,
    setDiscoveryAppliedFilters,
    setDiscoveryAvailabilityFilter,
    setDiscoveryCategoryFilter,
    setDiscoveryCoords,
    setDiscoveryDistanceFilter,
    setDiscoveryIncludeMatchMeta,
    setDiscoveryLocationMap,
    setDiscoveryOpenFilter,
    setDiscoveryPinScope,
    setDiscoveryRatingFilter,
    setDiscoveryResultMode,
    setDiscoveryResultsPage,
    setDiscoverySortBy,
    setDiscoveryStockFilter,
    setHasDiscoveryExplorationStarted,
    setHighlightedDiscoveryMarkerKey,
    setHighlightedStoreSlug,
    setIsMobileResultsCollapsed,
    setIsDiscoveryNavMenuOpen,
    setIsDiscoveryNoMatchToastActive,
    setIsDiscoverySearchFocused,
    setIsStoreListVisible,
    setLoadingDiscoveryLocations,
    setOpenDiscoveryFaqIndex,
    setRenderDiscoveryResetButton,
    setSelectedMapPin,
    setShowDiscoveryResetButton,
    setViewMode,
    showDiscoveryResetButton
  };
}
