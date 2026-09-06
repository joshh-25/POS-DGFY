import React, { useMemo } from 'react';
import { MapPin, Star } from 'lucide-react';
import { buildFnbHeroViewModel } from '../../modes/fnb/storefront/model/buildFnbHeroViewModel.js';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from './storefront/hero/StorefrontHeaderNav.jsx';
import { FnbHeroBranchSelector } from '../../modes/fnb/storefront/components/FnbHeroBranchSelector.jsx';
import { FnbHeroBrandingSection } from '../../modes/fnb/storefront/components/FnbHeroBrandingSection.jsx';
import { FnbHeroMobileOverview } from '../../modes/fnb/storefront/components/FnbHeroMobileOverview.jsx';
import { StorefrontAccountBranchSwitcher } from './storefront/hero/StorefrontAccountBranchSwitcher.jsx';
import { useStorefrontAccountBranches } from '../hooks/useStorefrontAccountBranches.js';
import { StorefrontBusinessInformationPanel } from './storefront/StorefrontBusinessInformationPanel.jsx';

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
  isServicesStorefront = false,
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
  heroStyles
}) => {
  const { HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STYLES } = heroStyles;
  const heroTheme = modeAdapter.heroTheme || {};
  const isRetailTheme = Boolean(heroTheme.palette?.retailHighlight);
  const retailPageBackground = heroTheme.palette?.pageBackground || '#F8FAFC';
  const heroRatingColor = isServicesStorefront
    ? (heroTheme.ratingColor || heroTheme.accent)
    : '#fbbf24';
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
    followersLabel,
    galleryImages,
    galleryImagesFull,
    galleryOverflowCount,
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
        <Star size={16} fill={heroRatingColor} color={heroRatingColor} />
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
        <Star size={14} fill={heroRatingColor} color={heroRatingColor} />
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
        heroShadow={isServicesStorefront ? 'none' : STYLES.shadow.lg}
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
          <StorefrontBusinessInformationPanel
            isMobileViewport
            aboutText={aboutText}
            addressText={addressText}
            deliveryPlatformLinks={deliveryPlatformLinks}
            galleryImages={galleryImages}
            galleryImagesFull={galleryImagesFull}
            galleryOverflowCount={galleryOverflowCount}
            mapSelectedKey={mapSelectedKey}
            mapStores={mapStores}
            openStorefrontActionLink={openStorefrontActionLink}
            palette={heroTheme}
            selectedBranchLabel={selectedBranchLabel}
            storeName={heroSectionModel.name || selectedStore?.tenant_name}
            storefrontCityLabel={storefrontCityLabel}
            visibleContactRows={visibleContactRows}
            visibleWhyChooseUs={visibleWhyChooseUs}
          />
        </>
      )}
      {!isMobileViewport && (
        <StorefrontBusinessInformationPanel
          aboutText={aboutText}
          addressText={addressText}
          deliveryPlatformLinks={deliveryPlatformLinks}
          galleryImages={galleryImages}
          galleryImagesFull={galleryImagesFull}
          galleryOverflowCount={galleryOverflowCount}
          mapSelectedKey={mapSelectedKey}
          mapStores={mapStores}
          openStorefrontActionLink={openStorefrontActionLink}
          palette={{ ...heroTheme, panelBorder: isRetailTheme ? (heroTheme.palette?.secondary || '#A9DCE8') : undefined, panelShadow: isRetailTheme ? '0 6px 18px rgba(26,78,141,0.05)' : undefined }}
          selectedBranchLabel={selectedBranchLabel}
          storeName={heroSectionModel.name || selectedStore?.tenant_name}
          storefrontCityLabel={storefrontCityLabel}
          visibleContactRows={visibleContactRows}
          visibleWhyChooseUs={visibleWhyChooseUs}
        />
      )}
    </section>
  );
};

export { DefaultStorefrontHero };
