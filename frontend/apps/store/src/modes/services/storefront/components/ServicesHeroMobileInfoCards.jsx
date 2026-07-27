import React, { useState } from 'react';
import {
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Maximize
} from 'lucide-react';
import { StoresMap } from '../../../../discovery/components/StoresMap.jsx';
import { getStorefrontContactIcon } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';

const ServicesHeroMobileInfoCards = ({
  aboutText,
  addressText,
  deliveryPlatformLinks,
  galleryImages,
  hasAboutSection,
  hasAboutToggle,
  hasContactRows,
  hasGallerySection,
  hasMapData,
  hasWhyChooseUs,
  isAboutExpanded,
  isServiceGalleryExpanded,
  openStorefrontActionLink,
  previewImages,
  selectedBranchLabel,
  serviceHeroModel,
  servicesBodyFont,
  servicesMobileInfoCardWidth,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadow,
  servicesPrimarySoft,
  setIsAboutExpanded,
  setIsExpandedMapOpen,
  setIsServiceGalleryExpanded,
  storefrontCityLabel,
  visibleContactRows,
  visibleWhyChooseUs
}) => {
  const [expandedMobileCard, setExpandedMobileCard] = useState(null);

  return (
    <div style={{ display: 'grid', gap: 0, paddingBottom: 24, marginTop: 24 }}>
      <div
        className="no-scrollbar"
        style={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          padding: '12px 16px 20px',
          display: 'flex',
          flexDirection: 'row',
          gap: 14,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: 16,
          WebkitOverflowScrolling: 'touch',
          margin: 0,
          alignItems: 'stretch',
          boxSizing: 'border-box'
        }}
      >
        {(hasAboutSection || hasGallerySection) && (
          <div style={{ width: servicesMobileInfoCardWidth, minWidth: servicesMobileInfoCardWidth, maxWidth: servicesMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${servicesPrimarySoft}`, borderRadius: 16, padding: 16, boxShadow: `0 8px 24px ${servicesPrimaryShadow}`, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12, fontFamily: servicesBodyFont }}>
              {hasAboutSection ? 'About Us' : 'Store Details'}
            </div>
            {hasAboutSection && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <p style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: '#475569',
                  margin: 0,
                  display: isAboutExpanded ? 'block' : '-webkit-box',
                  WebkitLineClamp: isAboutExpanded ? 'unset' : 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  fontFamily: servicesBodyFont
                }}>
                  {aboutText}
                </p>
                {hasAboutToggle && (
                  <button type="button" onClick={() => setIsAboutExpanded((previous) => !previous)} style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, justifySelf: 'start', marginTop: 8, fontFamily: servicesBodyFont }}>
                    {isAboutExpanded ? 'See less' : 'See more'}
                  </button>
                )}
              </div>
            )}
            {hasGallerySection && (
              <div style={{ display: 'grid', gap: 10, marginTop: hasAboutSection ? 16 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: servicesBodyFont }}>Gallery</div>
                <div className="no-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {previewImages.map((url, index) => (
                    <div key={`${url}-${index}`} style={{ width: 84, minWidth: 84, height: 72, borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#e2e8f0', flexShrink: 0 }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
                {galleryImages.length > 4 && (
                  <button type="button" onClick={() => setIsServiceGalleryExpanded((previous) => !previous)} style={{ border: 'none', background: 'transparent', color: servicesPrimary, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, justifySelf: 'start', fontFamily: servicesBodyFont }}>
                    {isServiceGalleryExpanded ? 'Show fewer photos' : 'View all photos'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(hasContactRows || hasMapData) && (
          <div style={{ width: servicesMobileInfoCardWidth, minWidth: servicesMobileInfoCardWidth, maxWidth: servicesMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${servicesPrimarySoft}`, borderRadius: 16, padding: 16, boxShadow: `0 8px 24px ${servicesPrimaryShadow}`, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 16, fontFamily: servicesBodyFont }}>Contact & Location</div>
            <div style={{ display: 'grid', gap: 14 }}>
              {visibleContactRows.filter((row) => row.label !== 'Address' && row.label !== 'Hours').slice(0, expandedMobileCard === 'contact' ? 99 : 1).map((row) => {
                const icon = getStorefrontContactIcon(row.label);
                const content = (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#0f172a', fontFamily: servicesBodyFont, fontWeight: 600 }}>
                    <div style={{ color: servicesPrimaryDark, display: 'flex' }}>{icon}</div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#0f172a', fontFamily: servicesBodyFont, fontWeight: 600 }}>
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
                    {addressText ? <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, fontFamily: servicesBodyFont }}>{addressText}</div> : null}
                    {storefrontCityLabel ? <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, fontFamily: servicesBodyFont }}>{storefrontCityLabel}</div> : null}
                  </div>
                  <button type="button" onClick={() => setIsExpandedMapOpen(true)} style={{ padding: 0, border: 'none', background: 'transparent', color: servicesPrimary, fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: servicesBodyFont }}>
                    Get directions
                  </button>
                </div>
                <div style={{ position: 'relative', width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', border: '1px solid #edf2f7', background: '#f8fafc' }}>
                  <StoresMap stores={serviceHeroModel.mapStores} selectedKey={serviceHeroModel.mapSelectedKey} onSelectStore={() => { }} height={110} />
                  <button
                    type="button"
                    onClick={() => setIsExpandedMapOpen(true)}
                    style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(15,23,42,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#334155', zIndex: 10 }}
                  >
                    <Maximize size={16} />
                  </button>
                </div>
                {deliveryPlatformLinks.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: '#334155', whiteSpace: 'nowrap', fontFamily: servicesBodyFont }}>
                      <Bike size={14} /> We deliver via
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', minWidth: 0 }}>
                      {deliveryPlatformLinks.map((platform) => {
                        const badge = (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 20, flexShrink: 0 }}>
                            {platform.logoUrl ? (
                              <img src={platform.logoUrl} alt={platform.label} style={{ maxHeight: 14, width: 'auto', display: 'block', objectFit: 'contain' }} />
                            ) : (
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', whiteSpace: 'nowrap' }}>{platform.label}</span>
                            )}
                          </span>
                        );

                        return platform.href ? (
                          <button
                            key={`services-mobile-delivery-platform-${platform.partner}`}
                            type="button"
                            onClick={() => openStorefrontActionLink(platform.href)}
                            style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                          >
                            {badge}
                          </button>
                        ) : (
                          <span key={`services-mobile-delivery-platform-${platform.partner}`}>{badge}</span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            )}

            {(hasMapData || visibleContactRows.length > 1) && expandedMobileCard !== 'contact' && (
              <button type="button" onClick={() => setExpandedMobileCard('contact')} style={{ background: 'none', border: 'none', padding: 0, color: servicesPrimary, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: servicesBodyFont }}>
                See details & map <ChevronDown size={14} />
              </button>
            )}
            {expandedMobileCard === 'contact' && (
              <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: servicesPrimary, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: servicesBodyFont }}>
                Hide details <ChevronUp size={14} />
              </button>
            )}
          </div>
        )}

        {hasWhyChooseUs && (
          <div style={{ width: servicesMobileInfoCardWidth, minWidth: servicesMobileInfoCardWidth, maxWidth: servicesMobileInfoCardWidth, scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${servicesPrimarySoft}`, borderRadius: 16, padding: 16, boxShadow: `0 8px 24px ${servicesPrimaryShadow}`, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 16, fontFamily: servicesBodyFont }}>Why Choose Us</div>
            <div style={{ display: 'grid', gap: 14 }}>
              {visibleWhyChooseUs.slice(0, expandedMobileCard === 'why' ? 99 : 2).map((item, index) => (
                <div key={`why-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ color: servicesPrimary, marginTop: 2 }}><CheckCircle2 size={16} /></div>
                  <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.4, fontFamily: servicesBodyFont }}>{item}</div>
                </div>
              ))}
            </div>
            {visibleWhyChooseUs.length > 2 && expandedMobileCard !== 'why' && (
              <button type="button" onClick={() => setExpandedMobileCard('why')} style={{ background: 'none', border: 'none', padding: 0, color: servicesPrimary, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: servicesBodyFont }}>
                View all <ChevronDown size={14} />
              </button>
            )}
            {expandedMobileCard === 'why' && (
              <button type="button" onClick={() => setExpandedMobileCard(null)} style={{ background: 'none', border: 'none', padding: 0, color: servicesPrimary, fontSize: 13, fontWeight: 700, marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: servicesBodyFont }}>
                Show less <ChevronUp size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { ServicesHeroMobileInfoCards };
