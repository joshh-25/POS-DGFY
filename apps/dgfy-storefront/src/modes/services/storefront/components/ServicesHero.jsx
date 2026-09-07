import React, { useMemo } from 'react';
import {
  MapPin,
  MessageSquare,
  MousePointer2,
  Phone,
  Star
} from 'lucide-react';
import { buildPublicStorefrontUrl } from '../../../../app/runtime/storefrontRuntime.js';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from '../../../../shared/components/storefront/hero/StorefrontHeaderNav.jsx';
import { StorefrontHeroNameCluster as SharedStorefrontHeroNameCluster } from '../../../../shared/components/storefront/hero/StorefrontHeroNameCluster.jsx';
import { StorefrontShareQr as SharedStorefrontShareQr } from '../../../../shared/components/storefront/hero/StorefrontShareQr.jsx';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { formatServiceNumber } from '../../servicesFormatters.js';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { getServicesResponsiveLayout } from '../../../../shared/utils/storefrontViewport.js';
import { StorefrontBusinessInformationPanel } from '../../../../shared/components/storefront/StorefrontBusinessInformationPanel.jsx';
import { StorefrontAccountBranchSwitcher } from '../../../../shared/components/storefront/hero/StorefrontAccountBranchSwitcher.jsx';
import { useStorefrontAccountBranches } from '../../../../shared/hooks/useStorefrontAccountBranches.js';
import {
  deriveServicesHeroContent,
  deriveServicesHeroTheme
} from '../model/servicesHeroPresentation.js';

const ServicesHero = ({
  serviceHeroModel,
  selectedStore,
  isMobileViewport,
  viewportWidth,
  hasMultipleStoreBranches,
  hasSelectedBranchFromMenu,
  selectedLocationId,
  handleBranchMenuSelection,
  storeLocations,
  goDiscovery,
  goStore,
  hasServiceCart,
  goStoreBookingPage,
  modeAdapter,
  isBrandingImageBlocked,
  markBrandingImageError,
  selectedLocation,
  isServiceGalleryExpanded,
  openStorefrontActionLink,
  openTrackPanel,
  openAccountPanel,
  onRegisterBusiness,
  isStorefrontAccountAuthenticated,
  activeCustomerOrderCount,
  accountIdentityName,
  accountIdentityRawEmail,
  accountIdentityContact,
  accountIdentityInitials,
  followEnabled,
  shareEnabled,
  followState,
  handleFollowAction,
  ui,
  heroStyles,
  helperFns
}) => {
  const {
    Badge,
    GhostButton,
    PrimaryButton,
    StorefrontHeroShell
  } = ui;
  const {
    buildVisibleStorefrontContactRows,
    getDeliveryPlatformLinks
  } = helperFns;
  const { accountBranches, hasMultipleAccountBranches } = useStorefrontAccountBranches({
    isStorefrontAccountAuthenticated,
    selectedStore
  });
  const {
    HERO_CANVAS_MAX_WIDTH,
    MAX_STOREFRONT_WHY_CHOOSE_US,
    MOBILE_DROPDOWN_MENU_STYLE,
    MOBILE_DROPDOWN_OPTION_STYLE,
    MOBILE_NATIVE_SELECT_STYLE,
    STYLES
  } = heroStyles;
  const {
    aboutText,
    addressText,
    deliveryPlatformLinks,
    galleryImages,
    selectedBranchLabel,
    storefrontCityLabel,
    visibleContactRows,
    visibleWhyChooseUs
  } = useMemo(() => deriveServicesHeroContent({
    buildVisibleStorefrontContactRows,
    getDeliveryPlatformLinks,
    isServiceGalleryExpanded,
    maxWhyChooseUs: MAX_STOREFRONT_WHY_CHOOSE_US,
    selectedLocation,
    selectedStore,
    serviceHeroModel
  }), [
    MAX_STOREFRONT_WHY_CHOOSE_US,
    buildVisibleStorefrontContactRows,
    getDeliveryPlatformLinks,
    isServiceGalleryExpanded,
    selectedLocation,
    selectedStore,
    serviceHeroModel
  ]);
  const {
    servicesBodyFont,
    servicesDisplayFont,
    servicesPrimary,
    servicesPrimaryDark,
    servicesTaglineColor,
    servicesRatingColor,
    servicesPrimaryShadow,
    servicesPrimarySoft
  } = useMemo(() => deriveServicesHeroTheme(modeAdapter?.heroTheme), [modeAdapter?.heroTheme]);
  const servicesResponsiveLayout = useMemo(() => getServicesResponsiveLayout(viewportWidth), [viewportWidth]);
  const servicesFollowerCount = Math.max(0, Number(followState?.followersCount || 0));
  const servicesFollowersLabel = `${formatServiceNumber(servicesFollowerCount)} ${servicesFollowerCount === 1 ? 'follower' : 'followers'}`;
  const storefrontSlug = selectedStore?.slug || '';
  const storefrontShareUrl = useMemo(() => {
    if (!storefrontSlug) return '';
    return buildPublicStorefrontUrl(storefrontSlug);
  }, [storefrontSlug]);

  return (
    <section style={{ marginBottom: 40 }}>
      <SharedStorefrontHeaderNav
        isMobileViewport={isMobileViewport}
        bodyFont={servicesBodyFont}
        onBack={goDiscovery}
        onShop={() => document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        onTrack={openTrackPanel}
        onAccount={openAccountPanel}
        onRegisterBusiness={onRegisterBusiness}
        activeOrderCount={isStorefrontAccountAuthenticated ? activeCustomerOrderCount : 0}
        isAuthenticated={isStorefrontAccountAuthenticated}
        accountName={accountIdentityName}
        accountEmail={accountIdentityRawEmail || accountIdentityContact}
        accountInitials={accountIdentityInitials}
        storefrontName={serviceHeroModel.name}
        storefrontModeLabel={serviceHeroModel.modeLabel}
        storefrontLogoUrl={serviceHeroModel.profileImageUrl}
        storefrontSlug={selectedStore?.slug}
        hasMultipleBranches={hasMultipleStoreBranches}
        branchSelector={hasMultipleStoreBranches ? (
          isMobileViewport ? (
            <StorefrontDropdown
              value={selectedLocationId ?? ''}
              onChange={handleBranchMenuSelection}
              options={storeLocations.map((location) => ({
                value: location.location_id,
                label: location.name || location.address_line || `Branch ${location.location_id}`
              }))}
              triggerStyle={MOBILE_NATIVE_SELECT_STYLE}
              containerStyle={{ minWidth: 0 }}
              menuStyle={MOBILE_DROPDOWN_MENU_STYLE}
              optionStyle={MOBILE_DROPDOWN_OPTION_STYLE}
              selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
            />
          ) : (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: servicesBodyFont, minWidth: 0, maxWidth: 236, flex: '0 1 236px' }}>
              <MapPin size={16} />
              {!hasSelectedBranchFromMenu && <span>Branch:</span>}
              <StorefrontDropdown
                value={selectedLocationId ?? ''}
                onChange={handleBranchMenuSelection}
                options={storeLocations.map((location) => ({
                  value: location.location_id,
                  label: location.name || location.address_line || `Branch ${location.location_id}`
                }))}
                triggerStyle={{
                  minHeight: 34,
                  border: 'none',
                  background: 'transparent',
                  boxShadow: 'none',
                  padding: '4px 34px 4px 2px',
                  fontFamily: servicesBodyFont
                }}
                containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
                menuPlacement="bottom-end"
                menuStyle={{ minWidth: 320, width: 'max-content', maxWidth: 'min(420px, calc(100vw - 32px))', padding: 10 }}
                optionStyle={{ padding: '12px 18px', fontFamily: servicesBodyFont }}
                selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
              />
            </label>
          )
        ) : null}
        accountStoreSwitcher={hasMultipleAccountBranches ? (
          <StorefrontAccountBranchSwitcher
            branches={accountBranches}
            currentSlug={selectedStore?.slug}
            onSelectStore={goStore}
            compactLabel={isMobileViewport}
          />
        ) : null}
      />

      <StorefrontHeroShell
        fullBleed
        isMobileViewport={servicesResponsiveLayout.isMobileViewport}
        sectionStyle={{
          minHeight: servicesResponsiveLayout.isMobileViewport ? 190 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: serviceHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
            ? `url(${serviceHeroModel.coverImageUrl}) center/cover`
            : 'linear-gradient(135deg,#172033 0%,#22324b 50%,#40516c 100%)',
          // Keep the hero edge flush with the white storefront surface. The
          // profile image retains its own shadow, so removing this shell
          // shadow avoids a visible gray fade between the hero and catalog.
          boxShadow: 'none'
        }}
        backgroundChildren={
          <>
            {serviceHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
              <StorefrontResponsiveImage
                imageSources={serviceHeroModel.coverImageSources}
                alt=""
                loading="eager"
                fetchPriority="high"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => markBrandingImageError(`hero-cover:${selectedStore.slug}`)}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
          </>
        }
      >
        <SharedStorefrontShareQr
          storeUrl={storefrontShareUrl}
          isMobileViewport={servicesResponsiveLayout.isMobileViewport}
          accentColor={servicesPrimary}
          shareEnabled={shareEnabled}
        />
        {servicesResponsiveLayout.isMobileViewport && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge background={selectedStore?.storefront_open ? SERVICES_PALETTE.success : SERVICES_PALETTE.warning} color={SERVICES_PALETTE.surface} style={{ fontFamily: servicesBodyFont, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{serviceHeroModel.statusLabel}</Badge>
          </div>
        )}
        {!servicesResponsiveLayout.isMobileViewport && (
          <div style={{
            position: 'absolute',
            left: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            right: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            bottom: servicesResponsiveLayout.heroProfileBottomOffset,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: servicesResponsiveLayout.isTabletViewport ? 22 : 28,
            paddingLeft: servicesResponsiveLayout.heroContentPaddingLeft
          }}>
            <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: servicesResponsiveLayout.isTabletViewport ? 24 : 35 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge background={selectedStore?.storefront_open ? SERVICES_PALETTE.success : SERVICES_PALETTE.warning} color={SERVICES_PALETTE.surface} style={{ fontFamily: servicesBodyFont }}>{serviceHeroModel.statusLabel}</Badge>
                {serviceHeroModel.hours && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>{serviceHeroModel.hours}</span>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
                <SharedStorefrontHeroNameCluster
                  name={serviceHeroModel.name}
                  textColor="#fff"
                  fontSize={servicesResponsiveLayout.isTabletViewport ? 44 : 50}
                  fontFamily={servicesDisplayFont}
                  followEnabled={followEnabled}
                  followState={followState}
                  handleFollowAction={handleFollowAction}
                  followAccentColor={SERVICES_PALETTE.primary}
                  followActiveColor={SERVICES_PALETTE.success}
                />
                {serviceHeroModel.tagline ? (
                  <p style={{ margin: 0, color: servicesTaglineColor, fontSize: 20, fontWeight: 700, lineHeight: 1.3, fontFamily: servicesBodyFont }}>{serviceHeroModel.tagline}</p>
                ) : (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: servicesBodyFont }}>{modeAdapter.heroDescription}</p>
                )}
              </div>
              <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 400, opacity: 0.95, marginBottom: 6, fontFamily: servicesBodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Star size={16} fill={servicesRatingColor} color={servicesRatingColor} />{serviceHeroModel.ratingLabel}</span>
                <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span>
                {followEnabled && (
                  <>
                    <span style={{ flexShrink: 0 }}>{servicesFollowersLabel}</span>
                    <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span>
                  </>
                )}
                <span style={{ flexShrink: 0 }}>{serviceHeroModel.modeLabel}</span>
                <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><MapPin size={16} />{serviceHeroModel.locationLabel}</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              flexDirection: servicesResponsiveLayout.heroActionDirection,
              flexShrink: 0,
              marginLeft: 'auto',
              marginBottom: servicesResponsiveLayout.isTabletViewport ? 24 : 35
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {serviceHeroModel.actions?.canCall && (
                  <GhostButton onClick={() => openStorefrontActionLink(serviceHeroModel.actions?.callHref)} style={{ minWidth: 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: servicesBodyFont, fontWeight: 800 }}>
                    <Phone size={18} />
                    Call
                  </GhostButton>
                )}
                <PrimaryButton onClick={() => {
                  if (hasServiceCart) {
                    goStoreBookingPage();
                    return;
                  }
                  document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }} style={{ minWidth: 150, background: servicesPrimary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: `0 10px 25px ${servicesPrimaryShadow}`, border: 'none', fontWeight: 800, fontFamily: servicesBodyFont }}>
                  <MousePointer2 size={18} />
                  {hasServiceCart ? 'Continue Booking' : 'Order Now'}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}

        <div style={{
          position: 'absolute',
          left: servicesResponsiveLayout.isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: servicesResponsiveLayout.isMobileViewport ? '-45px' : `${servicesResponsiveLayout.heroProfileBottomOffset}px`,
          width: servicesResponsiveLayout.isMobileViewport ? 110 : servicesResponsiveLayout.heroProfileSize,
          height: servicesResponsiveLayout.isMobileViewport ? 110 : servicesResponsiveLayout.heroProfileSize,
          borderRadius: '50%',
          background: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {serviceHeroModel.profileImageUrl && !isBrandingImageBlocked(`hero-profile:${selectedStore.slug}`) ? (
            <StorefrontResponsiveImage
              imageSources={serviceHeroModel.profileImageSources}
              alt={`${serviceHeroModel.name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => markBrandingImageError(`hero-profile:${selectedStore.slug}`)}
            />
          ) : (
            <div style={{ fontSize: servicesResponsiveLayout.isMobileViewport ? 32 : servicesResponsiveLayout.isTabletViewport ? 58 : 66, fontWeight: 900, color: servicesPrimaryDark, fontFamily: servicesDisplayFont }}>{serviceHeroModel.name.charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{ display: servicesResponsiveLayout.isMobileViewport ? 'block' : 'none', background: '#fff' }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', minHeight: 38, marginLeft: 118, gap: 8, marginBottom: 12, marginRight: 2 }}>
              {serviceHeroModel.actions?.canMessage && (
                <GhostButton onClick={() => openStorefrontActionLink(serviceHeroModel.actions.messageHref)} style={{ flex: 1, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, fontFamily: servicesBodyFont, fontWeight: 600, fontSize: 13 }}>
                  <MessageSquare size={16} />
                  Message
                </GhostButton>
              )}
              {serviceHeroModel.actions?.canCall && (
                <PrimaryButton
                  onClick={() => openStorefrontActionLink(serviceHeroModel.actions.callHref)}
                  accentColor={servicesPrimary}
                  accentDarkColor={servicesPrimaryDark}
                  shadowColor={servicesPrimaryShadow}
                  style={{ flex: 1, background: servicesPrimary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, fontFamily: servicesBodyFont }}
                >
                  <Phone size={16} />
                  Call
                </PrimaryButton>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <SharedStorefrontHeroNameCluster
                name={serviceHeroModel.name}
                textColor="#0f172a"
                fontSize={24}
                fontFamily={servicesDisplayFont}
                followEnabled={followEnabled}
                followState={followState}
                handleFollowAction={handleFollowAction}
                followAccentColor={SERVICES_PALETTE.primary}
                followActiveColor={SERVICES_PALETTE.success}
              />

              {serviceHeroModel.tagline ? (
                <p style={{ margin: 0, color: servicesPrimary, fontSize: 14, fontWeight: 600, fontStyle: 'italic', fontFamily: servicesBodyFont }}>{serviceHeroModel.tagline}</p>
              ) : (
                <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.5, fontFamily: servicesBodyFont }}>{modeAdapter.heroDescription}</p>
              )}

              <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#475569', fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: servicesBodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Star size={14} fill={servicesRatingColor} color={servicesRatingColor} />{serviceHeroModel.ratingLabel}</span>
                <span style={{ opacity: 0.3, flexShrink: 0 }}>|</span>
                {followEnabled && (
                  <>
                    <span style={{ flexShrink: 0 }}>{servicesFollowersLabel}</span>
                    <span style={{ opacity: 0.3, flexShrink: 0 }}>|</span>
                  </>
                )}
                <span style={{ flexShrink: 0 }}>{serviceHeroModel.modeLabel}</span>
              </div>
            </div>
          </div>
        </div>
      <div style={{ display: servicesResponsiveLayout.isMobileViewport ? 'grid' : 'none' }}>
        <StorefrontBusinessInformationPanel
          isMobileViewport
          aboutText={aboutText}
          addressText={addressText}
          deliveryPlatformLinks={deliveryPlatformLinks}
          galleryImages={galleryImages}
          galleryImagesFull={galleryImages}
          galleryOverflowCount={Math.max(0, galleryImages.length - 1)}
          mapSelectedKey={serviceHeroModel.mapSelectedKey}
          mapStores={serviceHeroModel.mapStores}
          openStorefrontActionLink={openStorefrontActionLink}
          palette={{ accent: servicesPrimary, accentDark: servicesPrimaryDark, accentSoft: servicesPrimarySoft, bodyFont: servicesBodyFont, cardShadow: `0 8px 24px ${servicesPrimaryShadow}` }}
          selectedBranchLabel={selectedBranchLabel}
          storeName={serviceHeroModel.name || selectedStore?.tenant_name}
          storefrontCityLabel={storefrontCityLabel}
          visibleContactRows={visibleContactRows}
          visibleWhyChooseUs={visibleWhyChooseUs}
        />
      </div>
        {!servicesResponsiveLayout.isMobileViewport && (
          <StorefrontBusinessInformationPanel
            aboutText={aboutText}
            addressText={addressText}
            deliveryPlatformLinks={deliveryPlatformLinks}
            galleryImages={galleryImages}
            galleryImagesFull={galleryImages}
            galleryOverflowCount={Math.max(0, galleryImages.length - 4)}
            mapSelectedKey={serviceHeroModel.mapSelectedKey}
            mapStores={serviceHeroModel.mapStores}
            openStorefrontActionLink={openStorefrontActionLink}
            palette={{ accent: servicesPrimary, accentDark: servicesPrimaryDark, accentSoft: servicesPrimarySoft, bodyFont: servicesBodyFont, panelShadow: '0 18px 42px rgba(15, 23, 42, 0.07)' }}
            selectedBranchLabel={selectedBranchLabel}
            storeName={serviceHeroModel.name || selectedStore?.tenant_name}
            storefrontCityLabel={storefrontCityLabel}
            visibleContactRows={visibleContactRows}
            visibleWhyChooseUs={visibleWhyChooseUs}
          />
        )}
    </section>
  );
};

export { ServicesHero };
