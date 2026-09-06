import { useMemo } from 'react';
import { MapPin, Star, UtensilsCrossed } from 'lucide-react';
import { buildFnbHeroViewModel } from '../model/buildFnbHeroViewModel.js';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from '../../../../shared/components/storefront/hero/StorefrontHeaderNav.jsx';
import { FnbHeroBranchSelector } from './FnbHeroBranchSelector.jsx';
import { FnbHeroBrandingSection } from './FnbHeroBrandingSection.jsx';
import { FnbHeroMobileOverview } from './FnbHeroMobileOverview.jsx';
import { StorefrontAccountBranchSwitcher } from '../../../../shared/components/storefront/hero/StorefrontAccountBranchSwitcher.jsx';
import { useStorefrontAccountBranches } from '../../../../shared/hooks/useStorefrontAccountBranches.js';
import { StorefrontBusinessInformationPanel } from '../../../../shared/components/storefront/StorefrontBusinessInformationPanel.jsx';
export const FnbHero = ({
  modeAdapter,
  heroSectionModel,
  fnbViewModel,
  selectedStore,
  isMobileViewport,
  cartCount,
  setIsCheckoutOpen,
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
  const { accountBranches, hasMultipleAccountBranches } = useStorefrontAccountBranches({
    isStorefrontAccountAuthenticated,
    selectedStore
  });
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
          palette={heroTheme}
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
