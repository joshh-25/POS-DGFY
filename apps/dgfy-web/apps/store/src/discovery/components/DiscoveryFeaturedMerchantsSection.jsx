import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Coffee, HeartHandshake, Scissors, ShoppingCart, Store, Wrench } from 'lucide-react';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../../../packages/web-core/src/observability/analyticsEvents.js';

export function DiscoveryFeaturedMerchantsSection({
  discoveryPinsBySlug,
  featuredCarouselRef,
  featuredCategoryFilter,
  featuredCategoryOptions,
  featuredCategoryRailRef,
  featuredSectionRef,
  featuredVisibleStores,
  formatStorefrontHoursLabel,
  getPreferredDiscoveryLocationId,
  goStore,
  isBrandingImageBlocked,
  isMobileViewport,
  markBrandingImageError,
  normalizeStorefrontCategories,
  normalizeStorefrontReviewSummary,
  onFeaturedCategoryFilter,
  toSlug,
  withAssetOrigin
}) {
  const featuredPageCount = Math.min(5, Math.max(1, Math.ceil(featuredVisibleStores.length / 2)));
  const [activeFeaturedPage, setActiveFeaturedPage] = useState(0);
  const visibleFeaturedPage = Math.min(activeFeaturedPage, featuredPageCount - 1);
  const featuredPageOffset = 304;

  const showFeaturedPage = (pageIndex) => {
    const nextPage = Math.max(0, Math.min(pageIndex, featuredPageCount - 1));
    setActiveFeaturedPage(nextPage);
    featuredCarouselRef.current?.scrollTo({ left: nextPage * featuredPageOffset, behavior: 'smooth' });
  };

  const moveFeaturedPage = (direction) => {
    showFeaturedPage(visibleFeaturedPage + direction);
  };

  return (
    <section ref={featuredSectionRef} style={{ padding: isMobileViewport ? '40px 16px 80px' : '40px 0 100px', maxWidth: 1200, margin: '0 auto', textAlign: 'center', overflow: 'hidden' }}>
      <h2 style={{ fontSize: isMobileViewport ? 28 : 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 12 }}>
        Featured <span style={{ color: '#1a4e8d' }}>Local Merchants</span>
      </h2>
      <p style={{ fontSize: isMobileViewport ? 14 : 16, color: '#64748b', maxWidth: 600, margin: '0 auto 40px', lineHeight: 1.6 }}>
        Explore top-rated stores and trusted service providers near you.
      </p>

      {/* Category Pills */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40, width: '100%' }}>
        <div
          ref={featuredCategoryRailRef}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMobileViewport ? 'flex-start' : 'center',
            gap: 10,
            width: isMobileViewport ? '100%' : 'max-content',
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            flexWrap: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingBottom: 6
          }}
        >
          {featuredCategoryOptions.map((cat) => {
            const isActive = featuredCategoryFilter === cat.key;
            return (
              <button
                key={cat.label}
                type="button"
                onClick={(event) => onFeaturedCategoryFilter(event, cat.key)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 99,
                  border: isActive ? '1px solid #1a4e8d' : '1px solid #e2e8f0',
                  background: isActive ? '#1a4e8d' : '#fff',
                  color: isActive ? '#fff' : '#475569',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: isActive ? '0 4px 12px rgba(37,99,235,0.2)' : '0 2px 8px rgba(15,23,42,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {cat.icon}
                {cat.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => featuredCategoryRailRef.current?.scrollBy({ left: isMobileViewport ? 220 : 280, behavior: 'smooth' })}
            aria-label="Show more featured categories"
            style={{
              position: 'sticky',
              right: 0,
              top: 0,
              minWidth: 42,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(226,232,240,.9)',
              background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.82) 45%, rgba(255,255,255,.98) 100%)',
              color: '#94a3b8',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(15,23,42,.08)',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Cards Grid/Carousel */}
      <div
        ref={featuredCarouselRef}
        onScroll={(event) => {
          const nextPage = Math.round(Number(event.currentTarget.scrollLeft || 0) / featuredPageOffset);
          setActiveFeaturedPage(Math.max(0, Math.min(nextPage, featuredPageCount - 1)));
        }}
        style={{ display: 'flex', gap: 24, overflowX: isMobileViewport ? 'auto' : 'hidden', paddingBottom: 24, paddingLeft: isMobileViewport ? 16 : 4, paddingRight: isMobileViewport ? 16 : 4, scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', margin: isMobileViewport ? '0 -16px' : '0', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {featuredVisibleStores.map((store, i) => {
          const storeSlug = toSlug(store?.slug);
          const storePins = Array.isArray(discoveryPinsBySlug[storeSlug]) ? discoveryPinsBySlug[storeSlug] : [];
          const preferredLocationId = getPreferredDiscoveryLocationId({ store, storePins });
          const n = store.tenant_name || store.name || 'Store';
          const storeCategories = normalizeStorefrontCategories(store?.storefront_categories);
          const c = storeCategories[0] || String(store?.workflow_mode || store?.business_mode || 'Local Business').replace(/_/g, ' ');
          const reviewSummary = normalizeStorefrontReviewSummary(store?.storefront_review_summary);
          const ratingValue = Number.isFinite(Number(reviewSummary?.score)) ? Number(reviewSummary.score).toFixed(1) : '4.7';
          const ratingCount = Number(reviewSummary?.total_count || store?.matching_item_count || 0);
          const d = Number.isFinite(Number(store?.nearest_distance_km)) ? `${Number(store.nearest_distance_km).toFixed(1)} km` : '0.4 km';
          const t = [
            Number(store?.active_location_count || 0) > 0 ? `${Number(store.active_location_count)} Branches` : null,
            store?.has_in_stock_match === true ? 'Available Now' : null,
            store.matching_item_count > 2 ? 'Featured' : 'Local'
          ].filter(Boolean);
            const isOpen = store.storefront_open ?? true;
            const featuredHoursLabel = formatStorefrontHoursLabel(
              store?.storefront_hours,
              store?.nearest_location_hours || store?.storefront_hours_status?.display || ''
            );
            const featuredClosedNote = !isOpen
            ? `Store closed for now${featuredHoursLabel ? ` \u2022 ${featuredHoursLabel}` : ''}`
              : '';
          const coverImageUrl = withAssetOrigin(store?.storefront_cover_image_url) || withAssetOrigin(store?.storefront_profile_image_url) || '';
          const profileImageUrl = withAssetOrigin(store?.storefront_profile_image_url) || coverImageUrl || '';
          const coverImageKey = `featured-cover:${storeSlug}:${coverImageUrl}`;
          const profileImageKey = `featured-profile:${storeSlug}:${profileImageUrl}`;

          const catStr = String(c).toLowerCase();
          let icon = <Store size={40} color="#fff" />;
          let color = '#1a4e8d';
          let bg = 'linear-gradient(135deg, #1a4e8d 0%, #1a4e8d 100%)';

          if (catStr.includes('coffee') || catStr.includes('cafe') || catStr.includes('f&b') || catStr.includes('food')) {
            icon = <Coffee size={40} color="#fff" />;
            color = '#78350f';
            bg = 'linear-gradient(135deg, #fcd34d 0%, #b45309 100%)';
          } else if (catStr.includes('grocery') || catStr.includes('supermarket') || catStr.includes('mart')) {
            icon = <ShoppingCart size={40} color="#fff" />;
            color = '#dc2626';
            bg = 'linear-gradient(135deg, #fca5a5 0%, #dc2626 100%)';
          } else if (catStr.includes('hardware') || catStr.includes('repair') || catStr.includes('auto')) {
            icon = <Wrench size={40} color="#fff" />;
            color = '#ca8a04';
            bg = 'linear-gradient(135deg, #fef08a 0%, #ca8a04 100%)';
          } else if (catStr.includes('salon') || catStr.includes('spa') || catStr.includes('beauty')) {
            icon = <Scissors size={40} color="#fff" />;
            color = '#be185d';
            bg = 'linear-gradient(135deg, #f9a8d4 0%, #be185d 100%)';
          } else if (catStr.includes('pharmacy') || catStr.includes('health') || catStr.includes('medical')) {
            icon = <HeartHandshake size={40} color="#fff" />;
            color = '#115e59';
            bg = 'linear-gradient(135deg, #2dd4bf 0%, #115e59 100%)';
          }

          return (
              <div key={store.id || store.slug || i} style={{ minWidth: 280, width: 280, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', boxShadow: '0 12px 32px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', textAlign: 'left', overflow: 'hidden', scrollSnapAlign: 'start', flexShrink: 0, position: 'relative', opacity: isOpen ? 1 : 0.72 }}>

              {/* Cover Area */}
              <div style={{ height: 160, background: bg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {coverImageUrl && !isBrandingImageBlocked(coverImageKey) ? (
                  <img
                    src={coverImageUrl}
                    alt={`${n} cover`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => markBrandingImageError(coverImageKey)}
                  />
                ) : null}
                <div style={{ position: 'absolute', inset: 0, background: coverImageUrl && !isBrandingImageBlocked(coverImageKey) ? 'linear-gradient(180deg, rgba(15,23,42,.12) 0%, rgba(15,23,42,.48) 100%)' : 'transparent' }} />
                {/* Subtle pattern overlay */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '16px 16px', opacity: 0.5 }} />

                  {isOpen && <div style={{ position: 'absolute', top: 16, left: 16, background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 800, padding: '5px 10px', borderRadius: 8, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>Open Now</div>}
                  {!isOpen && <div style={{ position: 'absolute', top: 16, left: 16, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '5px 10px', borderRadius: 8, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>Closed</div>}

                {/* Big thematic icon */}
                {!coverImageUrl || isBrandingImageBlocked(coverImageKey) ? <div style={{ opacity: 0.8, position: 'relative', zIndex: 1 }}>{icon}</div> : null}
              </div>

              {/* Profile Pic overlapping */}
              <div style={{ padding: '0 20px', position: 'relative' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: color, border: '4px solid #fff', marginTop: -32, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 24, fontWeight: 900, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', position: 'relative', zIndex: 2, overflow: 'hidden' }}>
                  {profileImageUrl && !isBrandingImageBlocked(profileImageKey) ? (
                    <img
                      src={profileImageUrl}
                      alt={`${n} profile`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={() => markBrandingImageError(profileImageKey)}
                    />
                  ) : (
                    n.charAt(0)
                  )}
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{n}</h3>
                    <span
                      title={isOpen ? 'Open' : 'Closed'}
                      aria-label={isOpen ? 'Open' : 'Closed'}
                      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, transform: 'translateY(1px)' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: isOpen ? '#22c55e' : '#ef4444', boxShadow: `0 0 0 3px ${isOpen ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.12)'}` }} />
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 20 }}>
                  <span style={{ color: '#f59e0b', fontSize: 14 }}>{'\u2605'}</span> {ratingValue} ({ratingCount}) <span style={{ color: '#cbd5e1', margin: '0 2px' }}>{'\u2022'}</span> {d}
                </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24, height: 26, overflow: 'hidden' }}>
                    {t.slice(0, 3).map((tag) => (
                      <div key={tag} style={{ fontSize: 10, fontWeight: 700, color: '#1a4e8d', background: '#eff6ff', padding: '5px 12px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                        {tag}
                      </div>
                    ))}
                  </div>
                  {!isOpen && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', marginTop: -8, marginBottom: 12 }}>
                      {featuredClosedNote}
                    </div>
                  )}

                <button onClick={() => {
                  trackFunnelEvent(ANALYTICS_EVENTS.DISCOVERY_STORE_CARD_CLICKED, {
                    store_slug: store.slug,
                    store_name: n,
                    category: c
                  });
                  goStore(store.slug, preferredLocationId);
                }} style={{ marginTop: 'auto', width: '100%', padding: '12px 0', borderRadius: 12, border: '1.5px solid #1a4e8d', background: 'transparent', color: '#1a4e8d', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s ease', letterSpacing: '0.01em' }} onMouseOver={(e) => {e.target.style.background = '#1a4e8d'; e.target.style.color = '#fff';}} onMouseOut={(e) => {e.target.style.background = 'transparent'; e.target.style.color = '#1a4e8d';}}>
                  View Store
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {featuredVisibleStores.length === 0 && (
        <div style={{ marginTop: 14, borderRadius: 16, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1a4e8d', padding: isMobileViewport ? '12px 14px' : '14px 16px', fontSize: 14, fontWeight: 600 }}>
          This category is not available in Featured Local Merchants for now. Please try another category.
        </div>
      )}

      {/* Carousel Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 16 }}>
        <button type="button" aria-label="Show previous featured merchants" onClick={() => moveFeaturedPage(-1)} disabled={visibleFeaturedPage === 0} style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #e2e8f0', display: 'grid', placeItems: 'center', color: visibleFeaturedPage === 0 ? '#cbd5e1' : '#1a4e8d', cursor: visibleFeaturedPage === 0 ? 'default' : 'pointer', background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,0.03)' }}><ChevronLeft size={20} /></button>
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: featuredPageCount }, (_, pageIndex) => (
            <button
              key={pageIndex}
              type="button"
              aria-label={`Show featured merchants page ${pageIndex + 1}`}
              aria-current={visibleFeaturedPage === pageIndex ? 'page' : undefined}
              onClick={() => showFeaturedPage(pageIndex)}
              style={{ width: 8, height: 8, padding: 0, border: 'none', borderRadius: '50%', background: visibleFeaturedPage === pageIndex ? '#1a4e8d' : '#e2e8f0', cursor: 'pointer' }}
            />
          ))}
        </div>
        <button type="button" aria-label="Show next featured merchants" onClick={() => moveFeaturedPage(1)} disabled={visibleFeaturedPage >= featuredPageCount - 1} style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #e2e8f0', display: 'grid', placeItems: 'center', color: visibleFeaturedPage >= featuredPageCount - 1 ? '#cbd5e1' : '#1a4e8d', cursor: visibleFeaturedPage >= featuredPageCount - 1 ? 'default' : 'pointer', background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,0.03)' }}><ChevronRight size={20} /></button>
      </div>
    </section>
  );
}
