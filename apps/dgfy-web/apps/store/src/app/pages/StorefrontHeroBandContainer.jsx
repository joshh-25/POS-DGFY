import React, { useMemo } from 'react';
import { Badge, GhostButton, PrimaryButton } from '../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontHeroShell } from '../../shared/components/StorefrontHeroShell.jsx';
import { DefaultStorefrontHero } from '../../shared/components/DefaultStorefrontHeroLazy.jsx';
import { buildVisibleStorefrontContactRows } from '../../shared/utils/storefrontContactPresentation.js';
import { StorefrontExpandableBusinessHours } from '../../features/shared-storefront/components/StorefrontExpandableBusinessHours.jsx';
import { getDeliveryPlatformLinks } from '../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import {
  HERO_CANVAS_MAX_WIDTH,
  MAX_STOREFRONT_WHY_CHOOSE_US,
  MOBILE_DROPDOWN_MENU_STYLE,
  MOBILE_DROPDOWN_OPTION_STYLE,
  MOBILE_NATIVE_SELECT_STYLE,
  STOREFRONT_CONTACT_INFO_COLUMNS,
  STOREFRONT_INFO_ICON_COLUMN,
  STOREFRONT_INFO_PANEL_MAX_WIDTH,
  STOREFRONT_INFO_ROW_GAP,
  STYLES
} from '../../shared/theme/storefrontStyleTokens.js';
import { ServicesHero } from '../../modes/services/storefront/components/ServicesHeroLazy.jsx';
import { FnbHero } from '../../modes/fnb/storefront/components/FnbHeroLazy.jsx';
import { SimpleHero } from '../../modes/simple/storefront/components/SimpleHeroLazy.jsx';
import HospitalityBookingPanel from '../../modes/hospitality/booking/components/HospitalityBookingPanelLazy.jsx';
import { buildServicesRetailHeroSectionModel } from '../../modes/services/storefront/model/servicesHeroPresentation.js';

// ZONE 1-3: Navigation & Header / Hero Branding / Location Map Snapshot + hospitality booking
// panel — cross-mode composition (services/fnb/simple/hospitality/shared/discovery). Moved
// verbatim out of StorefrontApp.jsx's `{isStorePage && (<>...</>)}` fragment, immediately before
// the ZONE 4 catalog dispatcher. The shell keeps the `isStorePage` guard and renders this
// container for the body only. See app/hooks/useStorefrontHeroBandProps.js for the props bundle.
export function StorefrontHeroBandContainer(props) {
  const {
    selectedStore,
    withAssetOrigin,
    routeSlug,
    filteredCatalog,
    hasCatalogSearchQuery,
    isServicesMode,
    isBookingSubpage,
    isServiceDetailsSubpage,
    serviceHeroModel,
    isMobileViewport,
    hasMultipleStoreBranches,
    hasSelectedBranchFromMenu,
    selectedLocationId,
    handleBranchMenuSelection,
    storeLocations,
    catalogSearch,
    setCatalogSearch,
    goDiscovery,
    goStore,
    goStoreCatalogPage,
    cartCount,
    modeAdapter,
    isBrandingImageBlocked,
    markBrandingImageError,
    selectedLocation,
    openStorefrontActionLink,
    openTrackPanel,
    openStorefrontHeaderAccount,
    openBusinessRegistrationFlow,
    isStorefrontAccountAuthenticated,
    activeCustomerOrderCount,
    accountIdentityName,
    accountIdentityRawEmail,
    accountIdentityContact,
    accountIdentityInitials,
    followUiEnabledForStore,
    shareEnabledForStore,
    followState,
    handleFollowAction,
    isFnbMode,
    isSimpleMode,
    isRetailMode,
    isOrderSubpage,
    isFnbDetailsSubpage,
    heroSectionModel,
    fnbViewModel,
    setIsCheckoutOpen,
    handleShareAction,
    isResolvedOrderSubpage,
    simpleStorefrontModel,
    isHospitalityMode
  } = props;
  const servicesRetailHeroSectionModel = useMemo(() => (
    isServicesMode
      ? buildServicesRetailHeroSectionModel({ heroSectionModel, serviceHeroModel })
      : null
  ), [heroSectionModel, isServicesMode, serviceHeroModel]);

  return (
    <>
      {selectedStore && (
        <div style={{ position: 'absolute', left: -99999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          {/* Issue #282, Phase D: off-screen SEO/a11y duplicate of images the
              visible hero already renders -- lazy so it never competes with
              the real hero cover for bandwidth on initial load. */}
          {selectedStore.storefront_profile_image_url ? (
            <img alt={`${selectedStore.tenant_name} profile`} src={withAssetOrigin(selectedStore.storefront_profile_image_url)} loading="lazy" decoding="async" />
          ) : null}
          {selectedStore.storefront_cover_image_url ? (
            <img alt={`${selectedStore.tenant_name} cover`} src={withAssetOrigin(selectedStore.storefront_cover_image_url)} loading="lazy" decoding="async" />
          ) : null}
          <div>{`Tenant page: ${routeSlug}`}</div>
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Storefront items are not set up yet</div> : null}
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Customer checkout will be available once at least one storefront item is enabled.</div> : null}
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 && hasCatalogSearchQuery ? <div>No items are available to search yet</div> : null}
        </div>
      )}
      {isServicesMode && !isBookingSubpage && !isServiceDetailsSubpage && selectedStore && serviceHeroModel && (
        <DefaultStorefrontHero
          modeAdapter={modeAdapter}
          heroSectionModel={servicesRetailHeroSectionModel}
          selectedStore={selectedStore}
          isMobileViewport={isMobileViewport}
          cartCount={0}
          setIsCheckoutOpen={setIsCheckoutOpen}
          primaryActionLabel="Browse Services"
          onPrimaryAction={() => {
            goStoreCatalogPage();
            window.requestAnimationFrame(() => {
              document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }}
          goDiscovery={goDiscovery}
          goStore={goStore}
          hasMultipleStoreBranches={hasMultipleStoreBranches}
          hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
          selectedLocationId={selectedLocationId}
          handleBranchMenuSelection={handleBranchMenuSelection}
          storeLocations={storeLocations}
          isBrandingImageBlocked={isBrandingImageBlocked}
          markBrandingImageError={markBrandingImageError}
          selectedLocation={selectedLocation}
          openStorefrontActionLink={openStorefrontActionLink}
          openTrackPanel={openTrackPanel}
          openAccountPanel={openStorefrontHeaderAccount}
          onRegisterBusiness={openBusinessRegistrationFlow}
          isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
          activeCustomerOrderCount={activeCustomerOrderCount}
          accountIdentityName={accountIdentityName}
          accountIdentityRawEmail={accountIdentityRawEmail}
          accountIdentityContact={accountIdentityContact}
          accountIdentityInitials={accountIdentityInitials}
          followEnabled={followUiEnabledForStore}
          shareEnabled={shareEnabledForStore}
          followState={followState}
          handleFollowAction={handleFollowAction}
          ui={{ StorefrontExpandableBusinessHours }}
          heroStyles={{
            HERO_CANVAS_MAX_WIDTH,
            MAX_STOREFRONT_WHY_CHOOSE_US,
            MOBILE_DROPDOWN_MENU_STYLE,
            MOBILE_DROPDOWN_OPTION_STYLE,
            MOBILE_NATIVE_SELECT_STYLE,
            STOREFRONT_CONTACT_INFO_COLUMNS,
            STOREFRONT_INFO_ICON_COLUMN,
            STOREFRONT_INFO_ROW_GAP,
            STYLES
          }}
        />
      )}
      {!isServicesMode && (
        <>

          {/* ZONE 2: Hero Branding */}
          {isFnbMode && !isOrderSubpage && !isFnbDetailsSubpage ? (
            <FnbHero
              modeAdapter={modeAdapter}
              heroSectionModel={heroSectionModel}
              fnbViewModel={fnbViewModel}
              selectedStore={selectedStore}
              isMobileViewport={isMobileViewport}
              cartCount={cartCount}
              setIsCheckoutOpen={setIsCheckoutOpen}
              goDiscovery={goDiscovery}
              goStore={goStore}
              hasMultipleStoreBranches={hasMultipleStoreBranches}
              hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
              selectedLocationId={selectedLocationId}
              handleBranchMenuSelection={handleBranchMenuSelection}
              storeLocations={storeLocations}
              catalogSearch={catalogSearch}
              setCatalogSearch={setCatalogSearch}
            isBrandingImageBlocked={isBrandingImageBlocked}
            markBrandingImageError={markBrandingImageError}
            selectedLocation={selectedLocation}
              openStorefrontActionLink={openStorefrontActionLink}
              openTrackPanel={openTrackPanel}
              openAccountPanel={openStorefrontHeaderAccount}
              onRegisterBusiness={openBusinessRegistrationFlow}
              isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
              activeCustomerOrderCount={activeCustomerOrderCount}
              accountIdentityName={accountIdentityName}
              accountIdentityRawEmail={accountIdentityRawEmail}
              accountIdentityContact={accountIdentityContact}
              accountIdentityInitials={accountIdentityInitials}
              followEnabled={followUiEnabledForStore}
              shareEnabled={shareEnabledForStore}
              followState={followState}
              handleFollowAction={handleFollowAction}
              handleShareAction={handleShareAction}
              ui={{ StorefrontExpandableBusinessHours }}
              heroStyles={{ HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_ROW_GAP, STYLES }}
              helperFns={{ getDeliveryPlatformLinks }}
            />
          ) : isSimpleMode && !isResolvedOrderSubpage && simpleStorefrontModel ? (
            <SimpleHero
              simpleHeroModel={simpleStorefrontModel}
              selectedStore={selectedStore}
              isMobileViewport={isMobileViewport}
              hasMultipleStoreBranches={hasMultipleStoreBranches}
              hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
              selectedLocationId={selectedLocationId}
              handleBranchMenuSelection={handleBranchMenuSelection}
              storeLocations={storeLocations}
              catalogSearch={catalogSearch}
              setCatalogSearch={setCatalogSearch}
              goDiscovery={goDiscovery}
              goStore={goStore}
              cartCount={cartCount}
              setIsCheckoutOpen={setIsCheckoutOpen}
              modeAdapter={modeAdapter}
              isBrandingImageBlocked={isBrandingImageBlocked}
              markBrandingImageError={markBrandingImageError}
              selectedLocation={selectedLocation}
              openStorefrontActionLink={openStorefrontActionLink}
              openTrackPanel={openTrackPanel}
              openAccountPanel={openStorefrontHeaderAccount}
              onRegisterBusiness={openBusinessRegistrationFlow}
              isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
              activeCustomerOrderCount={activeCustomerOrderCount}
              accountIdentityName={accountIdentityName}
              accountIdentityRawEmail={accountIdentityRawEmail}
              accountIdentityContact={accountIdentityContact}
              accountIdentityInitials={accountIdentityInitials}
              followEnabled={followUiEnabledForStore}
              shareEnabled={shareEnabledForStore}
              followState={followState}
              handleFollowAction={handleFollowAction}
              handleShareAction={handleShareAction}
              ui={{ Badge, GhostButton, PrimaryButton, StorefrontExpandableBusinessHours, StorefrontHeroShell }}
              heroStyles={{ HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_PANEL_MAX_WIDTH, STOREFRONT_INFO_ROW_GAP, STYLES }}
              helperFns={{ buildVisibleStorefrontContactRows }}
            />
          ) : (!isFnbMode && !isSimpleMode && !isResolvedOrderSubpage) ? (
            <DefaultStorefrontHero
              modeAdapter={modeAdapter}
              heroSectionModel={heroSectionModel}
              selectedStore={selectedStore}
              isMobileViewport={isMobileViewport}
              cartCount={cartCount}
              setIsCheckoutOpen={setIsCheckoutOpen}
              goDiscovery={goDiscovery}
              goStore={goStore}
              hasMultipleStoreBranches={hasMultipleStoreBranches}
              hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
              selectedLocationId={selectedLocationId}
              handleBranchMenuSelection={handleBranchMenuSelection}
              storeLocations={storeLocations}
              isBrandingImageBlocked={isBrandingImageBlocked}
              markBrandingImageError={markBrandingImageError}
              selectedLocation={selectedLocation}
              openStorefrontActionLink={openStorefrontActionLink}
              openTrackPanel={openTrackPanel}
              openAccountPanel={openStorefrontHeaderAccount}
              onRegisterBusiness={openBusinessRegistrationFlow}
              isStorefrontAccountAuthenticated={isStorefrontAccountAuthenticated}
              activeCustomerOrderCount={activeCustomerOrderCount}
              accountIdentityName={accountIdentityName}
              accountIdentityRawEmail={accountIdentityRawEmail}
              accountIdentityContact={accountIdentityContact}
              accountIdentityInitials={accountIdentityInitials}
              followEnabled={followUiEnabledForStore}
              shareEnabled={shareEnabledForStore}
              followState={followState}
              handleFollowAction={handleFollowAction}
              ui={{ StorefrontExpandableBusinessHours }}
              heroStyles={{
                HERO_CANVAS_MAX_WIDTH,
                MAX_STOREFRONT_WHY_CHOOSE_US,
                MOBILE_DROPDOWN_MENU_STYLE,
                MOBILE_DROPDOWN_OPTION_STYLE,
                MOBILE_NATIVE_SELECT_STYLE,
                STOREFRONT_CONTACT_INFO_COLUMNS,
                STOREFRONT_INFO_ICON_COLUMN,
                // Retail's info panel (gallery/contact+map/why-choose-us card) should fill the
                // full content width like F&B's does, not the narrower centered card the other
                // default-like modes use — F&B's own heroStyles call (above) never passes this
                // constant, which is why F&B's card is already full-width.
                ...(isRetailMode ? {} : { STOREFRONT_INFO_PANEL_MAX_WIDTH }),
                STOREFRONT_INFO_ROW_GAP,
                STYLES
              }}
            />
          ) : null}
        </>
      )}

      {isHospitalityMode && selectedStore && (
        <section style={{ marginBottom: 24 }}>
          <HospitalityBookingPanel
            selectedStore={selectedStore}
            selectedLocationId={selectedLocationId}
            isMobileViewport={isMobileViewport}
          />
        </section>
      )}
    </>
  );
}
