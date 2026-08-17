import React from 'react';
import { Sparkles } from 'lucide-react';

import { STYLES } from '../../theme/storefrontStyleTokens.js';
import { Badge, GhostButton, PrimaryButton } from '../StorefrontActionPrimitives.jsx';
import { StoreCatalogEmptyStates } from '../../../features/shared-storefront/components/StoreCatalogEmptyStates.jsx';
import { getStorefrontContactFooterLinks, getStorefrontSocialFooterLinks } from '../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { isItemAvailable } from '../../model/storefrontCatalogModel.js';
import { money } from '../../utils/storefrontFormatters.js';
import { resolveStorefrontImageSources } from '../../utils/storefrontImageSources.js';
import { DefaultOrderPage } from './DefaultOrderPage.jsx';
import { SERVICE_CATEGORY_ICON_MAP } from '../../../modes/services/storefront/model/serviceCategoryIconMap.jsx';
import { ServiceProductCard } from '../../../modes/services/storefront/components/ServiceProductCard.jsx';
import { ServicesPerformanceSidebar } from '../../../modes/services/storefront/components/ServicesPerformanceSidebar.jsx';
import { StorefrontReviewModal } from './StorefrontReviewModal.jsx';
import { StorefrontPromoSection as SharedStorefrontPromoSection } from './sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from './sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from './sections/StorefrontFooterSection.jsx';

/**
 * StorefrontClassicCatalog is the remaining legacy cross-mode catalog renderer.
 * Legacy renderer for Services and default storefront modes.
 * Simple/MSME owns its catalog and checkout route under modes/simple and must
 * not be imported by this shared renderer.
 *
 * Pure view extracted verbatim from StorefrontApp.jsx (the non-services
 * `return (...)` inside the same catalog-rendering IIFE that already
 * hosts `StorefrontServicesCatalog`). `addToCart` stays a money-path
 * handler owned by the shell and is passed straight through unchanged.
 */
export function StorefrontClassicCatalog({
  activeGroupMeta,
  addToCart,
  catalogError,
  catalogItemsToRender,
  catalogSearch,
  catalogState,
  checkoutPromoCode,
  filteredCatalog,
  getCartFlySourceRect,
  handlePromoCardApply,
  hasCatalogSearchQuery,
  isDesktopViewport,
  isMobileViewport,
  isMultiGroup,
  isResolvedOrderSubpage,
  isReviewModalOpen,
  isServicesMode,
  itemsToRender,
  modeAdapter,
  openServiceDetail,
  promoSectionModel,
  refreshStorePageForTenantSetup,
  resolvedTab,
  reviewDraft,
  selectedStore,
  servicesPrimary,
  servicesPrimaryDark,
  servicesViewModel,
  setActiveServiceTab,
  setCatalogSearch,
  setIsReviewModalOpen,
  setReviewDraft,
  defaultStorefrontModel,
  defaultOrderRouteProps,
  viewportWidth,
  submitReview
}) {
  const isDefaultLikeMode = !isServicesMode;
  const showsCatalogToolbar = false;
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
      gap: showsCatalogToolbar ? 0 : 24,
      gridTemplateColumns: (isServicesMode && !isMobileViewport) ? '1fr 340px' : '1fr',
      width: '100%',
      maxWidth: '100%',
      minWidth: 0,
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'grid', gap: showsCatalogToolbar ? 0 : 24, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        {!((isDefaultLikeMode) && isResolvedOrderSubpage) && (
        <section id="storefront-catalog-section" style={{
          display: 'grid',
          gap: showsCatalogToolbar ? (isMobileViewport ? 16 : 24) : undefined,
          marginTop: showsCatalogToolbar
            ? (isMobileViewport ? 0 : 34)
            : undefined,
          background: '#fff',
          border: showsCatalogToolbar ? 'none' : `1px solid ${STYLES.colors.border}`,
          borderRadius: showsCatalogToolbar ? 0 : STYLES.radius.card,
          padding: showsCatalogToolbar
            ? (isMobileViewport ? '20px 0 24px' : '32px 0 52px')
            : (isMobileViewport ? 16 : 32),
          boxShadow: showsCatalogToolbar ? 'none' : STYLES.shadow.sm,
          marginLeft: showsCatalogToolbar && !isMobileViewport ? 'calc(50% - 50vw)' : undefined,
          width: showsCatalogToolbar ? (isMobileViewport ? '100%' : '100vw') : undefined,
          maxWidth: showsCatalogToolbar && isMobileViewport ? '100%' : undefined,
          minWidth: showsCatalogToolbar && isMobileViewport ? 0 : undefined,
          boxSizing: 'border-box'
        }}>
  
          {/* Section header */}
          {isMultiGroup && (
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
                    <Sparkles size={26} />
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
  
          {/* Catalog items grid */}
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
            <div style={showsCatalogToolbar ? {
              maxWidth: 1320,
              margin: `${isMobileViewport ? 20 : 28}px auto 0`,
              width: '100%',
              boxSizing: 'border-box',
              padding: isMobileViewport ? 16 : '0 24px'
            } : undefined}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : viewportWidth < 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: isMobileViewport ? 12 : 24, width: isMobileViewport ? '100%' : '100%', maxWidth: '100%', justifyItems: isMobileViewport ? 'center' : 'stretch', margin: isMobileViewport ? '0 auto' : 0 }}>
                {catalogItemsToRender.map((item) => {
                  const imageSources = resolveStorefrontImageSources(item, { preferred: 'thumbnail' });
                  const available = isItemAvailable(item);
                  const ServiceCategoryIcon = SERVICE_CATEGORY_ICON_MAP[item.categoryMeta?.iconToken] || Sparkles;
                  return (
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
                  );
                })}
                {catalogItemsToRender.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: STYLES.colors.muted }}>
                    No products available in this category yet.
                  </div>
                )}
              </div>
  
         </div>
          )}
        </section>
        )}
  
        {isDefaultLikeMode && isResolvedOrderSubpage && defaultStorefrontModel && (
          <DefaultOrderPage {...defaultOrderRouteProps} />
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
  
      {isReviewModalOpen && !isServicesMode && (
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
          onSubmit={submitReview}
        />
      )}

    </div>
    </>
  );
}
