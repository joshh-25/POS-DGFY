import React, { useMemo, useState } from 'react';
import { Bike, ChevronDown, ChevronUp, Maximize, Sparkles } from 'lucide-react';
import { StoresMap } from '../../../discovery/components/StoresMapLazy.jsx';
import { StorefrontExpandedMapModal } from '../../../discovery/components/StorefrontExpandedMapModal.jsx';
import { StorefrontAboutDescription } from '../../../features/shared-storefront/components/StorefrontAboutDescription.jsx';
import { getStorefrontContactIcon } from '../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { StorefrontExpandableBusinessHours } from '../../../features/shared-storefront/components/StorefrontExpandableBusinessHours.jsx';
import { StorefrontDirectionsEta } from './hero/StorefrontDirectionsEta.jsx';
import { StorefrontGalleryLightbox } from './StorefrontGalleryLightbox.jsx';
import {
  HERO_CANVAS_MAX_WIDTH,
  STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY,
  STOREFRONT_CONTACT_INFO_COLUMNS
} from '../../theme/storefrontStyleTokens.js';

const DEFAULT_PALETTE = {
  accent: '#0f766e',
  accentSoft: '#f0fdfa',
  accentDark: '#115e59',
  bodyFont: 'Inter, sans-serif',
  panelBorder: '#e8edf3',
  panelShadow: '0 18px 42px rgba(15, 23, 42, 0.07)',
  cardBorder: '#e2e8f0',
  cardShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  pageBackground: '#ffffff',
  heading: '#0f172a',
  text: '#334155',
  icon: '#64748b'
};

const normalizePalette = (palette = {}) => ({
  ...DEFAULT_PALETTE,
  ...palette,
  accent: palette.accent || palette.primary || palette.palette?.primary || DEFAULT_PALETTE.accent,
  accentSoft: palette.accentSoft || palette.palette?.accentSoft || DEFAULT_PALETTE.accentSoft,
  accentDark: palette.accentDark || palette.palette?.primaryDark || DEFAULT_PALETTE.accentDark,
  bodyFont: palette.bodyFont || DEFAULT_PALETTE.bodyFont,
  panelBorder: palette.panelBorder || palette.borderSoft || palette.palette?.secondary || DEFAULT_PALETTE.panelBorder,
  panelShadow: palette.panelShadow || DEFAULT_PALETTE.panelShadow,
  cardBorder: palette.cardBorder || palette.borderSoft || palette.palette?.secondary || DEFAULT_PALETTE.cardBorder,
  cardShadow: palette.cardShadow || palette.accentShadow || DEFAULT_PALETTE.cardShadow,
  pageBackground: palette.pageBackground || palette.palette?.pageBackground || DEFAULT_PALETTE.pageBackground,
  heading: palette.heading || DEFAULT_PALETTE.heading,
  text: palette.text || DEFAULT_PALETTE.text,
  icon: palette.icon || DEFAULT_PALETTE.icon
});

const toSafeArray = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

const ContactRow = ({ row, palette, onOpenAction, isMobile = false }) => {
  const typography = isMobile
    ? STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.mobile
    : STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.desktop;
  const icon = getStorefrontContactIcon(row.label);
  const label = String(row.label || '').trim().toLowerCase();
  const isCompactSingleLine = ['call', 'phone', 'facebook', 'messenger', 'message', 'hours'].includes(label);
  const content = (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '20px minmax(0, 1fr) auto' : '22px minmax(0, 1fr)',
      alignItems: 'start',
      columnGap: isMobile ? 12 : 10,
      fontSize: typography.body,
      color: palette.text,
      fontFamily: palette.bodyFont
    }}>
      <div style={{ width: isMobile ? 20 : 22, color: palette.icon, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, display: 'grid', gap: row.actionHref ? 4 : 0 }}>
        {row.label === 'Hours' && row.rawHoursData ? (
          <StorefrontExpandableBusinessHours schedule={row.rawHoursData} theme={palette} />
        ) : (
          <div style={{ fontSize: typography.body, fontWeight: 600, color: palette.text, whiteSpace: isCompactSingleLine ? 'nowrap' : 'normal', wordBreak: isCompactSingleLine ? 'normal' : 'break-word', lineHeight: STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.contactLineHeight }}>
            {row.value}
          </div>
        )}
        {row.actionHref && !isMobile ? (
          <button
            type="button"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenAction(row.actionHref); }}
            style={{ padding: 0, border: 'none', background: 'transparent', color: palette.accent, fontSize: typography.action, fontWeight: 800, cursor: 'pointer', justifySelf: 'start', fontFamily: palette.bodyFont }}
          >
            {row.actionLabel || 'Get directions'}
          </button>
        ) : null}
        {!isMobile && row.label === 'Address' ? (
          <StorefrontDirectionsEta latitude={row.destinationLatitude} longitude={row.destinationLongitude} bodyFont={palette.bodyFont} />
        ) : null}
      </div>
      {isMobile ? <span aria-hidden="true" style={{ color: '#94a3b8', fontSize: typography.chevron || typography.action, lineHeight: 1 }}>›</span> : null}
    </div>
  );

  if (!row.href) return <div>{content}</div>;
  return (
    <button type="button" onClick={() => onOpenAction(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      {content}
    </button>
  );
};

const DeliveryPartners = ({ links, palette, onOpenAction }) => {
  const typography = STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.desktop;
  if (!links.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0, fontFamily: palette.bodyFont }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: typography.action, fontWeight: 800, color: palette.text, whiteSpace: 'nowrap' }}>
        <Bike size={14} /> We deliver via
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
        {links.map((platform) => {
          const badge = platform.logoUrl ? (
            <img src={platform.logoUrl} alt={platform.label} loading="lazy" decoding="async" style={{ maxHeight: 16, width: 'auto', display: 'block', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: typography.action, fontWeight: 800, color: palette.accent, whiteSpace: 'nowrap' }}>{platform.label}</span>
          );
          return platform.href ? (
            <button key={platform.partner || platform.label} type="button" onClick={() => onOpenAction(platform.href)} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>{badge}</button>
          ) : <span key={platform.partner || platform.label}>{badge}</span>;
        })}
      </div>
    </div>
  );
};

export function StorefrontBusinessInformationPanel({
  isMobileViewport = false,
  aboutText = '',
  addressText = '',
  deliveryPlatformLinks = [],
  galleryImages = [],
  galleryImagesFull = [],
  galleryOverflowCount = 0,
  mapSelectedKey = null,
  mapStores = [],
  visibleContactRows = [],
  visibleWhyChooseUs = [],
  palette,
  openStorefrontActionLink,
  storeName = 'Store',
  selectedBranchLabel = '',
  storefrontCityLabel = ''
}) {
  const theme = useMemo(() => normalizePalette(palette), [palette]);
  const desktopTypography = STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.desktop;
  const mobileTypography = STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.mobile;
  const [expandedMobileCard, setExpandedMobileCard] = useState(null);
  const [isExpandedMapOpen, setIsExpandedMapOpen] = useState(false);
  const [isGalleryLightboxOpen, setIsGalleryLightboxOpen] = useState(false);
  const [galleryLightboxIndex, setGalleryLightboxIndex] = useState(0);
  const safeGalleryImages = toSafeArray(galleryImages);
  const lightboxImages = toSafeArray(galleryImagesFull).length > 0 ? toSafeArray(galleryImagesFull) : safeGalleryImages;
  const safeContactRows = toSafeArray(visibleContactRows);
  const safeWhyChooseUs = toSafeArray(visibleWhyChooseUs).slice(0, 4);
  const hasAboutSection = String(aboutText || '').trim().length > 0;
  const hasGallerySection = safeGalleryImages.length > 0;
  const hasContactRows = safeContactRows.length > 0 || Boolean(selectedBranchLabel || addressText || storefrontCityLabel);
  const hasMapData = mapStores.length > 0;
  const hasWhyChooseUs = safeWhyChooseUs.length > 0;
  const hasAboutOrGallerySection = hasAboutSection || hasGallerySection;
  const addressRow = safeContactRows.find((row) => row.label === 'Address');
  const onOpenAction = typeof openStorefrontActionLink === 'function'
    ? openStorefrontActionLink
    : (href) => { if (href && typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer'); };
  const openGalleryLightbox = (startIndex = 0) => {
    setGalleryLightboxIndex(startIndex);
    setIsGalleryLightboxOpen(true);
  };
  const navigateGalleryLightbox = (direction) => {
    setGalleryLightboxIndex((previousIndex) => {
      const total = lightboxImages.length;
      if (!total) return previousIndex;
      return direction === 'previous'
        ? (previousIndex - 1 + total) % total
        : (previousIndex + 1) % total;
    });
  };
  const mapTitle = `${storeName || 'Store'} Map`;

  const renderMobileGallery = ({ alignToDescription = false } = {}) => (
    <button type="button" onClick={() => openGalleryLightbox(0)} aria-label="View store photos" style={{ width: 88, height: 68, borderRadius: 12, overflow: 'hidden', position: 'relative', border: 'none', padding: 0, background: '#e2e8f0', cursor: 'pointer', flexShrink: 0, gridColumn: alignToDescription ? 2 : 1, gridRow: alignToDescription ? 2 : 1, alignSelf: 'start', marginTop: alignToDescription ? 4 : 0 }}>
      <img src={safeGalleryImages[0]} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {Math.max(0, safeGalleryImages.length + Number(galleryOverflowCount || 0) - 1) > 0 ? <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: mobileTypography.galleryOverlay, fontWeight: 800, fontFamily: theme.bodyFont }}>+{Math.max(0, safeGalleryImages.length + Number(galleryOverflowCount || 0) - 1)}</span> : null}
    </button>
  );

  const renderAboutAndGallery = ({ mobile = false } = {}) => (
    <div style={{ display: 'grid', gap: mobile ? 16 : 14, alignContent: 'start' }}>
      {mobile ? (
        <div data-testid="storefront-business-information-about-layout" style={{ display: 'grid', gridTemplateColumns: hasAboutSection && hasGallerySection ? 'minmax(0, 1fr) 88px' : '1fr', gap: 10, alignItems: 'start' }}>
          {hasAboutSection ? (
            <>
              <div style={{ gridColumn: 1, gridRow: 1, fontSize: mobileTypography.sectionHeading, fontWeight: 800, color: theme.heading, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: theme.bodyFont }}>About Us</div>
              <div style={{ gridColumn: 1, gridRow: 2, minWidth: 0, marginTop: 4 }}>
                <StorefrontAboutDescription text={String(aboutText).trim()} accentColor={theme.accent} fontFamily={theme.bodyFont} fontSize={mobileTypography.body} lineHeight={STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.bodyLineHeight} collapsible={hasGallerySection} />
              </div>
            </>
          ) : null}
          {hasGallerySection ? renderMobileGallery({ alignToDescription: hasAboutSection }) : null}
        </div>
      ) : (
        <>
          {hasAboutSection && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: desktopTypography.sectionHeading, fontWeight: 800, color: theme.heading, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: theme.bodyFont }}>About Us</div>
              <StorefrontAboutDescription text={String(aboutText).trim()} accentColor={theme.accent} fontFamily={theme.bodyFont} fontSize={desktopTypography.body} lineHeight={STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.bodyLineHeight} collapsible={hasGallerySection} />
            </div>
          )}
          {hasGallerySection && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: desktopTypography.sectionHeading, fontWeight: 800, color: theme.heading, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: theme.bodyFont }}>Gallery</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 2 }}>
                {safeGalleryImages.slice(0, 4).map((url, index, visibleImages) => (
                  <button key={`${url}-${index}`} type="button" onClick={() => openGalleryLightbox(index)} aria-label="View store photos" style={{ width: '100%', minWidth: 0, height: 72, borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#e2e8f0', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <img src={url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {index === visibleImages.length - 1 && Number(galleryOverflowCount) > 0 ? <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: desktopTypography.galleryOverlay, fontWeight: 800, fontFamily: theme.bodyFont }}>+{galleryOverflowCount}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderContactAndLocation = ({ mobile = false } = {}) => {
    const primaryContactRow = safeContactRows.find((row) => !['address', 'hours'].includes(String(row.label || '').trim().toLowerCase()));
    const configuredAddressRow = safeContactRows.find((row) => String(row.label || '').trim().toLowerCase() === 'address');
    const mobileBranchRow = selectedBranchLabel
      ? { ...(configuredAddressRow || {}), label: 'Address', value: selectedBranchLabel }
      : configuredAddressRow;
    const collapsedContactRows = [primaryContactRow, mobileBranchRow].filter(Boolean);
    const contactRows = mobile
      ? expandedMobileCard === 'contact'
        ? safeContactRows.filter((row) => String(row.label || '').trim().toLowerCase() !== 'address')
        : collapsedContactRows
      : safeContactRows;
    return (
      <div style={{ display: 'grid', gap: mobile ? 16 : 14, alignContent: 'start', paddingLeft: mobile ? 0 : (hasAboutOrGallerySection ? 26 : 0), borderLeft: mobile ? 'none' : (hasAboutOrGallerySection ? '1px solid #eef2f6' : 'none') }}>
        <div style={{ fontSize: mobile ? mobileTypography.sectionHeading : desktopTypography.sectionHeading, fontWeight: 800, color: theme.heading, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: theme.bodyFont }}>Contact &amp; Location</div>
        <div data-testid="storefront-contact-location-layout" style={{ display: 'grid', gridTemplateColumns: !mobile && hasMapData ? STOREFRONT_CONTACT_INFO_COLUMNS : '1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: mobile ? 14 : 16, alignContent: 'start', paddingTop: mobile ? 0 : 4 }}>
            {contactRows.length > 0 ? contactRows.map((row) => <ContactRow key={`${row.label}-${row.value}`} row={row} palette={theme} onOpenAction={onOpenAction} isMobile={mobile} />) : null}
            {mobile && (addressText || storefrontCityLabel) && expandedMobileCard === 'contact' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ color: theme.icon, display: 'flex', marginTop: 2 }}>{getStorefrontContactIcon('Address')}</div>
                  <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
                    {addressText ? <div style={{ fontSize: mobileTypography.body, color: theme.heading, fontWeight: 600, fontFamily: theme.bodyFont }}>{addressText}</div> : null}
                    {storefrontCityLabel ? <div style={{ fontSize: mobileTypography.body, color: theme.icon, fontWeight: 500, fontFamily: theme.bodyFont }}>{storefrontCityLabel}</div> : null}
                  </div>
                  <button type="button" onClick={() => setIsExpandedMapOpen(true)} style={{ padding: 0, border: 'none', background: 'transparent', color: theme.accent, fontSize: mobileTypography.action, fontWeight: 800, cursor: 'pointer', fontFamily: theme.bodyFont }}>Get directions</button>
                </div>
                {addressRow ? <StorefrontDirectionsEta latitude={addressRow.destinationLatitude} longitude={addressRow.destinationLongitude} bodyFont={theme.bodyFont} /> : null}
              </div>
            ) : null}
          </div>
          {hasMapData ? (
            <div style={{ display: 'grid', gap: 10, alignContent: 'start', marginTop: mobile ? 0 : -30 }}>
              {(!mobile || expandedMobileCard === 'contact') ? <div data-testid="storefront-business-information-map" style={{ position: 'relative', width: '100%', height: mobile ? 110 : 156, borderRadius: mobile ? 12 : 14, overflow: 'hidden', border: '1px solid #edf2f7', background: '#f8fafc' }}>
                <StoresMap stores={mapStores} selectedKey={mapSelectedKey} onSelectStore={() => {}} height={mobile ? 110 : 156} focusSelectedKey />
                <button type="button" onClick={() => setIsExpandedMapOpen(true)} aria-label="Open large map" title="Open large map" style={{ position: 'absolute', top: mobile ? 8 : 12, right: mobile ? 8 : 12, width: mobile ? 32 : 36, height: mobile ? 32 : 36, borderRadius: mobile ? 8 : 10, background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 12px rgba(15,23,42,0.1)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#334155', zIndex: 10 }}><Maximize size={mobile ? 16 : 18} /></button>
              </div> : null}
              <DeliveryPartners links={toSafeArray(deliveryPlatformLinks)} palette={theme} onOpenAction={onOpenAction} />
            </div>
          ) : null}
        </div>
        {mobile && (hasMapData || collapsedContactRows.length > 1 || addressText || storefrontCityLabel) ? <button type="button" onClick={() => setExpandedMobileCard(expandedMobileCard === 'contact' ? null : 'contact')} style={{ background: 'none', border: 'none', padding: 0, color: theme.accent, fontSize: mobileTypography.action, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: theme.bodyFont }}>{expandedMobileCard === 'contact' ? 'Hide details' : 'See details & map'}{expandedMobileCard === 'contact' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button> : null}
      </div>
    );
  };

  const renderWhyChooseUs = ({ mobile = false } = {}) => {
    const whyItems = mobile && expandedMobileCard !== 'why' ? safeWhyChooseUs.slice(0, 2) : safeWhyChooseUs;
    return hasWhyChooseUs ? (
      <div style={{ display: 'grid', gap: mobile ? 16 : 14, alignContent: 'start', alignItems: 'start', paddingLeft: mobile ? 0 : 26, borderLeft: mobile ? 'none' : '1px solid #eef2f6' }}>
        <div style={{ fontSize: mobile ? mobileTypography.sectionHeading : desktopTypography.sectionHeading, fontWeight: 800, color: theme.heading, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: theme.bodyFont }}>Why Choose Us?</div>
        <div style={{ display: 'grid', gap: mobile ? 14 : 16, alignContent: 'start', paddingTop: mobile ? 0 : 4 }}>
          {whyItems.map((item, index) => <div key={`${item}-${index}`} style={{ display: 'grid', gridTemplateColumns: mobile ? '32px minmax(0, 1fr)' : '30px minmax(0, 1fr)', alignItems: 'center', columnGap: 12, fontSize: mobileTypography.body, color: theme.text, lineHeight: STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.whyLineHeight, fontFamily: theme.bodyFont }}><div style={{ width: mobile ? 32 : 30, height: mobile ? 32 : 30, borderRadius: 999, background: theme.accentSoft, color: theme.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={mobile ? 16 : 14} /></div><div style={{ fontWeight: 600 }}>{item}</div></div>)}
        </div>
        {mobile && safeWhyChooseUs.length > 2 ? <button type="button" onClick={() => setExpandedMobileCard(expandedMobileCard === 'why' ? null : 'why')} style={{ background: 'none', border: 'none', padding: 0, color: theme.accent, fontSize: mobileTypography.action, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'max-content', fontFamily: theme.bodyFont }}>{expandedMobileCard === 'why' ? 'Show less' : 'See all'}{expandedMobileCard === 'why' ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button> : null}
      </div>
    ) : null;
  };

  const sharedLightbox = <StorefrontGalleryLightbox open={isGalleryLightboxOpen} images={lightboxImages} currentIndex={galleryLightboxIndex} onClose={() => setIsGalleryLightboxOpen(false)} onNavigate={navigateGalleryLightbox} />;
  const mapModal = <StorefrontExpandedMapModal open={isExpandedMapOpen} onClose={() => setIsExpandedMapOpen(false)} title={mapTitle} subtitle="View the store location in a larger map." stores={mapStores} selectedKey={mapSelectedKey} />;

  if (isMobileViewport) {
    return (
      <>
        <div data-testid="storefront-business-information-panel" style={{ width: '100%', minWidth: 0, padding: '12px 16px 20px', display: 'flex', flexDirection: 'row', gap: 14, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollPaddingInline: 16, WebkitOverflowScrolling: 'touch', alignItems: 'stretch', boxSizing: 'border-box', background: theme.pageBackground }}>
          {hasAboutOrGallerySection && <div style={{ width: 'calc(100% - 32px)', minWidth: 'calc(100% - 32px)', scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 16, boxShadow: theme.cardShadow, boxSizing: 'border-box' }}>{renderAboutAndGallery({ mobile: true })}</div>}
          {(hasContactRows || hasMapData || deliveryPlatformLinks.length > 0) && <div style={{ width: 'calc(100% - 32px)', minWidth: 'calc(100% - 32px)', scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 16, boxShadow: theme.cardShadow, boxSizing: 'border-box' }}>{renderContactAndLocation({ mobile: true })}</div>}
          {hasWhyChooseUs && <div style={{ width: 'calc(100% - 32px)', minWidth: 'calc(100% - 32px)', scrollSnapAlign: 'start', background: '#fff', border: `1px solid ${theme.cardBorder}`, borderRadius: 16, padding: 16, boxShadow: theme.cardShadow, boxSizing: 'border-box' }}>{renderWhyChooseUs({ mobile: true })}</div>}
        </div>
        {sharedLightbox}
        {mapModal}
      </>
    );
  }

  const desktopColumns = hasAboutOrGallerySection
    ? (hasWhyChooseUs ? '1fr 1.6fr 0.92fr' : '1fr 1.6fr')
    : (hasWhyChooseUs ? '1.6fr 0.92fr' : '1fr');
  return (
    <>
      <div data-testid="storefront-business-information-panel" style={{ width: 'calc(100% - 48px)', maxWidth: HERO_CANVAS_MAX_WIDTH, margin: '64px auto 36px', padding: 24, background: '#fff', border: `1px solid ${theme.panelBorder}`, borderRadius: 24, boxShadow: theme.panelShadow, display: 'grid', gridTemplateColumns: desktopColumns, gap: 24, boxSizing: 'border-box' }}>
        {hasAboutOrGallerySection && renderAboutAndGallery()}
        {renderContactAndLocation()}
        {hasWhyChooseUs && renderWhyChooseUs()}
      </div>
      {sharedLightbox}
      {mapModal}
    </>
  );
}
