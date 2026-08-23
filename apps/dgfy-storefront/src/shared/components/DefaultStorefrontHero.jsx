import React, { useMemo, useState } from 'react';
import { MapPin, Star } from 'lucide-react';
import { StorefrontExpandedMapModal } from '../../discovery/components/StorefrontExpandedMapModal.jsx';
import { buildFnbHeroViewModel } from '../../modes/fnb/storefront/model/buildFnbHeroViewModel.js';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from './storefront/hero/StorefrontHeaderNav.jsx';
import { FnbHeroBranchSelector } from '../../modes/fnb/storefront/components/FnbHeroBranchSelector.jsx';
import { FnbHeroBrandingSection } from '../../modes/fnb/storefront/components/FnbHeroBrandingSection.jsx';
import { FnbHeroDesktopAboutGallery } from '../../modes/fnb/storefront/components/FnbHeroDesktopAboutGallery.jsx';
import { FnbHeroDesktopContactLocation } from '../../modes/fnb/storefront/components/FnbHeroDesktopContactLocation.jsx';
import { FnbHeroDesktopWhyChooseUs } from '../../modes/fnb/storefront/components/FnbHeroDesktopWhyChooseUs.jsx';
import { FnbHeroMobileInfoCards } from '../../modes/fnb/storefront/components/FnbHeroMobileInfoCards.jsx';
import { FnbHeroMobileOverview } from '../../modes/fnb/storefront/components/FnbHeroMobileOverview.jsx';
import { StorefrontAccountBranchSwitcher } from './storefront/hero/StorefrontAccountBranchSwitcher.jsx';
import { useStorefrontAccountBranches } from '../hooks/useStorefrontAccountBranches.js';

// Every non-fnb/services/simple industry (hospitality, healthcare, retail,
// food_manufacturing, ticketing_transport, logistics_distribution,
// education_institutions, ...) renders through this component. It intentionally
// reuses FnbHero's own building blocks with mode-owned theme tokens so the
// header/hero-band/gallery/contact+map/why-choose-us structure stays consistent
// without leaking F&B colors into other industries. Each industry's product/menu catalog (Zone 4,
// rendered separately by StorefrontCatalogRouteContainer) is completely untouched.
// `buildFnbHeroViewModel` is a pure data-shaping function, not F&B-specific in what
// it reads — the "Fnb" prefix is only a historical naming artifact from where it was
// first built; a placeholder `fnbViewModel={{}}` disables the one truly F&B-specific
// bit it renders (the "Starts at ₱X" badge), which has no equivalent for other modes.
const EMPTY_FNB_VIEW_MODEL = Object.freeze({});

const DefaultStorefrontHero = ({
  modeAdapter,
  heroSectionModel,
  selectedStore,
  isMobileViewport,
  cartCount,
  setIsCheckoutOpen,
  primaryActionLabel,
  onPrimaryAction,
  goDiscovery,
  goStore,
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
  const isRetailTheme = Boolean(heroTheme.palette?.retailHighlight);
  const retailPageBackground = heroTheme.palette?.pageBackground || '#F8FAFC';
  const { accountBranches, hasMultipleAccountBranches } = useStorefrontAccountBranches({
    isStorefrontAccountAuthenticated,
    selectedStore
  });
  const heroViewModel = useMemo(() => buildFnbHeroViewModel({
    cartCount,
    fnbViewModel: EMPTY_FNB_VIEW_MODEL,
    followEnabled,
    followersCount: followState?.followersCount,
    heroSectionModel,
    maxWhyChooseUs: MAX_STOREFRONT_WHY_CHOOSE_US,
    selectedLocation,
    selectedLocationId,
    selectedStore,
    storeLocations
  }), [cartCount, followEnabled, followState?.followersCount, heroSectionModel, MAX_STOREFRONT_WHY_CHOOSE_US, selectedLocation, selectedLocationId, selectedStore, storeLocations]);
  const {
    aboutText,
    addressText,
    deliveryPlatformLinks,
    desktopColumns,
    displayHours,
    followersLabel,
    galleryImages,
    galleryImagesFull,
    galleryOverflowCount,
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
  const resolvedPrimaryActionLabel = primaryActionLabel || orderLabel;
  const handlePrimaryAction = () => {
    if (typeof onPrimaryAction === 'function') {
      onPrimaryAction();
      return;
    }
    if (cartCount > 0) {
      setIsCheckoutOpen(true);
      return;
    }
    document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
    heroSectionModel.modeLabel ? <span key="mode" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{heroSectionModel.modeLabel}</span> : null
  ].filter(Boolean);

  return (
    <section style={{ marginBottom: 40, background: isRetailTheme ? retailPageBackground : undefined }}>
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
        accountStoreSwitcher={hasMultipleAccountBranches ? (
          <StorefrontAccountBranchSwitcher
            branches={accountBranches}
            currentSlug={selectedStore?.slug}
            onSelectStore={goStore}
            compactLabel={isMobileViewport}
          />
        ) : null}
      />

      <FnbHeroBrandingSection
        cartCount={cartCount}
        desktopHeroMetaItems={desktopHeroMetaItems}
        fnbViewModel={EMPTY_FNB_VIEW_MODEL}
        followEnabled={followEnabled}
        followState={followState}
        handleFollowAction={handleFollowAction}
        heroSectionModel={{ ...heroSectionModel, orderLabel: resolvedPrimaryActionLabel }}
        heroTheme={heroTheme}
        HERO_CANVAS_MAX_WIDTH={HERO_CANVAS_MAX_WIDTH}
        isBrandingImageBlocked={isBrandingImageBlocked}
        isMobileViewport={isMobileViewport}
        markBrandingImageError={markBrandingImageError}
        modeAdapter={modeAdapter}
        onBrowseMenu={handlePrimaryAction}
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
            modeAdapter={modeAdapter}
            mobileHeroMetaItems={mobileHeroMetaItems}
            openStorefrontActionLink={openStorefrontActionLink}
          />
          <FnbHeroMobileInfoCards
            aboutText={aboutText}
            addressText={addressText}
            deliveryPlatformLinks={deliveryPlatformLinks}
            displayHours={displayHours}
            galleryImages={galleryImages}
            galleryImagesFull={galleryImagesFull}
            galleryOverflowCount={galleryOverflowCount}
            hasAboutSection={hasAboutSection}
            hasAboutToggle={hasAboutToggle}
            hasContactRows={hasContactRows}
            hasGallerySection={hasGallerySection}
            hasMapData={hasMapData}
            hasMobileStoreDetailsSummary={hasMobileStoreDetailsSummary}
            hasWhyChooseUs={hasWhyChooseUs}
            heroSectionModel={heroSectionModel}
            heroTheme={heroTheme}
            modeAdapter={modeAdapter}
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
          border: `1px solid ${isRetailTheme ? (heroTheme.palette?.secondary || '#A9DCE8') : '#e8edf3'}`,
          borderRadius: 24,
          boxShadow: isRetailTheme ? '0 6px 18px rgba(26,78,141,0.05)' : '0 18px 42px rgba(15, 23, 42, 0.07)',
          display: 'grid',
          gridTemplateColumns: desktopColumns,
          gap: 24
        }}>
          {hasAboutOrGallerySection && (
            <FnbHeroDesktopAboutGallery
              STYLES={STYLES}
              aboutText={aboutText}
              galleryImages={galleryImages}
              galleryImagesFull={galleryImagesFull}
              galleryOverflowCount={galleryOverflowCount}
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

export { DefaultStorefrontHero };
