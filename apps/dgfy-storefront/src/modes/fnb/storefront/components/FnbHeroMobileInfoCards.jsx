import React, { useState } from 'react';
import {
  Bike,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  MapPin,
  Maximize,
  Sparkles
} from 'lucide-react';
import { StoresMap } from '../../../../discovery/components/StoresMapLazy.jsx';
import { getStorefrontContactIcon } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { FnbHeroGalleryLightbox } from './FnbHeroGalleryLightbox.jsx';
import { StorefrontDirectionsEta } from '../../../../shared/components/storefront/hero/StorefrontDirectionsEta.jsx';

const FnbHeroMobileInfoCards = ({
  aboutText,
  addressText,
  deliveryPlatformLinks,
  displayHours,
  galleryImages,
  galleryImagesFull,
  galleryOverflowCount = 0,
  hasAboutSection,
  hasAboutToggle,
  hasContactRows,
  hasGallerySection,
  hasMapData,
  hasMobileStoreDetailsSummary,
  hasWhyChooseUs,
  heroTheme,
  modeAdapter,
  mapSelectedKey,
  mapStores,
  openStorefrontActionLink,
  selectedBranchLabel,
  setIsExpandedMapOpen,
  storefrontCityLabel,
  visibleContactRows,
  visibleWhyChooseUs
}) => {
  const [expandedMobileCard, setExpandedMobileCard] = useState(null);
  const mobileInfoCardWidth = 'calc(100% - 32px)';
  const usesConnectedHeroSurface = modeAdapter?.usesConnectedHeroSurface === true;
  const surfaceAccent = heroTheme.accent || heroTheme.palette?.primary || '#f97316';
  const surfaceAccentSoft = heroTheme.accentSoft || heroTheme.palette?.accentSoft || '#fff7ed';
  const infoCardBorder = heroTheme.borderSoft || heroTheme.palette?.secondary || '#ffedd5';
  const pageBackground = usesConnectedHeroSurface ? (heroTheme.pageBackground || heroTheme.palette?.pageBackground || '#F8FAFC') : 'transparent';
  const infoCardShadow = usesConnectedHeroSurface
    ? '0 3px 12px rgba(26,78,141,0.05)'
    : heroTheme.accentShadow
      ? '0 8px 24px rgba(26,78,141,0.08)'
      : '0 8px 24px rgba(249,115,22,0.08)';
  // Mobile merges the gallery into the store-detail hero image instead of showing a
  // separate "Gallery" card: the overlay counts every image other than the one shown
  // (total gallery count - 1), not just the images beyond the desktop 4-tile preview cap.
  const totalGalleryImageCount = galleryImages.length + galleryOverflowCount;
  const storeDetailGalleryOverlayCount = Math.max(0, totalGalleryImageCount - 1);
  // Fullscreen viewer navigates the full, unsliced gallery list; fall back to the
  // (already-capped) preview array if the full list wasn't supplied for some reason.
  const lightboxImages = Array.isArray(galleryImagesFull) && galleryImagesFull.length > 0
    ? galleryImagesFull
    : galleryImages;
  const [isGalleryLightboxOpen, setIsGalleryLightboxOpen] = useState(false);
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState(0);

  const openGalleryLightbox = (startIndex = 0) => {
    setGalleryLightboxIndex(startIndex);
    setIsGalleryLightboxOpen(true);
  };
  const closeGalleryLightbox = () => setIsGalleryLightboxOpen(false);
  const navigateGalleryLightbox = (direction) => {
    setGalleryLightboxIndex((previousIndex) => {
      const total = lightboxImages.length;
      if (total === 0) return previousIndex;
      if (direction === 'previous') return (previousIndex - 1 + total) % total;
      return (previousIndex + 1) % total;
    });
  };
  const addressRow = visibleContactRows.find((row) => row.label === 'Address');

  return (
    <>
    <div className="no-scrollbar" style={{ width: '100%', maxWidth: '100%', minWidth: 0, padding: '12px 16px 20px', display: 'flex', flexDirection: 'row', gap: 14, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollPaddingInline: 16, WebkitOverflowScrolling: 'touch', margin: 0, alignItems: 'stretch', boxSizing: 'border-box', background: pageBackground }}>
      {(hasAboutSection || hasMobileStoreDetailsSummary) && (
        <div style={{ width: mobileInfoCardWidth, minWidth: mobileInfoCardWidth, maxWidth: mobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12, fontFamily: heroTheme.bodyFont }}>
            {hasAboutSection ? 'About Us' : 'Store Details'}
          </div>
          {(hasAboutSection || hasGallerySection) && (
            <div style={{ display: 'flex', gap: 16 }}>
              {hasAboutSection ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{
                    margin: 0,
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: '#475569',
                    fontFamily: heroTheme.bodyFont,
                    display: '-webkit-box',
                    WebkitLineClamp: expandedMobileCard === 'about' ? 'unset' : 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {aboutText}
                  </p>
                  {hasAboutToggle && expandedMobileCard !== 'about' && (
                    <button type="button" onClick={() => setExpandedMobileCard('about')} style={{ background: 'none', border: 'none', padding: 0, color: surfaceAccent, fontSize: 12, fontWeight: 700, marginTop: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
                      See more <ChevronDown size={14} />
                    </button>
                  )}
                  {hasAboutToggle && expandedMobileCard === 'about' && (
                    <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: surfaceAccent, fontSize: 12, fontWeight: 700, marginTop: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
                      Show less <ChevronUp size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}
              {hasGallerySection && (
                <button
                  type="button"
                  onClick={() => openGalleryLightbox(0)}
                  aria-label="View store photos"
                  style={{ width: 100, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                >
                  <img src={galleryImages[0]} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {storeDetailGalleryOverlayCount > 0 && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: '#ffffff',
                      fontSize: 18,
                      fontWeight: 800,
                      fontFamily: heroTheme.bodyFont
                    }}>
                      +{storeDetailGalleryOverlayCount}
                    </div>
                  )}
                </button>
              )}
            </div>
          )}

          {(hasAboutSection || hasGallerySection) && hasMobileStoreDetailsSummary ? <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0' }} /> : null}

          {hasMobileStoreDetailsSummary && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {displayHours ? (
                <div style={{ flex: '1 1 140px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Clock size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600, lineHeight: 1.3, fontFamily: heroTheme.bodyFont }}>
                      {displayHours}
                    </div>
                    <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, fontFamily: heroTheme.bodyFont }}>Daily</div>
                  </div>
                </div>
              ) : null}
              {deliveryPlatformLinks.length > 0 && (
                <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', fontWeight: 600, fontFamily: heroTheme.bodyFont }}>
                    <Bike size={14} /> We deliver via
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {deliveryPlatformLinks.map((platform) => {
                      const content = platform.logoUrl ? (
                        <img src={platform.logoUrl} alt={platform.label} loading="lazy" decoding="async" style={{ height: 16, objectFit: 'contain' }} />
                      ) : <span style={{ fontSize: 12, fontWeight: 700, color: surfaceAccent }}>{platform.label}</span>;
                      return platform.href ? (
                        <button
                          key={platform.partner}
                          type="button"
                          onClick={() => window.open(platform.href, '_blank', 'noopener,noreferrer')}
                          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
                        >
                          {content}
                        </button>
                      ) : (
                        <span key={platform.partner}>{content}</span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(hasContactRows || hasMapData) && (
        <div style={{ width: mobileInfoCardWidth, minWidth: mobileInfoCardWidth, maxWidth: mobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 16, fontFamily: heroTheme.bodyFont }}>Contact & Location</div>
          <div style={{ display: 'grid', gap: 14 }}>
            {visibleContactRows.filter((row) => row.label !== 'Address' && row.label !== 'Hours').slice(0, expandedMobileCard === 'contact' ? 99 : 1).map((row) => {
              const icon = getStorefrontContactIcon(row.label);
              const content = (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#0f172a', fontFamily: heroTheme.bodyFont, fontWeight: 600 }}>
                  <div style={{ color: row.label === 'Messenger' ? '#2563eb' : '#475569', display: 'flex' }}>{icon}</div>
                  <div>{row.value}</div>
                  <ChevronRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                </div>
              );
              return row.href ? (
                <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
                  {content}
                </button>
              ) : <div key={row.label}>{content}</div>;
            })}

            {selectedBranchLabel ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#0f172a', fontFamily: heroTheme.bodyFont, fontWeight: 600 }}>
                <div style={{ color: '#475569', display: 'flex' }}><MapPin size={16} /></div>
                <div>{selectedBranchLabel}</div>
              </div>
            ) : null}
          </div>

          {hasMapData && expandedMobileCard === 'contact' && (
            <>
              <div style={{ height: 1, background: '#f1f5f9', margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <MapPin size={18} color="#475569" style={{ marginTop: 2 }} />
                <div style={{ flex: 1, display: 'grid', gap: 2 }}>
                  {addressText ? <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, fontFamily: heroTheme.bodyFont }}>{addressText}</div> : null}
                  {storefrontCityLabel ? <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, fontFamily: heroTheme.bodyFont }}>{storefrontCityLabel}</div> : null}
                </div>
                <div style={{ display: 'grid', gap: 2, justifyItems: 'end' }}>
                  <button type="button" onClick={() => setIsExpandedMapOpen(true)} style={{ padding: 0, border: 'none', background: 'transparent', color: surfaceAccent, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: heroTheme.bodyFont }}>
                    Get directions
                  </button>
                  <StorefrontDirectionsEta latitude={addressRow?.destinationLatitude} longitude={addressRow?.destinationLongitude} bodyFont={heroTheme.bodyFont} />
                </div>
              </div>
              <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', border: '1px solid #edf2f7', background: '#f8fafc' }}>
                <StoresMap stores={mapStores} selectedKey={mapSelectedKey} onSelectStore={() => { }} height={110} focusSelectedKey />
                <button
                  type="button"
                  onClick={() => setIsExpandedMapOpen(true)}
                  style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(15,23,42,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#334155', zIndex: 10 }}
                >
                  <Maximize size={16} />
                </button>
              </div>
            </>
          )}

          {(hasMapData || visibleContactRows.length > 1) && expandedMobileCard !== 'contact' && (
            <button type="button" onClick={() => setExpandedMobileCard('contact')} style={{ background: 'none', border: 'none', padding: 0, color: surfaceAccent, fontSize: 12, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
              See details & map <ChevronDown size={14} />
            </button>
          )}
          {expandedMobileCard === 'contact' && (
            <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: surfaceAccent, fontSize: 12, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
              Hide details <ChevronUp size={14} />
            </button>
          )}
        </div>
      )}

      {hasWhyChooseUs && (
        <div style={{ width: mobileInfoCardWidth, minWidth: mobileInfoCardWidth, maxWidth: mobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 16, fontFamily: heroTheme.bodyFont }}>Why Choose Us?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {visibleWhyChooseUs.slice(0, expandedMobileCard === 'why' ? 99 : 2).map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: surfaceAccentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={16} color={surfaceAccent} />
                </div>
                <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{item}</div>
              </div>
            ))}
          </div>
          {visibleWhyChooseUs.length > 2 && expandedMobileCard !== 'why' && (
            <button type="button" onClick={() => setExpandedMobileCard('why')} style={{ background: 'none', border: 'none', padding: 0, borderRadius: 0, color: surfaceAccent, fontSize: usesConnectedHeroSurface ? 12 : 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
              See all <ChevronDown size={14} />
            </button>
          )}
          {expandedMobileCard === 'why' && (
            <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, borderRadius: 0, color: surfaceAccent, fontSize: usesConnectedHeroSurface ? 12 : 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content' }}>
              Show less <ChevronUp size={14} />
            </button>
          )}
        </div>
      )}
    </div>
    <FnbHeroGalleryLightbox
      open={isGalleryLightboxOpen}
      images={lightboxImages}
      currentIndex={galleryLightboxIndex}
      onClose={closeGalleryLightbox}
      onNavigate={navigateGalleryLightbox}
    />
    </>
  );
};

export { FnbHeroMobileInfoCards };
