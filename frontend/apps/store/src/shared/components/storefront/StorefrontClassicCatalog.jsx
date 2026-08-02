import React from 'react';
import { Sparkles } from 'lucide-react';

import { STYLES } from '../../theme/storefrontStyleTokens.js';
import { Badge, GhostButton, PrimaryButton } from '../StorefrontActionPrimitives.jsx';
import { StorefrontDropdown } from '../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { StoreCatalogEmptyStates } from '../../../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { getStorefrontContactFooterLinks, getStorefrontSocialFooterLinks } from '../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { isItemAvailable } from '../../model/storefrontCatalogModel.js';
import { money } from '../../utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../utils/storefrontImageSources.js';
import { FNB_CATEGORY_ICON_MAP } from '../../../modes/fnb/storefront/model/fnbStorefrontPresentation.js';
import { FnbCatalogToolbar } from '../../../modes/fnb/storefront/components/FnbCatalogToolbar.jsx';
import { FnbProductCard } from '../../../modes/fnb/storefront/components/FnbProductCard.jsx';
import { FnbItemReviewModal } from '../../../modes/fnb/storefront/components/FnbItemReviewModal.jsx';
import { FnbCommunitySection } from '../../../modes/fnb/storefront/components/FnbCommunitySection.jsx';
import { SimpleProductCard } from '../../../modes/simple/storefront/components/SimpleProductCard.jsx';
import { SimpleCheckoutRoutePage } from '../../../modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx';
import { DefaultOrderPage } from './DefaultOrderPage.jsx';
import { RetailOrderPage } from '../../../modes/retail/checkout/pages/RetailOrderPage.jsx';
import { SERVICE_CATEGORY_ICON_MAP } from '../../../modes/services/storefront/model/serviceCategoryIconMap.jsx';
import { ServiceProductCard } from '../../../modes/services/storefront/components/ServiceProductCard.jsx';
import { ServicesPerformanceSidebar } from '../../../modes/services/storefront/components/ServicesPerformanceSidebar.jsx';
import { StorefrontReviewModal } from './StorefrontReviewModal.jsx';
import { StorefrontPromoSection as SharedStorefrontPromoSection } from './sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from './sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from './sections/StorefrontFooterSection.jsx';

/**
 * StorefrontClassicCatalog — the catalog-rendering branch for fnb/simple/
 * hospitality/default storefront modes: search/filter/sort toolbar, the
 * catalog item grid (F&B/Simple/Service product cards), F&B pagination,
 * Simple checkout route mount, promo/reviews/footer sections, the F&B
 * community section, the Services performance sidebar, and the review
 * modals.
 *
 * Pure view extracted verbatim from StorefrontApp.jsx (the non-services
 * `return (...)` inside the same catalog-rendering IIFE that already
 * hosts `StorefrontServicesCatalog`). `addToCart` stays a money-path
 * handler owned by the shell and is passed straight through unchanged.
 */
export function StorefrontClassicCatalog({
  ActiveServiceGroupIcon,
  activeGroupMeta,
  addToCart,
  catalogError,
  catalogItemsToRender,
  catalogSearch,
  catalogState,
  checkoutPromoCode,
  filteredCatalog,
  filteredFnbViewModel,
  fnbCategoryDropdownRef,
  fnbCommunityModel,
  fnbMobileCatalogInlinePadding,
  fnbMobileMenuInnerWidth,
  fnbPageEnd,
  fnbPageSize,
  fnbPageStart,
  fnbSortOption,
  fnbViewMode,
  getCartFlySourceRect,
  handlePromoCardApply,
  hasCatalogSearchQuery,
  isCompactPaginationViewport,
  isDesktopViewport,
  isFnbCategoryDropdownOpen,
  isFnbDetailsSubpage,
  isFnbMode,
  isMobileViewport,
  isMultiGroup,
  isOrderSubpage,
  isResolvedOrderSubpage,
  isReviewModalOpen,
  isServicesMode,
  isSimpleMode,
  isTabletPaginationViewport,
  itemsToRender,
  modeAdapter,
  openFnbDetail,
  openServiceDetail,
  promoSectionModel,
  refreshStorePageForTenantSetup,
  resolvedFnbPage,
  resolvedFnbSection,
  resolvedTab,
  reviewDraft,
  reviewSubmitLoading,
  selectedStore,
  servicesPrimary,
  servicesPrimaryDark,
  servicesViewModel,
  setActiveServiceTab,
  setCatalogSearch,
  setFnbPage,
  setFnbPageSize,
  setFnbSortOption,
  setFnbViewMode,
  setIsFnbCategoryDropdownOpen,
  setIsReviewModalOpen,
  setReviewDraft,
  simpleCheckoutRouteProps,
  simpleStorefrontModel,
  defaultStorefrontModel,
  defaultOrderRouteProps,
  isRetailMode,
  retailOrderRouteProps,
  submitFnbItemReview,
  totalFnbPages,
  viewportWidth
}) {
  const isDefaultLikeMode = !isServicesMode && !isFnbMode && !isSimpleMode;
  return (
    <>
      <style>{`
        @keyframes promoCardFloatIn {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    <div style={{
      display: 'grid',
      gap: isFnbMode ? 0 : 24,
      gridTemplateColumns: (isServicesMode && !isMobileViewport) ? '1fr 340px' : '1fr',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'grid', gap: isFnbMode ? 0 : 24, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        {!((isSimpleMode || isDefaultLikeMode) && isResolvedOrderSubpage) && (
        <section id="storefront-catalog-section" style={{
          display: 'grid',
          gap: isFnbMode ? (isMobileViewport ? 16 : 24) : (isSimpleMode ? 22 : undefined),
          marginTop: isFnbMode
            ? (isMobileViewport ? 0 : 34)
            : (isSimpleMode ? (isMobileViewport ? 28 : 36) : undefined),
          background: isSimpleMode ? 'transparent' : '#fff',
          border: isFnbMode ? 'none' : (isSimpleMode ? 'none' : `1px solid ${STYLES.colors.border}`),
          borderRadius: isFnbMode ? 0 : (isSimpleMode ? 0 : STYLES.radius.card),
          padding: isFnbMode
            ? (isMobileViewport ? '20px 0 24px' : '32px 0 52px')
            : (isSimpleMode ? 0 : (isMobileViewport ? 16 : 32)),
          boxShadow: isFnbMode ? 'none' : (isSimpleMode ? 'none' : STYLES.shadow.sm),
          marginLeft: isFnbMode && !isMobileViewport ? 'calc(50% - 50vw)' : undefined,
          width: isFnbMode ? (isMobileViewport ? '100%' : '100vw') : undefined,
          maxWidth: isFnbMode && isMobileViewport ? '100%' : undefined,
          minWidth: isFnbMode && isMobileViewport ? 0 : undefined,
          boxSizing: 'border-box'
        }}>
  
          {isFnbMode && (
            <FnbCatalogToolbar
              FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP}
              STYLES={STYLES}
              catalogSearch={catalogSearch}
              filteredFnbViewModel={filteredFnbViewModel}
              fnbCategoryDropdownRef={fnbCategoryDropdownRef}
              fnbMobileMenuInnerWidth={fnbMobileMenuInnerWidth}
              fnbSortOption={fnbSortOption}
              fnbViewMode={fnbViewMode}
              isFnbCategoryDropdownOpen={isFnbCategoryDropdownOpen}
              isMobileViewport={isMobileViewport}
              modeAdapter={modeAdapter}
              resolvedFnbSection={resolvedFnbSection}
              setActiveServiceTab={setActiveServiceTab}
              setCatalogSearch={setCatalogSearch}
              setFnbSortOption={setFnbSortOption}
              setFnbViewMode={setFnbViewMode}
              setIsFnbCategoryDropdownOpen={setIsFnbCategoryDropdownOpen}
            />
          )}
  
  
          {/* Section header */}
          {((!isFnbMode && !isSimpleMode) || isMultiGroup) && (
            <div style={{ marginBottom: isMultiGroup ? 20 : 32 }}>
              <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: STYLES.colors.dark }}>{modeAdapter.catalogHeading}</h2>
              <p style={{ margin: '4px 0 0 0', color: STYLES.colors.muted, fontSize: 15 }}>{modeAdapter.catalogSubtitle}</p>
            </div>
          )}
  
          {/* Service Family Tabs (only shown when multiple groups exist) */}
          {isMultiGroup && (
            <div style={{ marginBottom: 28 }}>
              {/* Tab scrollable strip */}
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
                scrollbarWidth: 'none'
              }}>
                {servicesViewModel.serviceGroups.map(group => {
                  const isActive = resolvedTab === group.categoryKey;
                  const meta = group.categoryMeta;
                  const GroupIcon = SERVICE_CATEGORY_ICON_MAP[meta?.iconToken] || Sparkles;
                  return (
                    <button
                      key={group.categoryKey}
                      type="button"
                      onClick={() => setActiveServiceTab(group.categoryKey)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        flexShrink: 0,
                        padding: isMobileViewport ? '10px 16px' : '12px 20px',
                        borderRadius: 14,
                        border: isActive ? `2px solid ${meta.accent}` : `1.5px solid ${STYLES.colors.border}`,
                        background: isActive ? meta.accentBg || '#f0fdfa' : '#fff',
                        color: isActive ? meta.accent : STYLES.colors.text,
                        fontWeight: isActive ? 800 : 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                        boxShadow: isActive ? `0 4px 16px ${meta.accent}22` : 'none'
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                        <GroupIcon size={18} />
                      </span>
                      <span>{meta.label}</span>
                      <span style={{
                        marginLeft: 4, padding: '2px 8px', borderRadius: 99,
                        fontSize: 11, fontWeight: 800,
                        background: isActive ? meta.accent : STYLES.colors.bg,
                        color: isActive ? '#fff' : STYLES.colors.muted
                      }}>
                        {group.items.length}
                      </span>
                    </button>
                  );
                })}
              </div>
  
              {/* Active tab description bar */}
              {activeGroupMeta && (
                <div style={{
                  marginTop: 14, padding: '14px 18px',
                  borderRadius: 14, border: `1px solid ${activeGroupMeta.accent}33`,
                  background: activeGroupMeta.accentBg || '#f0fdfa',
                  display: 'flex', alignItems: 'center', gap: 14
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: activeGroupMeta.accent }}>
                    <ActiveServiceGroupIcon size={26} />
                  </span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: activeGroupMeta.accent }}>{activeGroupMeta.label}</div>
                    <div style={{ fontSize: 13, color: STYLES.colors.text, marginTop: 2 }}>{activeGroupMeta.description}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: STYLES.colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Area</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: activeGroupMeta.accent }}>{activeGroupMeta.areaLabel}</div>
                  </div>
                </div>
              )}
            </div>
          )}
  
          {isSimpleMode && (
            <div style={{ display: 'grid', gap: 16, padding: isMobileViewport ? '0 4px' : '0 2px 4px' }}>
              <div style={{
                display: 'flex',
                alignItems: isMobileViewport ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 14,
                flexDirection: isMobileViewport ? 'column' : 'row'
              }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    fontWeight: 800,
                    color: modeAdapter.heroTheme?.accentDark || '#134e4a',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em'
                  }}>
                    <span style={{ width: 30, height: 1, background: modeAdapter.heroTheme?.accent || '#0f766e' }} />
                    Product Section
                  </div>
                  <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 34, fontWeight: 900, color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark, letterSpacing: '-0.03em', fontFamily: modeAdapter.heroTheme?.displayFont }}>
                    {modeAdapter.catalogHeading}
                  </h2>
                  <p style={{ margin: 0, color: modeAdapter.heroTheme?.textMuted || STYLES.colors.muted, fontSize: 15, maxWidth: 720, lineHeight: 1.6 }}>
                    {modeAdapter.catalogSubtitle}
                  </p>
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 999,
                  background: modeAdapter.heroTheme?.accentSoft || '#ecfeff',
                  border: `1px solid ${modeAdapter.heroTheme?.borderSoft || '#bfe8e4'}`,
                  color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark,
                  fontSize: 13,
                  fontWeight: 800
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: modeAdapter.heroTheme?.accent || '#0f766e' }} />
                  {filteredCatalog.length} product{Number(filteredCatalog.length) === 1 ? '' : 's'} in this storefront
                </div>
              </div>
              <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(15,118,110,0.18) 0%, rgba(15,23,42,0.06) 100%)' }} />
            </div>
          )}
  
          {/* Catalog items grid */}
          {!isFnbMode && !isSimpleMode && (
            <div style={{ maxWidth: 1320, margin: `${isMobileViewport ? 12 : 16}px auto 0`, width: '100%', padding: isMobileViewport ? '0 16px' : '0 24px' }}>
              <input
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
                placeholder="Search items in this store catalog..."
                style={{
                  width: '100%',
                  border: '1px solid #cbd5e1',
                  borderRadius: 12,
                  padding: '11px 12px',
                  fontSize: 14,
                  background: '#fff'
                }}
              />
            </div>
          )}
  
          <StoreCatalogEmptyStates
            catalogState={catalogState}
            catalogError={catalogError}
            catalogSearch={catalogSearch}
            filteredCatalog={filteredCatalog}
            hasCatalogSearchQuery={hasCatalogSearchQuery}
            isMobileViewport={isMobileViewport}
            isServicesMode={isServicesMode}
            onRefreshTenantPage={refreshStorePageForTenantSetup}
          />
  
          {(catalogState === 'ready' || catalogState === 'empty_no_match') && (
            <div style={isFnbMode ? {
              maxWidth: 1320,
              margin: `${isMobileViewport ? 20 : 28}px auto 0`,
              width: '100%',
              boxSizing: 'border-box',
              padding: isMobileViewport ? fnbMobileCatalogInlinePadding : '0 24px'
            } : undefined}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? fnbMobileMenuInnerWidth : '100%', maxWidth: '100%', justifyItems: isMobileViewport ? 'center' : 'stretch', margin: isMobileViewport ? '0 auto' : 0 }}>
                {catalogItemsToRender.map((item) => {
                  const imageSources = resolveStorefrontImageSources(item, { preferred: 'thumbnail' });
                  const available = isItemAvailable(item);
                  const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
                  return (
                    isFnbMode ? (
                      <FnbProductCard
                        key={item.item_id + '-' + fnbViewMode}
                        item={item}
                        imageSources={imageSources}
                        available={available}
                        FNB_CATEGORY_ICON_MAP={FNB_CATEGORY_ICON_MAP}
                        addToCart={addToCart}
                        buttonTextOnAccent={(modeAdapter.heroTheme || {}).buttonTextOnAccent || '#fffdf9'}
                        getCartFlySourceRect={getCartFlySourceRect}
                        heroTheme={modeAdapter.heroTheme || {}}
                        isMobileViewport={isMobileViewport}
                        fnbViewMode={fnbViewMode}
                        money={money}
                        onViewDetails={openFnbDetail}
                      />
                    ) : isSimpleMode ? (
                      <SimpleProductCard
                        key={item.item_id}
                        Badge={Badge}
                        GhostButton={GhostButton}
                        PrimaryButton={PrimaryButton}
                        accentDark={(modeAdapter.heroTheme || {}).accentDark || '#134e4a'}
                        accentSoft={(modeAdapter.heroTheme || {}).accentSoft || '#ecfeff'}
                        item={item}
                        available={available}
                        addToCart={addToCart}
                        bodyFont={(modeAdapter.heroTheme || {}).bodyFont || "'Avenir Next', 'Segoe UI', sans-serif"}
                        displayFont={(modeAdapter.heroTheme || {}).displayFont || ((modeAdapter.heroTheme || {}).bodyFont || "'Avenir Next', 'Segoe UI', sans-serif")}
                        money={money}
                        onViewDetails={openFnbDetail}
                        imageSources={imageSources}
                      />
                    ) : (
                      <ServiceProductCard
                        key={item.item_id}
                        item={item}
                        imageSources={imageSources}
                        available={available}
                        money={money}
                        styles={STYLES}
                        servicesPrimary={servicesPrimary}
                        servicesPrimaryDark={servicesPrimaryDark}
                        CategoryIcon={ServiceCategoryIcon}
                        Badge={Badge}
                        GhostButton={GhostButton}
                        PrimaryButton={PrimaryButton}
                        addToCart={addToCart}
                        getCartFlySourceRect={getCartFlySourceRect}
                        onViewDetails={openServiceDetail}
                      />
                    )
                  );
                })}
                {catalogItemsToRender.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: STYLES.colors.muted }}>
                    {isFnbMode
                      ? 'No menu items match the current search or section yet.'
                      : (isSimpleMode ? 'No simple-mode products match the current search yet.' : 'No products available in this category yet.')}
                  </div>
                )}
              </div>
  
              {isFnbMode && itemsToRender.length > 0 && totalFnbPages > 1 && (
                <div style={{
                  marginTop: isMobileViewport ? 20 : 36,
                  display: 'grid',
                  gap: isCompactPaginationViewport ? 8 : 12,
                  padding: isCompactPaginationViewport ? '12px 0' : isTabletPaginationViewport ? '14px 0' : '16px 0',
                  paddingBottom: isCompactPaginationViewport ? 20 : 12,
                  width: isMobileViewport ? fnbMobileMenuInnerWidth : '100%',
                  margin: isMobileViewport ? '0 auto' : 0,
                  boxSizing: 'border-box'
                }}>
                  {(() => {
                    const pageWindowSize = isCompactPaginationViewport ? 3 : 5;
                    const pageWindowOffset = isCompactPaginationViewport ? 1 : 2;
                    const compactVisiblePages = (() => {
                      if (!isCompactPaginationViewport || totalFnbPages <= 4) {
                        return [];
                      }
                      if (resolvedFnbPage <= 3) {
                        return [1, 2, 3];
                      }
                      if (resolvedFnbPage >= totalFnbPages - 2) {
                        return [Math.max(1, totalFnbPages - 3), Math.max(1, totalFnbPages - 2), Math.max(1, totalFnbPages - 1)];
                      }
                      return [resolvedFnbPage - 1, resolvedFnbPage, resolvedFnbPage + 1];
                    })();
                    const pageSliceStart = Math.max(0, resolvedFnbPage - pageWindowOffset - 1);
                    const visiblePages = isCompactPaginationViewport
                      ? (totalFnbPages <= 4
                        ? Array.from({ length: totalFnbPages }, (_, index) => index + 1)
                        : compactVisiblePages.filter((pageNumber, index, pages) => Number.isFinite(pageNumber) && pageNumber > 0 && pageNumber < totalFnbPages && pages.indexOf(pageNumber) === index))
                      : Array.from({ length: totalFnbPages }, (_, index) => index + 1)
                        .slice(pageSliceStart, pageSliceStart + pageWindowSize);
                    const showLeadingFirstPage = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 1;
                    const showLeadingEllipsis = !isCompactPaginationViewport && visiblePages.length > 0 && visiblePages[0] > 2;
                    const showTrailingEllipsis = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalFnbPages - 1;
                    const showTrailingLastPage = visiblePages.length > 0 && visiblePages[visiblePages.length - 1] < totalFnbPages;
                    const paginationButtonBaseStyle = {
                      minWidth: isCompactPaginationViewport ? 36 : 40,
                      minHeight: isCompactPaginationViewport ? 36 : 40,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      background: '#fff',
                      color: STYLES.colors.dark,
                      fontWeight: 500,
                      fontSize: 14,
                      cursor: 'pointer',
                      flexShrink: 0,
                      padding: isCompactPaginationViewport ? '0 10px' : '0 12px'
                    };
  
                    return (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isDesktopViewport ? '1fr auto 1fr' : isCompactPaginationViewport ? 'minmax(0, 1fr) auto' : '1fr',
                          gap: isCompactPaginationViewport ? 8 : 12,
                          alignItems: 'center'
                        }}>
                          <div style={{
                            fontSize: 13,
                            color: STYLES.colors.muted,
                            lineHeight: 1.4,
                            textAlign: 'left',
                            minWidth: 0
                          }}>
                            Showing {fnbPageStart}-{fnbPageEnd} of {itemsToRender.length} {isCompactPaginationViewport ? 'items' : 'menu items'}
                          </div>
  
                          {isDesktopViewport && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <GhostButton
                                style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === 1 ? 0.5 : 1 }}
                                onClick={() => setFnbPage((previous) => Math.max(1, previous - 1))}
                                disabled={resolvedFnbPage === 1}
                              >
                                Previous
                              </GhostButton>
                              {showLeadingFirstPage && (
                                <button type="button" onClick={() => setFnbPage(1)} style={paginationButtonBaseStyle}>1</button>
                              )}
                              {showLeadingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                              {visiblePages.map((pageNumber) => (
                                <button
                                  key={`fnb-page-${pageNumber}`}
                                  type="button"
                                  onClick={() => setFnbPage(pageNumber)}
                                  style={{
                                    ...paginationButtonBaseStyle,
                                    border: `1px solid ${pageNumber === resolvedFnbPage ? '#f97316' : '#e5e7eb'}`,
                                    background: pageNumber === resolvedFnbPage ? '#f97316' : '#fff',
                                    color: pageNumber === resolvedFnbPage ? '#fff' : STYLES.colors.dark,
                                    boxShadow: pageNumber === resolvedFnbPage ? '0 8px 18px rgba(249,115,22,0.22)' : 'none'
                                  }}
                                >
                                  {pageNumber}
                                </button>
                              ))}
                              {showTrailingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                              {showTrailingLastPage && (
                                <button type="button" onClick={() => setFnbPage(totalFnbPages)} style={paginationButtonBaseStyle}>{totalFnbPages}</button>
                              )}
                              <GhostButton
                                style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === totalFnbPages ? 0.5 : 1 }}
                                onClick={() => setFnbPage((previous) => Math.min(totalFnbPages, previous + 1))}
                                disabled={resolvedFnbPage === totalFnbPages}
                              >
                                Next
                              </GhostButton>
                            </div>
                          )}
  
                          <div style={{ display: 'flex', justifyContent: isDesktopViewport ? 'flex-end' : isCompactPaginationViewport ? 'flex-end' : 'flex-start' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: STYLES.colors.muted, flexShrink: 0 }}>
                              Per page
                              <StorefrontDropdown
                                value={fnbPageSize}
                                onChange={(nextValue) => setFnbPageSize(Number(nextValue) || 8)}
                                options={[4, 8, 12, 16].map((size) => ({ value: size, label: String(size) }))}
                                containerStyle={{ minWidth: isCompactPaginationViewport ? 66 : 72 }}
                                triggerStyle={{ minHeight: isCompactPaginationViewport ? 36 : 40, borderRadius: 12, minWidth: isCompactPaginationViewport ? 66 : 72, padding: '6px 34px 6px 12px' }}
                                menuStyle={{ borderRadius: 14 }}
                                selectedLabelStyle={{ fontSize: 13 }}
                              />
                            </label>
                          </div>
                        </div>
  
                        {!isDesktopViewport && (
                          <div
                            className="no-scrollbar"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: isCompactPaginationViewport ? 'flex-start' : 'center',
                              gap: isCompactPaginationViewport ? 6 : 8,
                              width: '100%',
                              flexWrap: 'nowrap',
                              overflowX: 'auto',
                              overflowY: 'hidden',
                              WebkitOverflowScrolling: 'touch',
                              paddingBottom: 2
                            }}
                          >
                            <GhostButton
                              style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === 1 ? 0.5 : 1 }}
                              onClick={() => setFnbPage((previous) => Math.max(1, previous - 1))}
                              disabled={resolvedFnbPage === 1}
                            >
                              Previous
                            </GhostButton>
                            {showLeadingFirstPage && (
                              <button type="button" onClick={() => setFnbPage(1)} style={paginationButtonBaseStyle}>1</button>
                            )}
                            {showLeadingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                            {visiblePages.map((pageNumber) => (
                              <button
                                key={`fnb-page-mobile-${pageNumber}`}
                                type="button"
                                onClick={() => setFnbPage(pageNumber)}
                                style={{
                                  ...paginationButtonBaseStyle,
                                  border: `1px solid ${pageNumber === resolvedFnbPage ? '#f97316' : '#e5e7eb'}`,
                                  background: pageNumber === resolvedFnbPage ? '#f97316' : '#fff',
                                  color: pageNumber === resolvedFnbPage ? '#fff' : STYLES.colors.dark,
                                  boxShadow: pageNumber === resolvedFnbPage ? '0 8px 18px rgba(249,115,22,0.22)' : 'none'
                                }}
                              >
                                {pageNumber}
                              </button>
                            ))}
                            {showTrailingEllipsis && <div style={{ padding: '0 4px', color: '#94a3b8', fontWeight: 500 }}>...</div>}
                            {showTrailingLastPage && (
                              <button type="button" onClick={() => setFnbPage(totalFnbPages)} style={paginationButtonBaseStyle}>{totalFnbPages}</button>
                            )}
                            <GhostButton
                              style={{ ...paginationButtonBaseStyle, opacity: resolvedFnbPage === totalFnbPages ? 0.5 : 1 }}
                              onClick={() => setFnbPage((previous) => Math.min(totalFnbPages, previous + 1))}
                              disabled={resolvedFnbPage === totalFnbPages}
                            >
                              Next
                            </GhostButton>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </section>
        )}
  
        {isSimpleMode && isResolvedOrderSubpage && simpleStorefrontModel && (
          <SimpleCheckoutRoutePage {...simpleCheckoutRouteProps} />
        )}
        {isDefaultLikeMode && isResolvedOrderSubpage && defaultStorefrontModel && (
          isRetailMode
            ? <RetailOrderPage {...retailOrderRouteProps} />
            : <DefaultOrderPage {...defaultOrderRouteProps} />
        )}
        {isSimpleMode && !isResolvedOrderSubpage && simpleStorefrontModel && (
          <>
            <SharedStorefrontPromoSection
              items={promoSectionModel}
              isMobileViewport={isMobileViewport}
              layoutVariant="feature"
              palette="orange"
              titleFontFamily={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              titleSize={isMobileViewport ? 28 : 36}
              subtitleSize={isMobileViewport ? 14 : 16}
              activePromoCode={checkoutPromoCode}
              onApplyPromo={handlePromoCardApply}
            />
  
            <SharedStorefrontReviewsSection
              isMobileViewport={isMobileViewport}
              viewportWidth={viewportWidth}
              title="Customer Reviews"
              subtitle="See what customers say about this storefront"
              onWriteReview={() => setIsReviewModalOpen(true)}
              reviewHighlights={simpleStorefrontModel.reviewHighlights}
              emptyMessage="Customer reviews will appear here once this storefront adds review data in SKUpervisor."
              titleFontFamily={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              titleSize={isMobileViewport ? 28 : 36}
              subtitleSize={isMobileViewport ? 14 : 16}
              starSymbol="*"
            />
  
            <SharedStorefrontFooterSection
              isMobileViewport={isMobileViewport}
              name={simpleStorefrontModel.name}
              registrationYear={simpleStorefrontModel.registrationYear}
              description={simpleStorefrontModel.tagline || simpleStorefrontModel.aboutText || 'Simple storefront powered by SKUpervisor content.'}
              displayFont={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              badgeLinks={getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks)}
              columns={[
                {
                  title: 'Products',
                  items: simpleStorefrontModel.productGroups.map((group) => ({ label: group })),
                  emptyText: 'No product categories yet.'
                },
                {
                  title: 'Socials',
                  items: getStorefrontSocialFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({ label: link.label, href: link.href })),
                  emptyText: 'No social links yet.'
                },
                {
                  title: 'Contact',
                  items: [
                    ...getStorefrontContactFooterLinks(simpleStorefrontModel.footerLinks).map((link) => ({
                      label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                      href: link.href
                    })),
                    ...(simpleStorefrontModel.hours ? [{ label: simpleStorefrontModel.hours }] : []),
                    { label: simpleStorefrontModel.locationLabel }
                  ]
                }
              ]}
            />
          </>
        )}
  
        {isFnbMode && !isOrderSubpage && !isFnbDetailsSubpage && fnbCommunityModel && (
          <FnbCommunitySection
            fnbCommunityModel={fnbCommunityModel}
            promoSectionModel={promoSectionModel}
            isMobileViewport={isMobileViewport}
            viewportWidth={viewportWidth}
            modeAdapter={modeAdapter}
            checkoutPromoCode={checkoutPromoCode}
            onApplyPromo={handlePromoCardApply}
            onWriteReview={() => setIsReviewModalOpen(true)}
          />
        )}

        {isDefaultLikeMode && !isResolvedOrderSubpage && defaultStorefrontModel && (
          <>
            <SharedStorefrontPromoSection
              items={promoSectionModel}
              isMobileViewport={isMobileViewport}
              layoutVariant="feature"
              palette="teal"
              titleFontFamily={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              titleSize={isMobileViewport ? 28 : 36}
              subtitleSize={isMobileViewport ? 14 : 16}
              activePromoCode={checkoutPromoCode}
              onApplyPromo={handlePromoCardApply}
            />

            <SharedStorefrontReviewsSection
              isMobileViewport={isMobileViewport}
              viewportWidth={viewportWidth}
              title="Customer Reviews"
              subtitle="See what customers say about this storefront"
              onWriteReview={() => setIsReviewModalOpen(true)}
              reviewHighlights={defaultStorefrontModel.reviewHighlights}
              emptyMessage="Customer reviews will appear here once this storefront adds review data in SKUpervisor."
              titleFontFamily={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              titleSize={isMobileViewport ? 28 : 36}
              subtitleSize={isMobileViewport ? 14 : 16}
              starSymbol="*"
            />

            <SharedStorefrontFooterSection
              isMobileViewport={isMobileViewport}
              name={defaultStorefrontModel.name}
              registrationYear={defaultStorefrontModel.registrationYear}
              description={defaultStorefrontModel.tagline || defaultStorefrontModel.aboutText || 'Storefront powered by SKUpervisor content.'}
              displayFont={modeAdapter.heroTheme?.displayFont}
              bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
              badgeLinks={getStorefrontSocialFooterLinks(defaultStorefrontModel.footerLinks)}
              columns={[
                {
                  title: 'Products',
                  items: defaultStorefrontModel.productGroups.map((group) => ({ label: group })),
                  emptyText: 'No product categories yet.'
                },
                {
                  title: 'Socials',
                  items: getStorefrontSocialFooterLinks(defaultStorefrontModel.footerLinks).map((link) => ({ label: link.label, href: link.href })),
                  emptyText: 'No social links yet.'
                },
                {
                  title: 'Contact',
                  items: [
                    ...getStorefrontContactFooterLinks(defaultStorefrontModel.footerLinks).map((link) => ({
                      label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                      href: link.href
                    })),
                    ...(defaultStorefrontModel.hours ? [{ label: defaultStorefrontModel.hours }] : []),
                    { label: defaultStorefrontModel.locationLabel }
                  ]
                }
              ]}
            />
          </>
        )}
      </div>
  
      {/* ZONE 5: Sidebar (Desktop) */}
      {isServicesMode && !isMobileViewport && (
        <ServicesPerformanceSidebar
          selectedStore={selectedStore}
          isMultiGroup={isMultiGroup}
          servicesViewModel={servicesViewModel}
          resolvedTab={resolvedTab}
          onSelectServiceTab={setActiveServiceTab}
        />
      )}
  
      {isReviewModalOpen && isSimpleMode && (
        <StorefrontReviewModal
          isMobileViewport={isMobileViewport}
          eyebrowColor={modeAdapter.heroTheme?.accent || '#0f766e'}
          starColor="#14b8a6"
          starBg="#ecfeff"
          starShadow="0 10px 20px rgba(20,184,166,0.16)"
          keyPrefix="simple-review-rating"
          messagePlaceholder="Tell customers what stood out about the product selection, ordering, or pickup experience."
          reviewDraft={reviewDraft}
          onReviewDraftChange={setReviewDraft}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmit={submitFnbItemReview}
        />
      )}

      {isReviewModalOpen && !isServicesMode && !isFnbMode && !isSimpleMode && (
        <StorefrontReviewModal
          isMobileViewport={isMobileViewport}
          eyebrowColor={modeAdapter.heroTheme?.accent || '#0f766e'}
          starColor="#14b8a6"
          starBg="#ecfeff"
          starShadow="0 10px 20px rgba(20,184,166,0.16)"
          keyPrefix="default-review-rating"
          messagePlaceholder="Tell customers what stood out about your experience with this storefront."
          reviewDraft={reviewDraft}
          onReviewDraftChange={setReviewDraft}
          onClose={() => setIsReviewModalOpen(false)}
          onSubmit={submitFnbItemReview}
        />
      )}
  
      {isReviewModalOpen && isFnbMode && (
        <FnbItemReviewModal
          isMobileViewport={isMobileViewport}
          isSubmitting={reviewSubmitLoading}
          onClose={() => setIsReviewModalOpen(false)}
          onDraftChange={(changes) => setReviewDraft((previous) => ({ ...previous, ...changes }))}
          onSubmit={submitFnbItemReview}
          reviewDraft={reviewDraft}
        />
      )}
    </div>
    </>
  );
}
