import { useMemo, useState } from 'react';
import { MapPin, Star, UtensilsCrossed } from 'lucide-react';
import { StorefrontExpandedMapModal } from '../../../../discovery/components/StorefrontExpandedMapModal.jsx';
import { buildFnbHeroViewModel } from '../model/buildFnbHeroViewModel.js';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from '../../../../Components/storefront/hero/StorefrontHeaderNav.jsx';
import { FnbHeroDesktopAboutGallery } from './FnbHeroDesktopAboutGallery.jsx';
import { FnbHeroDesktopContactLocation } from './FnbHeroDesktopContactLocation.jsx';
import { FnbHeroDesktopWhyChooseUs } from './FnbHeroDesktopWhyChooseUs.jsx';
import { FnbHeroBranchSelector } from './FnbHeroBranchSelector.jsx';
import { FnbHeroBrandingSection } from './FnbHeroBrandingSection.jsx';
import { FnbHeroMobileInfoCards } from './FnbHeroMobileInfoCards.jsx';
import { FnbHeroMobileOverview } from './FnbHeroMobileOverview.jsx';
export const FnbHero = ({
  modeAdapter,
  heroSectionModel,
  fnbViewModel,
  selectedStore,
  isMobileViewport,
  cartCount,
  setIsCheckoutOpen,
  goDiscovery,
  hasMultipleStoreBranches,
  hasSelectedBranchFromMenu,
  selectedLocationId,
  handleBranchMenuSelection,
  storeLocations,
  isBrandingImageBlocked,
  markBrandingImageError,
  selectedLocation,
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
  heroStyles
}) => {
  const { StorefrontExpandableBusinessHours } = ui;
  const { HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_PANEL_MAX_WIDTH, STOREFRONT_INFO_ROW_GAP, STYLES } = heroStyles;
  const [isExpandedMapOpen, setIsExpandedMapOpen] = useState(false);
  const heroTheme = modeAdapter.heroTheme || {};
  const heroViewModel = useMemo(() => buildFnbHeroViewModel({
    cartCount,
    fnbViewModel,
    followEnabled,
    followersCount: followState?.followersCount,
    heroSectionModel,
    maxWhyChooseUs: MAX_STOREFRONT_WHY_CHOOSE_US,
    selectedLocation,
    selectedLocationId,
    selectedStore,
    storeLocations
  }), [cartCount, fnbViewModel, followEnabled, followState?.followersCount, heroSectionModel, MAX_STOREFRONT_WHY_CHOOSE_US, selectedLocation, selectedLocationId, selectedStore, storeLocations]);
  const {
    aboutText,
    addressText,
    deliveryPlatformLinks,
    desktopColumns,
    displayHours,
    followersLabel,
    galleryImages,
    hasAboutOrGallerySection,
    hasAboutSection,
    hasAboutToggle,
    hasContactRows,
    hasGallerySection,
    hasMapData,
    hasMobileStoreDetailsSummary,
    hasWhyChooseUs,
    mapSelectedKey,
    mapStores,
    orderLabel,
    profileImageKey,
    selectedBranchLabel,
    storefrontCityLabel,
    storefrontShareUrl,
    visibleContactRows,
    visibleWhyChooseUs
  } = heroViewModel;
  const desktopHeroMetaItems = [
    heroSectionModel.ratingLabel ? (
      <span key="rating" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <Star size={16} fill="#fbbf24" color="#fbbf24" />
        {heroSectionModel.ratingLabel}
      </span>
    ) : null,
    followEnabled ? <span key="followers" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{followersLabel}</span> : null,
    heroSectionModel.modeLabel ? <span key="mode" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{heroSectionModel.modeLabel}</span> : null,
    selectedBranchLabel ? (
      <span key="location" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <MapPin size={16} />
        {selectedBranchLabel}
      </span>
    ) : null
  ].filter(Boolean);
  const mobileHeroMetaItems = [
    heroSectionModel.ratingLabel ? (
      <span key="rating" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <Star size={14} fill="#fbbf24" color="#fbbf24" />
        {heroSectionModel.ratingLabel}
      </span>
    ) : null,
    followEnabled ? <span key="followers" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{followersLabel}</span> : null,
    heroSectionModel.modeLabel ? (
      <span key="mode" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <UtensilsCrossed size={14} />
        {heroSectionModel.modeLabel}
      </span>
    ) : null
  ].filter(Boolean);
  return (
    <section style={{ marginBottom: 40 }}>
      <SharedStorefrontHeaderNav
        isMobileViewport={isMobileViewport}
        bodyFont={heroTheme.bodyFont}
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
        storefrontName={heroSectionModel.name}
        storefrontModeLabel={heroSectionModel.modeLabel}
        storefrontLogoUrl={heroSectionModel.profileImageUrl}
        storefrontSlug={selectedStore?.slug}
        hasMultipleBranches={hasMultipleStoreBranches}
        branchSelector={hasMultipleStoreBranches ? (
          <FnbHeroBranchSelector
            bodyFont={heroTheme.bodyFont}
            hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
            isMobileViewport={isMobileViewport}
            mobileDropdownMenuStyle={MOBILE_DROPDOWN_MENU_STYLE}
            mobileDropdownOptionStyle={MOBILE_DROPDOWN_OPTION_STYLE}
            mobileNativeSelectStyle={MOBILE_NATIVE_SELECT_STYLE}
            onChange={handleBranchMenuSelection}
            selectedLocationId={selectedLocationId}
            storeLocations={storeLocations}
            textColor={STYLES.colors.dark}
          />
        ) : null}
      />

      <FnbHeroBrandingSection
        cartCount={cartCount}
        desktopHeroMetaItems={desktopHeroMetaItems}
        fnbViewModel={fnbViewModel}
        followEnabled={followEnabled}
        followState={followState}
        handleFollowAction={handleFollowAction}
        heroSectionModel={{ ...heroSectionModel, orderLabel }}
        heroTheme={heroTheme}
        HERO_CANVAS_MAX_WIDTH={HERO_CANVAS_MAX_WIDTH}
        isBrandingImageBlocked={isBrandingImageBlocked}
        isMobileViewport={isMobileViewport}
        markBrandingImageError={markBrandingImageError}
        modeAdapter={modeAdapter}
        onBrowseMenu={() => {
          if (cartCount > 0) {
            setIsCheckoutOpen(true);
            return;
          }
          document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        openStorefrontActionLink={openStorefrontActionLink}
        profileImageKey={profileImageKey}
        selectedStore={selectedStore}
        shareEnabled={shareEnabled}
        storefrontShareUrl={storefrontShareUrl}
        STYLES={STYLES}
      />
      {isMobileViewport && (
        <>
          <FnbHeroMobileOverview
            followEnabled={followEnabled}
            followState={followState}
            handleFollowAction={handleFollowAction}
            heroSectionModel={heroSectionModel}
            heroTheme={heroTheme}
            mobileHeroMetaItems={mobileHeroMetaItems}
            modeAdapter={modeAdapter}
            openStorefrontActionLink={openStorefrontActionLink}
          />
          <FnbHeroMobileInfoCards
            aboutText={aboutText}
            addressText={addressText}
            deliveryPlatformLinks={deliveryPlatformLinks}
            displayHours={displayHours}
            galleryImages={galleryImages}
            hasAboutSection={hasAboutSection}
            hasAboutToggle={hasAboutToggle}
            hasContactRows={hasContactRows}
            hasGallerySection={hasGallerySection}
            hasMapData={hasMapData}
            hasMobileStoreDetailsSummary={hasMobileStoreDetailsSummary}
            hasWhyChooseUs={hasWhyChooseUs}
            heroSectionModel={heroSectionModel}
            heroTheme={heroTheme}
            mapSelectedKey={mapSelectedKey}
            mapStores={mapStores}
            openStorefrontActionLink={openStorefrontActionLink}
            selectedBranchLabel={selectedBranchLabel}
            setIsExpandedMapOpen={setIsExpandedMapOpen}
            storefrontCityLabel={storefrontCityLabel}
            visibleContactRows={visibleContactRows}
            visibleWhyChooseUs={visibleWhyChooseUs}
          />
        </>
      )}
      {!isMobileViewport && (
        <div style={{
          maxWidth: STOREFRONT_INFO_PANEL_MAX_WIDTH,
          margin: '64px auto 36px',
          padding: 24,
          background: '#ffffff',
          border: '1px solid #e8edf3',
          borderRadius: 24,
          boxShadow: '0 18px 42px rgba(15, 23, 42, 0.07)',
          display: 'grid',
          gridTemplateColumns: desktopColumns,
          gap: 24
        }}>
          {hasAboutOrGallerySection && (
            <FnbHeroDesktopAboutGallery
              STYLES={STYLES}
              aboutText={aboutText}
              galleryImages={galleryImages}
              hasAboutSection={hasAboutSection}
              hasAboutToggle={hasAboutToggle}
              hasGallerySection={hasGallerySection}
              heroTheme={heroTheme}
            />
          )}

          <FnbHeroDesktopContactLocation
            STYLES={STYLES}
            STOREFRONT_CONTACT_INFO_COLUMNS={STOREFRONT_CONTACT_INFO_COLUMNS}
            STOREFRONT_INFO_ICON_COLUMN={STOREFRONT_INFO_ICON_COLUMN}
            STOREFRONT_INFO_ROW_GAP={STOREFRONT_INFO_ROW_GAP}
            StorefrontExpandableBusinessHours={StorefrontExpandableBusinessHours}
            deliveryPlatformLinks={deliveryPlatformLinks}
            hasAboutOrGallerySection={hasAboutOrGallerySection}
            hasContactRows={hasContactRows}
            hasMapData={hasMapData}
            heroTheme={heroTheme}
            mapSelectedKey={mapSelectedKey}
            mapStores={mapStores}
            openStorefrontActionLink={openStorefrontActionLink}
            setIsExpandedMapOpen={setIsExpandedMapOpen}
            visibleContactRows={visibleContactRows}
          />

          {hasWhyChooseUs && (
            <FnbHeroDesktopWhyChooseUs
              STYLES={STYLES}
              heroTheme={heroTheme}
              visibleWhyChooseUs={visibleWhyChooseUs}
            />
          )}

        </div>
      )}

      <StorefrontExpandedMapModal
        open={isExpandedMapOpen}
        onClose={() => setIsExpandedMapOpen(false)}
        title={`${heroSectionModel.name || selectedStore?.tenant_name || 'Store'} Map`}
        subtitle="View the store location in a larger map."
        stores={mapStores}
        selectedKey={mapSelectedKey}
      />
    </section>
  );
};


