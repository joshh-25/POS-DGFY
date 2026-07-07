import React from 'react';
import {
  ArrowUpDown,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Heart,
  Info,
  LayoutGrid,
  List,
  MapPin,
  Navigation,
  Star,
  X
} from 'lucide-react';
import { DiscoveryMapCard } from '../../../Components/store/DiscoveryResponsiveLayout.jsx';

export function createDiscoveryResultsRenderer(ctx) {
  const {
  activeDiscoveryFilterCount,
  activeDiscoveryFilterDropdown,
  discoveryBusinessModeOptions,
  discoveryCategoryFilter,
  discoveryCoords,
  discoveryFilterToolbarRef,
  discoveryLayout,
  discoveryPaginationItems,
  discoveryPinsBySlug,
  discoveryResultStores,
  discoveryResultsMapKey,
  discoveryResultsPage,
  discoverySortBy,
  discoverySortLabelByValue,
  discoveryTotalPages,
  discoveryViewportMode,
  filteredDiscoveryStores,
  formatStorefrontHoursLabel,
  getDiscoveryEmptyStateMessage,
  getDiscoveryMarkerKey,
  getPreferredDiscoveryLocationId,
  goStore,
  goStoreOrderForDiscovery,
  hasActiveDiscoveryFilters,
  hasDiscoverySearch,
  highlightedDiscoveryMarkerKey,
  highlightedStoreSlug,
  isBrandingImageBlocked,
  isCategoryFilterActive,
  isDiscoveryMobileViewport,
  isDiscoveryTabletViewport,
  isMobileResultsCollapsed,
  isOpenNowFilterActive,
  isSortFilterActive,
  isStoreListVisible,
  loadingStores,
  markBrandingImageError,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary,
  paginatedDiscoveryStores,
  renderDiscoveryResetButton,
  resetDiscoveryResultsView,
  search,
  searchedDiscoveryMapPins,
  setActiveDiscoveryFilterDropdown,
  setDiscoveryCategoryFilter,
  setDiscoveryOpenFilter,
  setDiscoveryResultsPage,
  setDiscoverySortBy,
  setHasDiscoveryExplorationStarted,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug,
  setIsMobileResultsCollapsed,
  setIsStoreListVisible,
  setSelectedMapPin,
  setViewMode,
  showDiscoveryResetButton,
  handleNearMe,
  StoresMap,
  storesError,
  storesWithNearestBranch,
  toSlug,
  viewMode,
  withAssetOrigin
  } = ctx;

  return () => {

const cityLabel = discoveryCoords ? 'your selected area' : 'Iloilo City';
const resultCountLabel = `${filteredDiscoveryStores.length} ${filteredDiscoveryStores.length === 1 ? 'Store' : 'Stores'} Found`;
const resultsSubtitle = hasDiscoverySearch && String(search || '').trim()
  ? `Showing businesses related to "${String(search || '').trim()}" near ${cityLabel}`
  : `Showing businesses within your selected area near ${cityLabel}`;
	    const viewButtonStyle = (mode) => ({
	      minHeight: isDiscoveryMobileViewport ? 36 : 34,
	      minWidth: isDiscoveryMobileViewport ? 40 : 96,
	      borderRadius: isDiscoveryMobileViewport ? 10 : 10,
	      border: `1px solid ${viewMode === mode ? '#bfdbfe' : '#e2e8f0'}`,
	      background: viewMode === mode ? '#eff6ff' : '#ffffff',
	      color: viewMode === mode ? '#1a4e8d' : '#334155',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
	      gap: isDiscoveryMobileViewport ? 0 : 6,
	      padding: isDiscoveryMobileViewport ? '0' : '0 11px',
	      fontSize: isDiscoveryMobileViewport ? 12 : 12,
	      fontWeight: 700,
	      cursor: 'pointer',
	      boxShadow: viewMode === mode ? '0 8px 18px rgba(37,99,235,.12)' : 'none'
	    });
	    const renderDiscoveryStoreCard = (store) => {
  const storeSlug = toSlug(store?.slug);
  const imgUrl = withAssetOrigin(store?.storefront_cover_image_url);
  const imgKey = `discovery-cover:${storeSlug}:${imgUrl}`;
  const storePins = Array.isArray(discoveryPinsBySlug[storeSlug]) ? discoveryPinsBySlug[storeSlug] : [];
  const preferredLocationId = getPreferredDiscoveryLocationId({ store, storePins });
  const categories = normalizeStorefrontCategories(store?.storefront_categories);
  const primaryCategory = categories[0] || String(store?.workflow_mode || 'Store').replace(/_/g, ' ');
  const secondaryCategory = categories[1] || null;
  const categoryLabel = [primaryCategory, secondaryCategory].filter(Boolean).join(' \u2022 ');
	      const reviewSummary = normalizeStorefrontReviewSummary(store?.storefront_review_summary);
	      const ratingValue = Number.isFinite(Number(reviewSummary?.score)) ? Number(reviewSummary.score).toFixed(1) : '0.0';
	      const ratingCount = Number(reviewSummary?.total_count || store?.matching_item_count || 0);
  const distanceLabel = Number.isFinite(Number(store?.nearest_distance_km)) ? `${Number(store.nearest_distance_km).toFixed(1)} km away` : 'Distance unavailable';
  const waitBase = Number(store?.estimated_wait_minutes || 10);
  const etaLabel = `${waitBase}-${waitBase + 5} min`;
	      const branchCount = Number(store?.active_location_count || 0);
	      const branchLabel = branchCount > 0 ? `${branchCount} ${branchCount === 1 ? 'Branch' : 'Branches'}` : null;
	      const isStoreOpenNow = store?.storefront_open === true;
		      const businessHoursLabel = formatStorefrontHoursLabel(
        store?.storefront_hours,
        store?.nearest_location_hours || store?.storefront_hours_status?.display || ''
      );
		      const closingTimeLabel = businessHoursLabel
		        ? (/\bclose/i.test(businessHoursLabel) ? businessHoursLabel : `Closes at ${businessHoursLabel}`)
		        : '';
	      const closedStoreNote = !isStoreOpenNow
    ? `Store closed for now${businessHoursLabel ? ` \u2022 ${businessHoursLabel}` : ''}`
	        : '';
			      const isActive = highlightedStoreSlug === store.slug;
				      const isGridView = viewMode === 'grid';
      const isMobileListView = isDiscoveryMobileViewport && !isGridView;
      const isDesktopListView = !isGridView && !isDiscoveryMobileViewport && !isDiscoveryTabletViewport;
	      const isMobileGridView = isGridView && isDiscoveryMobileViewport;
	      const showFeaturedBadge = Number(store?.matching_item_count || 0) > 2;
	      const statusChipLabel = isStoreOpenNow ? 'Open' : 'Closed';
	      const compactListHeaderGap = !isGridView && !showFeaturedBadge ? 4 : 8;
	      const showInlineNonFeaturedListRating = !isGridView && !showFeaturedBadge;
				    const cardImageHeight = isGridView
				        ? (isDiscoveryMobileViewport ? 132 : isDiscoveryTabletViewport ? 166 : 116)
				        : (isMobileListView ? 72 : isDiscoveryMobileViewport ? 112 : isDiscoveryTabletViewport ? 96 : 104);
					      const actionButtonStyle = (kind) => ({
						        minHeight: isMobileListView ? 36 : isGridView ? (isDiscoveryMobileViewport ? 36 : isDiscoveryTabletViewport ? 38 : 36) : isDiscoveryTabletViewport ? 30 : (isDesktopListView ? 32 : 36),
						        height: isMobileListView ? 36 : isGridView ? (isDiscoveryMobileViewport ? 36 : isDiscoveryTabletViewport ? 38 : 36) : isDiscoveryTabletViewport ? 30 : (isDesktopListView ? 32 : 36),
						        borderRadius: isGridView ? 12 : 9,
					        border: kind === 'primary' ? 'none' : '1px solid #bfdbfe',
					        background: kind === 'primary' ? '#1A4E8D' : '#ffffff',
					        color: kind === 'primary' ? '#ffffff' : '#2563EB',
						        fontSize: isGridView ? (isDiscoveryMobileViewport ? 12 : 13) : 11,
					        fontWeight: 700,
					        lineHeight: 1.2,
					        padding: isGridView
                ? (isDiscoveryMobileViewport ? '0 8px' : '0 10px')
                : '0 12px',
					        cursor: 'pointer',
						        boxShadow: kind === 'primary' ? '0 10px 24px rgba(26,78,141,.22)' : 'none',
				            width: '100%',
			              minWidth: isMobileListView ? 102 : 0,
			              whiteSpace: isGridView && isDiscoveryMobileViewport ? 'normal' : 'nowrap',
                pointerEvents: 'auto'
					      });
		      if (isGridView) {
		        return (
			        <article
			          key={`${store.slug}:${preferredLocationId ?? 'store'}`}
			          className="discovery-grid-card"
			          onMouseEnter={() => setHighlightedStoreSlug(store.slug)}
			          style={{
			            borderRadius: 16,
			            border: '1px solid #E5EAF3',
			            background: '#ffffff',
			            boxShadow: isActive ? '0 18px 34px rgba(15,23,42,.10)' : '0 10px 28px rgba(15,23,42,.06)',
			            opacity: isStoreOpenNow ? 1 : 0.76,
			            overflow: 'hidden',
			            display: 'grid',
			            gridTemplateRows: `${cardImageHeight}px auto`,
			            transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
			            width: '100%',
			            minWidth: 0,
					            minHeight: isMobileGridView ? 0 : 268
				          }}
				        >
		            <div style={{ position: 'relative', height: cardImageHeight, background: '#f8fafc', overflow: 'hidden' }}>
		              {imgUrl && !isBrandingImageBlocked(imgKey)
		                ? <img src={imgUrl} alt={store.tenant_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => markBrandingImageError(imgKey)} />
		                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#dbeafe,#f8fafc)', display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>DGFY</div>}
		              <span
		                style={{
		                  position: 'absolute',
		                  top: 12,
		                  left: 12,
		                  borderRadius: 999,
		                  padding: isMobileGridView ? '5px 10px' : '6px 12px',
		                  background: isStoreOpenNow ? 'rgba(220,252,231,.98)' : 'rgba(254,226,226,.98)',
		                  color: isStoreOpenNow ? '#22C55E' : '#DC2626',
		                  fontSize: isMobileGridView ? 11 : 12,
		                  fontWeight: 800,
		                  lineHeight: 1
		                }}
		              >
		                {statusChipLabel}
		              </span>
		            </div>
			            <div style={{ minWidth: 0, display: 'grid', gap: isMobileGridView ? 8 : 10, padding: isMobileGridView ? '14px' : '16px 18px', alignContent: 'start' }}>
			              <div style={{ display: 'grid', gap: isMobileGridView ? 7 : 8 }}>
			                <div style={{ display: 'flex', alignItems: 'center', gap: isMobileGridView ? 8 : 10, flexWrap: isMobileGridView ? 'wrap' : 'nowrap', minWidth: 0 }}>
			                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0, flex: '1 1 auto' }}>
			                    <h3 style={{ margin: 0, fontSize: isMobileGridView ? 17 : 18, lineHeight: 1.18, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
			                      {store.tenant_name}
			                    </h3>
		                    <span title={isStoreOpenNow ? 'Open' : 'Closed'} aria-label={isStoreOpenNow ? 'Open' : 'Closed'} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
		                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: isStoreOpenNow ? '#22C55E' : '#EF4444', boxShadow: `0 0 0 3px ${isStoreOpenNow ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)'}` }} />
		                    </span>
		                  </div>
		                  {showFeaturedBadge ? (
			                    <span style={{ borderRadius: 999, padding: isMobileGridView ? '3px 8px' : '4px 10px', fontSize: 10, fontWeight: 800, background: '#fff7ed', color: '#F97316', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: '100%' }}>
		                      <Star size={11} fill="currentColor" />
		                      Featured
		                    </span>
		                  ) : (
			                    <span style={{ borderRadius: 999, padding: isMobileGridView ? '3px 8px' : '4px 10px', fontSize: 10, fontWeight: 800, background: '#fffbeb', color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
		                      <Star size={11} fill="currentColor" />
		                      {ratingValue}
		                    </span>
		                  )}
		                </div>
			                <div style={{ fontSize: isMobileGridView ? 12 : 13, fontWeight: 600, color: '#64748B', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>
			                  {categoryLabel || 'Local storefront'}
			                </div>
			              </div>
				              <div style={{ display: 'grid', gap: isMobileGridView ? 7 : 8, fontSize: isMobileGridView ? 11 : 12, color: '#64748B', minWidth: 0 }}>
				                <div style={{ display: 'flex', alignItems: 'center', gap: isMobileGridView ? 8 : 10, flexWrap: 'wrap', lineHeight: 1.45 }}>
				                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
				                    <MapPin size={13} color="#94a3b8" />
				                    {distanceLabel}
				                  </span>
                                  <span style={{ color: '#cbd5e1' }}>{'\u2022'}</span>
				                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
			                    <Clock3 size={13} color="#94a3b8" />
			                    {etaLabel}
			                  </span>
				                </div>
				                <div style={{ lineHeight: 1.4 }}>
				                  {closingTimeLabel || 'Closing time unavailable'}
				                </div>
				              </div>
				              <div style={{ display: 'grid', gap: isMobileGridView ? 8 : 10, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', marginTop: isMobileGridView ? 0 : 2 }}>
		                <button type="button" className="discovery-grid-action discovery-grid-action-secondary" onClick={() => goStore(store.slug, preferredLocationId)} style={actionButtonStyle('secondary')}>View Store</button>
		                <button type="button" className="discovery-grid-action discovery-grid-action-primary" onClick={() => goStoreOrderForDiscovery(store.slug, preferredLocationId, store)} style={actionButtonStyle('primary')}>Order Now</button>
		              </div>
		            </div>
		          </article>
		        );
		      }
		      return (
      isMobileListView ? (
	            <article
          key={`${store.slug}:${preferredLocationId ?? 'store'}`}
          onMouseEnter={() => setHighlightedStoreSlug(store.slug)}
	              style={{
	                borderRadius: 18,
	                border: `1px solid ${isActive ? '#bfdbfe' : '#e5edf5'}`,
	                background: '#ffffff',
	                boxShadow: isActive ? '0 14px 30px rgba(37,99,235,.08)' : '0 8px 22px rgba(15,23,42,.05)',
	                opacity: isStoreOpenNow ? 1 : 0.7,
	                padding: 12,
	                display: 'grid',
            gap: 10,
            transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease'
          }}
        >
	              <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
            <div
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                background: '#f8fafc',
	                    height: 90
              }}
            >
              {imgUrl && !isBrandingImageBlocked(imgKey)
                ? <img src={imgUrl} alt={store.tenant_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => markBrandingImageError(imgKey)} />
                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#dbeafe,#f8fafc)', display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>DGFY</div>}
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
		                  <div style={{ display: 'flex', alignItems: 'center', gap: compactListHeaderGap, flexWrap: 'nowrap', minWidth: 0 }}>
		                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto' }}>
		                      <h3 style={{ margin: 0, fontSize: 15, lineHeight: 1.12, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{store.tenant_name}</h3>
		                      <span
		                        title={isStoreOpenNow ? 'Open' : 'Closed'}
		                        aria-label={isStoreOpenNow ? 'Open' : 'Closed'}
		                        style={{ display: 'inline-flex', alignItems: 'center', transform: 'translateY(1px)', flexShrink: 0 }}
		                      >
		                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isStoreOpenNow ? '#22c55e' : '#ef4444', boxShadow: `0 0 0 3px ${isStoreOpenNow ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)'}` }} />
		                      </span>
		                    </div>
		                    {Number(store?.matching_item_count || 0) > 2 && (
		                      <span style={{ borderRadius: 999, padding: '2px 7px', fontSize: 10, fontWeight: 800, background: '#fff7ed', color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
		                        <Star size={10} fill="currentColor" />
	                        Featured
	                      </span>
	                    )}
		                    {showInlineNonFeaturedListRating && <span style={{ fontSize: 11, fontWeight: 800, color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
		                      <Star size={11} fill="currentColor" />
		                      {ratingValue}
		                    </span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {categoryLabel || 'Local storefront'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <MapPin size={12} color="#94a3b8" />
                  {distanceLabel}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock3 size={12} color="#94a3b8" />
                  {etaLabel}
                </span>
              </div>
	                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
	                    {branchLabel && <span style={{ fontWeight: 600 }}>{branchLabel}</span>}
                {Number(store?.catalog_count || 0) > 0 && (
                  <>
                        <span style={{ color: '#cbd5e1' }}>{'\u2022'}</span>
                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>{Number(store.catalog_count)} item(s)</span>
                  </>
                )}
	                  </div>
	                  {!isStoreOpenNow && (
	                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginTop: 1 }}>
	                      {closedStoreNote}
	                    </div>
	                  )}
	                </div>
	              </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" onClick={() => goStoreOrderForDiscovery(store.slug, preferredLocationId, store)} style={actionButtonStyle('primary')}>Order Now</button>
            <button type="button" onClick={() => goStore(store.slug, preferredLocationId)} style={actionButtonStyle('secondary')}>View Store</button>
          </div>
        </article>
      ) : (
			        <article
		          key={`${store.slug}:${preferredLocationId ?? 'store'}`}
		          onMouseEnter={() => setHighlightedStoreSlug(store.slug)}
			          style={{
	            borderRadius: 20,
	            border: `1px solid ${isActive ? '#bfdbfe' : '#e5edf5'}`,
	            background: '#ffffff',
		            boxShadow: isActive ? '0 16px 34px rgba(37,99,235,.08)' : '0 10px 28px rgba(15,23,42,.05)',
		            opacity: isStoreOpenNow ? 1 : 0.72,
				            padding: isGridView ? 12 : isDiscoveryMobileViewport ? 12 : 14,
			            display: 'grid',
			            gap: isGridView ? 12 : isDiscoveryMobileViewport ? 10 : 14,
			            gridTemplateColumns: isGridView
			              ? '1fr'
			              : isMobileListView
			                ? '72px minmax(0,1fr) auto'
		                : '104px minmax(0,1fr) 126px',
        alignItems: isGridView ? 'stretch' : isDesktopListView ? 'stretch' : 'center',
        transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease'
      }}
    >
		          <div
	            style={{
		              borderRadius: 16,
		              overflow: 'hidden',
		              background: '#f8fafc',
	              height: cardImageHeight,
	              minWidth: 0,
	              position: 'relative'
	            }}
	          >
	            {imgUrl && !isBrandingImageBlocked(imgKey)
	              ? <img src={imgUrl} alt={store.tenant_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={() => markBrandingImageError(imgKey)} />
	              : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#dbeafe,#f8fafc)', display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 800 }}>DGFY</div>}
	            {isGridView && (
	              <>
	                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,.18) 0%, rgba(15,23,42,0) 42%, rgba(15,23,42,.08) 100%)', pointerEvents: 'none' }} />
	                <span
	                  style={{
	                    position: 'absolute',
	                    top: 10,
	                    left: 10,
	                    borderRadius: 999,
	                    padding: isMobileGridView ? '4px 8px' : '4px 10px',
	                    background: isStoreOpenNow ? 'rgba(220,252,231,.96)' : 'rgba(254,226,226,.96)',
	                    color: isStoreOpenNow ? '#15803d' : '#b91c1c',
	                    fontSize: isMobileGridView ? 10 : 11,
	                    fontWeight: 800,
	                    lineHeight: 1
	                  }}
	                >
	                  {statusChipLabel}
	                </span>
	                <button
	                  type="button"
	                  aria-label={`Save ${store.tenant_name}`}
	                  style={{
	                    position: 'absolute',
	                    top: 10,
	                    right: 10,
	                    width: isMobileGridView ? 28 : 30,
	                    height: isMobileGridView ? 28 : 30,
	                    borderRadius: '50%',
	                    border: '1px solid rgba(255,255,255,.55)',
	                    background: 'rgba(15,23,42,.44)',
	                    color: '#ffffff',
	                    display: 'grid',
	                    placeItems: 'center',
	                    cursor: 'default',
	                    pointerEvents: 'none',
	                    backdropFilter: 'blur(10px)'
	                  }}
	                >
	                  <Heart size={isMobileGridView ? 14 : 15} />
	                </button>
	              </>
	            )}
	          </div>

					          <div style={{ minWidth: 0, display: 'grid', gap: isGridView ? 8 : isMobileListView ? 4 : 8 }}>
					            <div style={{ display: 'flex', alignItems: 'center', gap: compactListHeaderGap, flexWrap: isDesktopListView ? 'nowrap' : 'wrap' }}>
					              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flex: isDesktopListView ? '1 1 auto' : '0 1 auto' }}>
						              <h3 style={{ margin: 0, fontSize: isGridView ? (isMobileGridView ? 15 : 16) : isMobileListView ? 15 : 19, lineHeight: 1.15, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{store.tenant_name}</h3>
						              <span
						                title={isStoreOpenNow ? 'Open' : 'Closed'}
						                aria-label={isStoreOpenNow ? 'Open' : 'Closed'}
					                style={{ display: 'inline-flex', alignItems: 'center', transform: 'translateY(1px)', flexShrink: 0 }}
						              >
					                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isStoreOpenNow ? '#22c55e' : '#ef4444', boxShadow: `0 0 0 3px ${isStoreOpenNow ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)'}` }} />
					              </span>
							              {showInlineNonFeaturedListRating && !isDesktopListView && (
							                <span style={{ borderRadius: 999, padding: '4px 9px', fontSize: 10, fontWeight: 800, background: '#fffbeb', color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
							                  <Star size={11} fill="currentColor" />
							                  {ratingValue}
							                  <span style={{ color: '#a16207', fontWeight: 700 }}>({ratingCount})</span>
							                </span>
						              )}
						              </div>
				              {showFeaturedBadge && (
				                <span style={{ borderRadius: 999, padding: isGridView ? '3px 8px' : '4px 9px', fontSize: 10, fontWeight: 800, background: '#fff7ed', color: '#f97316', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
			                  <Star size={11} fill="currentColor" />
			                  Featured
			                </span>
			              )}
			              {!isGridView && isDesktopListView && (
			                <span style={{ borderRadius: 999, padding: '4px 9px', fontSize: 10, fontWeight: 800, background: '#fffbeb', color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
			                  <Star size={11} fill="currentColor" />
			                  {ratingValue}
			                  <span style={{ color: '#a16207', fontWeight: 700 }}>({ratingCount})</span>
			                </span>
			              )}
			            </div>
				            <div style={{ fontSize: isGridView ? 12 : isMobileListView ? 11 : 12, fontWeight: 600, color: '#64748b', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{categoryLabel || 'Local storefront'}</div>
		                    <div style={{ display: 'flex', alignItems: 'center', gap: isGridView ? 8 : isMobileListView ? 8 : 10, flexWrap: 'wrap', fontSize: isGridView ? 11 : isMobileListView ? 11 : 12, color: '#64748b' }}>
		              {isGridView && (
		                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#d97706', fontWeight: 800 }}>
		                  <Star size={11} fill="currentColor" />
		                  {ratingValue}
		                  <span style={{ color: '#94a3b8', fontWeight: 700 }}>({ratingCount})</span>
		                </span>
		              )}
                      {isGridView && <span style={{ color: '#cbd5e1' }}>{'\u2022'}</span>}
	              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
	                <MapPin size={13} color="#94a3b8" />
	                {distanceLabel}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Clock3 size={13} color="#94a3b8" />
            {etaLabel}
          </span>
        </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {branchLabel && <span style={{ fontSize: isGridView ? 11 : isMobileListView ? 11 : 12, fontWeight: 600, color: '#64748b' }}>{branchLabel}</span>}
          {Number(store?.catalog_count || 0) > 0 && <span style={{ fontSize: isGridView ? 11 : isMobileListView ? 11 : 12, fontWeight: 600, color: '#94a3b8' }}>{Number(store.catalog_count)} item(s)</span>}
                  </div>
                  {!isStoreOpenNow && (
                    <div style={{ fontSize: isGridView ? 10 : 11, fontWeight: 700, color: '#b45309' }}>
                      {closedStoreNote}
                    </div>
                  )}
              </div>

        <div style={{ display: 'grid', gap: 8, alignSelf: isMobileListView ? 'start' : 'stretch', alignContent: isDesktopListView ? 'end' : 'start', justifyContent: isDesktopListView ? 'end' : 'stretch', gridTemplateColumns: isGridView ? '1fr 1fr' : '1fr', gridColumn: 'auto', marginTop: isGridView ? 2 : 0, minWidth: isMobileListView ? 104 : (isDesktopListView ? 126 : 0) }}>
          {isGridView ? (
            <>
              <button type="button" onClick={() => goStore(store.slug, preferredLocationId)} style={actionButtonStyle('secondary')}>View Store</button>
              <button type="button" onClick={() => goStoreOrderForDiscovery(store.slug, preferredLocationId, store)} style={actionButtonStyle('primary')}>Order Now</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => goStoreOrderForDiscovery(store.slug, preferredLocationId, store)} style={actionButtonStyle('primary')}>Order Now</button>
              <button type="button" onClick={() => goStore(store.slug, preferredLocationId)} style={actionButtonStyle('secondary')}>View Store</button>
            </>
          )}
        </div>
      </article>
      )
	      );
	    };
		    const isResultsPanelVisible = isDiscoveryMobileViewport ? !isMobileResultsCollapsed : isStoreListVisible;
			    const desktopResultsPanelWidth = isDiscoveryMobileViewport
			      ? '100%'
			      : isDiscoveryTabletViewport
			        ? '100%'
			        : `${discoveryLayout.resultsPanelWidth}px`;
    const discoveryStageMapHeight = isDiscoveryMobileViewport
      ? '312px'
      : discoveryLayout.discoveryMapHeight;
	    return (
  <DiscoveryMapCard viewportMode={discoveryViewportMode}>
    <div
      className={`discovery-results-card ${isDiscoveryMobileViewport ? 'discovery-results-card--mobile-fullbleed-map' : ''}`}
      style={{ borderRadius: 24, overflow: isDiscoveryMobileViewport ? 'visible' : 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 12px 42px rgba(15,23,42,.08)', background: '#ffffff' }}
    >
      <div
        className={`discovery-results-stage ${isDiscoveryMobileViewport ? 'discovery-results-stage--mobile discovery-results-stage--mobile-fullbleed-map' : (isDiscoveryTabletViewport ? 'discovery-results-stage--tablet' : 'discovery-results-stage--desktop')}`}
        style={{ display: 'flex', flexDirection: isDiscoveryMobileViewport || isDiscoveryTabletViewport ? 'column' : 'row', alignItems: 'stretch', position: 'relative', overflow: isDiscoveryMobileViewport ? 'visible' : 'hidden', transition: 'all 350ms cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div
          className={`discovery-results-stage__map ${isDiscoveryMobileViewport ? `discovery-results-stage__map--mobile-fullbleed ${isResultsPanelVisible ? 'is-results-visible' : 'is-results-hidden'}` : ''}`}
          style={{ position: 'relative', zIndex: 20, flex: '1 1 auto', minWidth: 0, height: discoveryStageMapHeight }}
        >
          {!loadingStores && !storesError && (searchedDiscoveryMapPins.length > 0 || (hasDiscoverySearch && filteredDiscoveryStores.length === 0)) ? (
            <StoresMap
              key={discoveryResultsMapKey}
              stores={searchedDiscoveryMapPins}
              selectedKey={highlightedDiscoveryMarkerKey || null}
              userLocation={discoveryCoords}
              height="100%"
	                  onSelectStore={(pin) => {
	                    setHasDiscoveryExplorationStarted(true);
                  setIsMobileResultsCollapsed(false);
	                    setHighlightedStoreSlug(pin.slug);
                setHighlightedDiscoveryMarkerKey(getDiscoveryMarkerKey(pin) || '');
                const matched = filteredDiscoveryStores.find((s) => s.slug === pin.slug)
                  || discoveryResultStores.find((s) => s.slug === pin.slug)
                  || storesWithNearestBranch.find((s) => s.slug === pin.slug)
                  || null;
                setSelectedMapPin(matched || pin || null);
                goStore(pin.slug, pin.location_id ?? null);
              }}
              autoOpenPopups={filteredDiscoveryStores.length > 0}
              openPopupOnHover={true}
            />
          ) : (
            <div style={{ height: '100%', background: '#f8fafc', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
              {loadingStores ? 'Loading map...' : storesError || 'No storefront pins available right now.'}
		            </div>
          )}
          {isDiscoveryMobileViewport && (
            <button
              type="button"
              onClick={() => setIsMobileResultsCollapsed((v) => !v)}
              className="discovery-results-stage__mobile-toggle"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: isResultsPanelVisible ? 12 : 46,
                transform: 'translateX(-50%)',
                zIndex: 40,
                border: 'none',
                borderRadius: 14,
                background: '#1a4e8d',
                color: '#fff',
                height: 38,
                padding: '0 14px',
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 10px 24px rgba(37,99,235,.28)',
                opacity: isResultsPanelVisible ? 0.9 : 1
              }}
            >
              {isResultsPanelVisible ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {isResultsPanelVisible
                ? 'Hide Results'
                : `View Results${filteredDiscoveryStores.length >= 0 ? ` (${filteredDiscoveryStores.length})` : ''}`}
            </button>
          )}
          {!isDiscoveryMobileViewport && <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 11 }}>
            <button
              type="button"
              onClick={() => setIsStoreListVisible((value) => !value)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                borderRadius: 12,
                border: 'none',
                background: isStoreListVisible ? '#0f172a' : '#1a4e8d',
                color: '#fff',
                padding: '10px 16px',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(15,23,42,.24)',
                transition: 'background 200ms'
              }}
            >
              {isStoreListVisible ? <X size={14} /> : <List size={14} />}
              {isStoreListVisible ? 'Hide Results' : `View Results${filteredDiscoveryStores.length ? ` (${filteredDiscoveryStores.length})` : ''}`}
            </button>
          </div>}
        </div>

        <aside
          className={`discovery-results-stage__panel ${isDiscoveryMobileViewport ? 'discovery-results-stage__panel--mobile' : (isDiscoveryTabletViewport ? 'discovery-results-stage__panel--tablet' : 'discovery-results-stage__panel--desktop')}`}
          style={{
            background: '#fff',
            borderLeft: isResultsPanelVisible ? '1px solid #e2e8f0' : 'none',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
            overflow: 'hidden',
            position: 'static',
            zIndex: 10,
	                width: isResultsPanelVisible ? desktopResultsPanelWidth : '0px',
            minWidth: 0,
	                maxHeight: isDiscoveryMobileViewport ? (isResultsPanelVisible ? 'calc(100vh - 220px)' : '0px') : discoveryLayout.resultsPanelMaxHeight,
	                opacity: isResultsPanelVisible ? 1 : 0,
	                transition: 'width 350ms cubic-bezier(0.4,0,0.2,1), opacity 300ms ease, border-color 350ms, max-height 280ms ease, transform 280ms ease',
	                marginTop: isDiscoveryMobileViewport ? -20 : 0,
            borderTopLeftRadius: isDiscoveryMobileViewport ? 26 : 0,
            borderTopRightRadius: isDiscoveryMobileViewport ? 26 : 0,
	                boxShadow: isDiscoveryMobileViewport ? '0 -8px 24px rgba(15,23,42,.12)' : 'none',
              transform: isDiscoveryMobileViewport ? (isResultsPanelVisible ? 'translateY(0)' : 'translateY(14px)') : 'none',
              pointerEvents: isResultsPanelVisible ? 'auto' : 'none'
	              }}
	            >
	              <div style={{ padding: isDiscoveryMobileViewport ? '34px 18px 14px' : '24px 22px 16px', borderBottom: '1px solid #edf2f7', display: 'grid', gap: 14 }}>
	                <div style={{ display: 'flex', alignItems: isDiscoveryMobileViewport ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
	                  <div style={{ minWidth: 0 }}>
	                    <div style={{ fontSize: 11, fontWeight: 800, color: '#1a4e8d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Discover Nearby</div>
	                    <h2 style={{ margin: '6px 0 0', fontSize: isDiscoveryMobileViewport ? 24 : 29, lineHeight: 1.08, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>Best Shops Today</h2>
	                    <p
	                      style={{
	                        margin: '8px 0 0',
	                        fontSize: isDiscoveryMobileViewport ? 12 : 14,
	                        lineHeight: isDiscoveryMobileViewport ? 1.4 : 1.6,
	                        color: '#64748b',
	                        maxWidth: isDiscoveryMobileViewport ? 360 : 430
	                      }}
	                    >
	                      {resultsSubtitle}
	                    </p>
	                  </div>
	                </div>

		                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'nowrap' }}>
		                  <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', justifyContent: 'flex-end', marginLeft: 'auto', order: 2 }}>
		                    <button
		                      type="button"
		                      onClick={() => setViewMode('list')}
		                      style={viewButtonStyle('list')}
		                      aria-label="List view"
		                      title="List view"
		                    >
		                      <List size={15} />
		                      {!isDiscoveryMobileViewport && 'List View'}
		                    </button>
		                    <button
		                      type="button"
		                      onClick={() => setViewMode('grid')}
		                      style={viewButtonStyle('grid')}
		                      aria-label="Grid view"
		                      title="Grid view"
		                    >
		                      <LayoutGrid size={15} />
		                      {!isDiscoveryMobileViewport && 'Grid View'}
		                    </button>
		                  </div>
		                  <div style={{ fontSize: isDiscoveryMobileViewport ? 16 : 18, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', order: 1 }}>
		                    {resultCountLabel}
		                  </div>
		                </div>

	                <div
	                  ref={discoveryFilterToolbarRef}
	                  style={{
	                    display: 'grid',
			                    gridTemplateColumns: isDiscoveryMobileViewport
			                      ? (renderDiscoveryResetButton
			                                ? 'max-content 44px 44px max-content'
			                                : 'max-content 44px 44px')
		                      : isDiscoveryTabletViewport
		                        ? (renderDiscoveryResetButton
		                          ? 'minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(0, 0.7fr) minmax(0, 0.9fr)'
			                          : 'minmax(0, 1.3fr) minmax(0, 1.3fr) minmax(0, 0.84fr)')
		                        : (renderDiscoveryResetButton
		                          ? 'minmax(0, 0.74fr) minmax(0, 1fr) minmax(0, 1.24fr) minmax(0, 0.86fr)'
		                          : 'minmax(0, 0.74fr) minmax(0, 1fr) minmax(0, 1.24fr)'),
		                    gap: 8,
		                    alignItems: 'stretch',
	                    justifyContent: isDiscoveryMobileViewport ? 'start' : 'stretch',
	                    position: 'relative',
	                    zIndex: 30
		                  }}
	                >
	                  <button
	                    type="button"
	                    onClick={() => setDiscoveryOpenFilter((value) => (value === 'open' ? 'all' : 'open'))}
		                    style={{
		                      minHeight: 34,
		                      borderRadius: 10,
		                      border: `1px solid ${isOpenNowFilterActive ? '#86efac' : '#dcfce7'}`,
		                      background: isOpenNowFilterActive ? '#16a34a' : '#f0fdf4',
		                      color: isOpenNowFilterActive ? '#ffffff' : '#16a34a',
		                      padding: '0 14px',
		                      fontSize: 12,
		                      fontWeight: 700,
	                      cursor: 'pointer',
	                      display: 'inline-flex',
	                      alignItems: 'center',
	                      justifyContent: 'center',
		                      width: isDiscoveryMobileViewport ? 'auto' : '100%',
		                      minWidth: isDiscoveryMobileViewport ? 88 : 0,
		                      maxWidth: isDiscoveryMobileViewport ? 'none' : 148,
		                      boxShadow: isOpenNowFilterActive ? '0 10px 22px rgba(22,163,74,.24)' : 'none',
		                      transition: 'all 180ms ease'
		                    }}
		                  >
		                    Open Now
		                  </button>
		                  <div style={{ position: 'relative', minWidth: 0 }}>
	                    <button
	                      type="button"
	                      onClick={() => setActiveDiscoveryFilterDropdown((current) => (current === 'sort' ? null : 'sort'))}
			                      style={{ minHeight: 34, borderRadius: 10, border: `1px solid ${isSortFilterActive ? '#93c5fd' : '#e2e8f0'}`, padding: isDiscoveryMobileViewport ? '0' : '0 10px', fontSize: 12, fontWeight: 700, color: isSortFilterActive ? '#1a4e8d' : '#334155', background: isSortFilterActive ? '#eff6ff' : '#fff', cursor: 'pointer', minWidth: 0, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: isDiscoveryMobileViewport ? 'center' : 'space-between', gap: 8, boxShadow: isSortFilterActive ? '0 8px 18px rgba(37,99,235,.16)' : 'none', transition: 'all 180ms ease' }}
			                    >
				                      {isDiscoveryMobileViewport ? (
				                        <ArrowUpDown size={14} color={isSortFilterActive ? '#1a4e8d' : '#64748b'} />
			                      ) : (
			                        <>
			                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>Sort: {discoverySortLabelByValue[discoverySortBy] || 'Nearest'}</span>
		                          <ChevronDown size={14} color="#64748b" />
			                        </>
			                      )}
			                    </button>
	                    {activeDiscoveryFilterDropdown === 'sort' && (
		                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: isDiscoveryMobileViewport ? 0 : 0, right: isDiscoveryMobileViewport ? 'auto' : 0, minWidth: isDiscoveryMobileViewport ? 180 : 0, borderRadius: 10, border: '1px solid #dbe5f2', background: '#fff', boxShadow: '0 14px 30px rgba(15,23,42,.10)', overflow: 'hidden', zIndex: 1200 }}>
	                        {[
	                          ['nearest', 'Nearest'],
	                          ['catalog', 'Most Popular'],
	                          ['rating', 'Highest Rated']
		                        ].map(([value, label]) => (
	                          <button
	                            key={value}
	                            type="button"
	                            onClick={() => {
	                              setDiscoverySortBy(value);
	                              setActiveDiscoveryFilterDropdown(null);
	                            }}
	                            style={{
	                              width: '100%',
	                              border: 'none',
	                              borderTop: value === 'nearest' ? 'none' : '1px solid #eef2f7',
	                              background: discoverySortBy === value ? '#eff6ff' : '#fff',
	                              color: discoverySortBy === value ? '#1a4e8d' : '#334155',
	                              textAlign: 'left',
	                              padding: '8px 10px',
	                              fontSize: 12,
	                              fontWeight: discoverySortBy === value ? 800 : 700,
	                              cursor: 'pointer'
	                            }}
	                          >
	                            {label}
	                          </button>
	                        ))}
	                      </div>
	                    )}
	                  </div>
	                  <div style={{ position: 'relative', minWidth: 0 }}>
	                    <button
	                      type="button"
	                      onClick={() => setActiveDiscoveryFilterDropdown((current) => (current === 'category' ? null : 'category'))}
			                      style={{ minHeight: 34, borderRadius: 10, border: `1px solid ${isCategoryFilterActive ? '#93c5fd' : '#e2e8f0'}`, padding: isDiscoveryMobileViewport ? '0' : '0 10px', fontSize: 12, fontWeight: 700, color: isCategoryFilterActive ? '#1a4e8d' : '#334155', background: isCategoryFilterActive ? '#eff6ff' : '#fff', cursor: 'pointer', minWidth: 0, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: isDiscoveryMobileViewport ? 'center' : 'space-between', gap: 8, boxShadow: isCategoryFilterActive ? '0 8px 18px rgba(37,99,235,.16)' : 'none', transition: 'all 180ms ease' }}
			                    >
					                      {isDiscoveryMobileViewport ? (
					                        <ArrowUpNarrowWide size={14} color={isCategoryFilterActive ? '#1a4e8d' : '#64748b'} />
					                      ) : (
		                        <>
		                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{discoveryBusinessModeOptions.find(([value]) => value === discoveryCategoryFilter)?.[1] || 'Category: All'}</span>
		                          <ChevronDown size={14} color="#64748b" />
			                        </>
			                      )}
			                    </button>
				                    {activeDiscoveryFilterDropdown === 'category' && (
				                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: isDiscoveryMobileViewport ? 0 : 0, right: isDiscoveryMobileViewport ? 'auto' : 0, minWidth: isDiscoveryMobileViewport ? 184 : 250, maxWidth: isDiscoveryMobileViewport ? 196 : 320, borderRadius: 10, border: '1px solid #dbe5f2', background: '#fff', boxShadow: '0 14px 30px rgba(15,23,42,.10)', zIndex: 1200, overflow: 'hidden' }}>
		                              <div style={{ maxHeight: 214, overflowY: 'auto', overflowX: 'hidden' }}>
		                        {discoveryBusinessModeOptions.map(([value, label], index) => (
		                          <button
		                            key={value}
		                            type="button"
		                            onClick={() => {
		                              setDiscoveryCategoryFilter(value);
		                              setActiveDiscoveryFilterDropdown(null);
		                            }}
		                            style={{
		                              width: '100%',
		                              border: 'none',
		                              borderTop: index === 0 ? 'none' : '1px solid #eef2f7',
		                              background: discoveryCategoryFilter === value ? '#eff6ff' : '#fff',
		                              color: discoveryCategoryFilter === value ? '#1a4e8d' : '#334155',
		                              textAlign: 'left',
		                              padding: '8px 10px',
		                              fontSize: 12,
		                              fontWeight: discoveryCategoryFilter === value ? 800 : 700,
		                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
		                            }}
		                          >
		                            {label}
		                          </button>
		                        ))}
                          </div>
                          <div style={{ borderTop: '1px solid #eef2f7', background: '#f8fafc', color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Scroll</span>
                            <span>Drag</span>
                          </div>
		                      </div>
		                    )}
	                  </div>
		                  {renderDiscoveryResetButton && (
	                    <button
	                      type="button"
		                      onClick={resetDiscoveryResultsView}
                      aria-label="Reset discovery filters"
                      title="Reset filters"
		                      style={{
		                        minHeight: 34,
		                        borderRadius: 10,
		                        border: '1px solid rgba(220, 38, 38, 0.18)',
		                        background: 'rgba(220, 38, 38, 0.06)',
		                        color: '#dc2626',
		                        padding: isDiscoveryMobileViewport ? '0 9px' : '0 12px',
		                        fontSize: 12,
		                        fontWeight: 700,
		                        cursor: 'pointer',
		                        display: 'inline-flex',
		                        alignItems: 'center',
		                        gap: 6,
		                        justifyContent: 'center',
		                        width: isDiscoveryMobileViewport ? 'auto' : '100%',
		                        opacity: showDiscoveryResetButton ? 1 : 0,
		                        transform: showDiscoveryResetButton ? 'translateY(0)' : 'translateY(-4px)',
		                        transition: 'opacity 180ms ease, transform 180ms ease',
		                        pointerEvents: showDiscoveryResetButton ? 'auto' : 'none'
		                      }}
		                    >
			                      <X size={12} />
                      <span style={{ whiteSpace: 'nowrap' }}>{isDiscoveryMobileViewport ? 'Filters' : 'Reset Filters'}</span>
                      {activeDiscoveryFilterCount > 0 ? (
                        <span
                          style={{
                            minWidth: 16,
                            height: 16,
                            borderRadius: 999,
                            padding: '0 5px',
                            background: '#1a4e8d',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {activeDiscoveryFilterCount}
                        </span>
                      ) : null}
		                    </button>
		                  )}
                  {activeDiscoveryFilterCount > 0 && !isDiscoveryMobileViewport && !renderDiscoveryResetButton ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: -9,
                        right: renderDiscoveryResetButton ? 6 : -4,
                        minWidth: 18,
                        height: 18,
                        borderRadius: 999,
                        padding: '0 6px',
                        background: '#1a4e8d',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 6px 14px rgba(26,78,141,.28)',
                        pointerEvents: 'none'
                      }}
                    >
                      {activeDiscoveryFilterCount}
                    </div>
                  ) : null}
		                </div>
          </div>

	              <div style={{ minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: isDiscoveryMobileViewport ? '14px 14px 18px' : viewMode === 'grid' ? '18px 22px 24px' : '16px 18px 22px' }}>
            {loadingStores && <div style={{ padding: 24, color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>Loading stores...</div>}
            {!loadingStores && filteredDiscoveryStores.length === 0 && (
              <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#f8fbff', padding: 18, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 24, color: '#0f172a', fontWeight: 800 }}>{getDiscoveryEmptyStateMessage(search)}</div>
                <div style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>Try changing your search keyword or category.</div>
                {hasActiveDiscoveryFilters && (
                  <button type="button" onClick={resetDiscoveryResultsView} style={{ marginTop: 4, border: 'none', borderRadius: 12, background: '#1a4e8d', color: '#fff', padding: '10px 14px', fontSize: 13, fontWeight: 700, width: 'fit-content' }}>
                    Clear Filters
                  </button>
                )}
              </div>
            )}
		                <div style={{ display: 'grid', gap: viewMode === 'grid' ? (isDiscoveryMobileViewport ? 14 : isDiscoveryTabletViewport ? 18 : 20) : (isDiscoveryMobileViewport ? 14 : 18), gridTemplateColumns: viewMode === 'grid' ? (isDiscoveryMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))') : '1fr' }}>
	                  {paginatedDiscoveryStores.map(renderDiscoveryStoreCard)}
	                </div>
          </div>

          {filteredDiscoveryStores.length > 0 && discoveryTotalPages > 1 && (
            <div style={{ padding: '0 18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDiscoveryResultsPage((page) => Math.max(1, page - 1))}
                disabled={discoveryResultsPage === 1}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: discoveryResultsPage === 1 ? '#cbd5e1' : '#64748b', cursor: discoveryResultsPage === 1 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <ChevronLeft size={16} />
              </button>
              {discoveryPaginationItems.map((item) => (
                item === 'ellipsis-left' || item === 'ellipsis-right'
                  ? <span key={item} style={{ minWidth: 24, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>...</span>
                  : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setDiscoveryResultsPage(Number(item))}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        border: `1px solid ${Number(item) === discoveryResultsPage ? '#1a4e8d' : '#e2e8f0'}`,
                        background: Number(item) === discoveryResultsPage ? '#1a4e8d' : '#fff',
                        color: Number(item) === discoveryResultsPage ? '#fff' : '#64748b',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0
                      }}
                    >
                      {item}
                    </button>
                  )
              ))}
              <button
                type="button"
                onClick={() => setDiscoveryResultsPage((page) => Math.min(discoveryTotalPages, page + 1))}
                disabled={discoveryResultsPage === discoveryTotalPages}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: discoveryResultsPage === discoveryTotalPages ? '#cbd5e1' : '#64748b', cursor: discoveryResultsPage === discoveryTotalPages ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  </DiscoveryMapCard>
);

  };
}
