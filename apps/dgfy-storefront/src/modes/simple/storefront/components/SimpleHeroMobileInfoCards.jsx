import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Maximize
} from 'lucide-react';
import { StoresMap } from '../../../../discovery/components/StoresMapLazy.jsx';
import { getStorefrontContactIcon } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { SimpleHeroGallery } from './SimpleHeroGallery.jsx';

const SimpleHeroMobileInfoCards = ({
  STYLES,
  aboutText,
  addressText,
  hasAboutSection,
  hasAboutToggle,
  hasGallerySection,
  galleryImages,
  galleryImagesFull,
  galleryOverflowCount,
  hasContactRows,
  hasMapData,
  hasWhyChooseUs,
  heroTheme,
  openStorefrontActionLink,
  selectedBranchLabel,
  setIsExpandedMapOpen,
  simpleHeroModel,
  storefrontCityLabel,
  visibleContactRows,
  visibleWhyChooseUs
}) => {
  const [expandedMobileCard, setExpandedMobileCard] = useState(null);
  const simpleMobileInfoCardWidth = 'calc(100% - 32px)';
  const mobileSectionBackground = '#fff';
  const infoCardShadow = '0 3px 12px rgba(23,107,58,0.06)';
  const infoCardBorder = heroTheme.catalogPalette?.borderStrong || heroTheme.borderSoft || '#D5B36B';

  return (
    <div style={{ display: 'grid', gap: 0, paddingBottom: 24, marginTop: 24, background: mobileSectionBackground }}>
      <div className="no-scrollbar" style={{ width: '100%', maxWidth: '100%', minWidth: 0, padding: '12px 16px 20px', display: 'flex', flexDirection: 'row', gap: 14, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollPaddingInline: 16, WebkitOverflowScrolling: 'touch', margin: 0, alignItems: 'stretch', boxSizing: 'border-box', background: mobileSectionBackground }}>
        {(hasAboutSection || hasGallerySection) && (
          <div style={{ width: simpleMobileInfoCardWidth, minWidth: simpleMobileInfoCardWidth, maxWidth: simpleMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1.5px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
            {hasAboutSection ? (
              <>
                <div style={{ fontSize: 16, fontWeight: heroTheme.typography?.cardTitle?.weight || 700, color: '#0f172a', marginBottom: 12, fontFamily: heroTheme.bodyFont }}>
                  About Us
                </div>
              </>
            ) : null}
            {(hasAboutSection || hasGallerySection) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                {hasAboutSection ? (
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <p style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: '#475569',
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: expandedMobileCard === 'about' ? 'unset' : 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      fontFamily: heroTheme.bodyFont
                    }}>
                      {aboutText}
                    </p>
                    {hasAboutToggle && expandedMobileCard !== 'about' ? (
                      <button type="button" onClick={() => setExpandedMobileCard('about')} style={{ background: 'none', border: 'none', padding: 0, marginTop: 10, color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                        See more <ChevronDown size={14} />
                      </button>
                    ) : null}
                    {hasAboutToggle && expandedMobileCard === 'about' ? (
                      <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, marginTop: 10, color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                        Show less <ChevronUp size={14} />
                      </button>
                    ) : null}
                  </div>
                ) : <div style={{ flex: 1 }} />}
                {hasGallerySection ? (
                  <SimpleHeroGallery
                    STYLES={STYLES}
                    galleryImages={galleryImages}
                    galleryImagesFull={galleryImagesFull}
                    galleryOverflowCount={galleryOverflowCount}
                    heroTheme={heroTheme}
                    isMobileViewport
                    compactMobile
                  />
                ) : null}
              </div>
            )}
          </div>
        )}

        {(hasContactRows || hasMapData) && (
          <div style={{ width: simpleMobileInfoCardWidth, minWidth: simpleMobileInfoCardWidth, maxWidth: simpleMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1.5px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, fontWeight: heroTheme.typography?.cardTitle?.weight || 700, color: '#0f172a', marginBottom: 16, fontFamily: heroTheme.bodyFont }}>Contact & Location</div>
            <div style={{ display: 'grid', gap: 14 }}>
              {visibleContactRows.filter((row) => row.label !== 'Address' && row.label !== 'Hours').slice(0, expandedMobileCard === 'contact' ? 99 : 1).map((row) => {
                const icon = getStorefrontContactIcon(row.label);
                const content = (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#0f172a', fontFamily: heroTheme.bodyFont, fontWeight: 600 }}>
                    <div style={{ color: heroTheme.accentDark || STYLES.colors.brandDark, display: 'flex' }}>{icon}</div>
                    <div>{row.value}</div>
                    <ChevronRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                  </div>
                );
                return row.href ? (
                  <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }}>{content}</button>
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
                  <button type="button" onClick={() => setIsExpandedMapOpen(true)} style={{ padding: 0, border: 'none', background: 'transparent', color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: heroTheme.bodyFont }}>
                    Get directions
                  </button>
                </div>
                <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', border: '1px solid #edf2f7', background: '#f8fafc' }}>
                  <StoresMap stores={simpleHeroModel.mapStores} selectedKey={simpleHeroModel.mapSelectedKey} onSelectStore={() => { }} height={110} focusSelectedKey />
                  <button
                    type="button"
                    onClick={() => setIsExpandedMapOpen(true)}
                    style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 3px 8px rgba(23,107,58,0.08)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#334155', zIndex: 10 }}
                  >
                    <Maximize size={16} />
                  </button>
                </div>
              </>
            )}

            {(hasMapData || visibleContactRows.length > 1) && expandedMobileCard !== 'contact' && (
              <button type="button" onClick={() => setExpandedMobileCard('contact')} style={{ background: 'none', border: 'none', padding: 0, color: heroTheme.accent || STYLES.colors.brand, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                See details & map <ChevronDown size={14} />
              </button>
            )}
            {expandedMobileCard === 'contact' && (
              <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: heroTheme.accent || STYLES.colors.brand, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                Hide details <ChevronUp size={14} />
              </button>
            )}
          </div>
        )}

        {hasWhyChooseUs && (
          <div style={{ width: simpleMobileInfoCardWidth, minWidth: simpleMobileInfoCardWidth, maxWidth: simpleMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1.5px solid ${infoCardBorder}`, borderRadius: 16, padding: 16, boxShadow: infoCardShadow, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, fontWeight: heroTheme.typography?.cardTitle?.weight || 700, color: '#0f172a', marginBottom: 16, fontFamily: heroTheme.bodyFont }}>Why Shop Here?</div>
            <div style={{ display: 'grid', gap: 14 }}>
              {visibleWhyChooseUs.slice(0, expandedMobileCard === 'why' ? 99 : 2).map((item, index) => (
                <div key={`why-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ color: heroTheme.accent || STYLES.colors.brand, marginTop: 2 }}><CheckCircle2 size={16} /></div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.4, fontFamily: heroTheme.bodyFont }}>{item}</div>
                </div>
              ))}
            </div>
            {visibleWhyChooseUs.length > 2 && expandedMobileCard !== 'why' && (
              <button type="button" onClick={() => setExpandedMobileCard('why')} style={{ background: 'none', border: 'none', padding: 0, color: heroTheme.accent || STYLES.colors.brand, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                View all <ChevronDown size={14} />
              </button>
            )}
            {expandedMobileCard === 'why' && (
              <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: heroTheme.accent || STYLES.colors.brand, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: heroTheme.bodyFont }}>
                Show less <ChevronUp size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { SimpleHeroMobileInfoCards };
