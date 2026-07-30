import React from 'react';
import { Badge, GhostButton, PrimaryButton } from '../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontHeroShell } from '../../shared/components/StorefrontHeroShell.jsx';
import { DefaultStorefrontHero } from '../../shared/components/DefaultStorefrontHero.jsx';
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
import { ServicesHero } from '../../modes/services/storefront/components/ServicesHero.jsx';
import { FnbHero } from '../../modes/fnb/storefront/components/FnbHero.jsx';
import { SimpleHero } from '../../modes/simple/storefront/components/SimpleHero.jsx';
import HospitalityBookingPanel from '../../modes/hospitality/booking/components/HospitalityBookingPanel.jsx';

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
    viewportWidth,
    hasMultipleStoreBranches,
    hasSelectedBranchFromMenu,
    selectedLocationId,
    handleBranchMenuSelection,
    storeLocations,
    catalogSearch,
    setCatalogSearch,
    goDiscovery,
    goStore,
    hasServiceCart,
    goStoreBookingPage,
    cartCount,
    modeAdapter,
    isBrandingImageBlocked,
    markBrandingImageError,
    selectedLocation,
    isAboutExpanded,
    setIsAboutExpanded,
    isServiceGalleryExpanded,
    setIsServiceGalleryExpanded,
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

  return (
    <>
      {selectedStore && (
        <div style={{ position: 'absolute', left: -99999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
          {selectedStore.storefront_profile_image_url ? (
            <img alt={`${selectedStore.tenant_name} profile`} src={withAssetOrigin(selectedStore.storefront_profile_image_url)} />
          ) : null}
          {selectedStore.storefront_cover_image_url ? (
            <img alt={`${selectedStore.tenant_name} cover`} src={withAssetOrigin(selectedStore.storefront_cover_image_url)} />
          ) : null}
          <div>{`Tenant page: ${routeSlug}`}</div>
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Storefront items are not set up yet</div> : null}
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 ? <div>Customer checkout will be available once at least one storefront item is enabled.</div> : null}
          {Array.isArray(filteredCatalog) && filteredCatalog.length === 0 && hasCatalogSearchQuery ? <div>No items are available to search yet</div> : null}
        </div>
      )}
      {isServicesMode && !isBookingSubpage && !isServiceDetailsSubpage && selectedStore && serviceHeroModel && (
        <ServicesHero
            serviceHeroModel={serviceHeroModel}
            selectedStore={selectedStore}
            isMobileViewport={isMobileViewport}
            viewportWidth={viewportWidth}
            hasMultipleStoreBranches={hasMultipleStoreBranches}
          hasSelectedBranchFromMenu={hasSelectedBranchFromMenu}
          selectedLocationId={selectedLocationId}
          handleBranchMenuSelection={handleBranchMenuSelection}
          storeLocations={storeLocations}
          catalogSearch={catalogSearch}
          setCatalogSearch={setCatalogSearch}
          goDiscovery={goDiscovery}
          goStore={goStore}
          hasServiceCart={hasServiceCart}
          goStoreBookingPage={goStoreBookingPage}
          cartCount={cartCount}
          modeAdapter={modeAdapter}
          isBrandingImageBlocked={isBrandingImageBlocked}
          markBrandingImageError={markBrandingImageError}
          selectedLocation={selectedLocation}
          isAboutExpanded={isAboutExpanded}
          setIsAboutExpanded={setIsAboutExpanded}
            isServiceGalleryExpanded={isServiceGalleryExpanded}
            setIsServiceGalleryExpanded={setIsServiceGalleryExpanded}
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
            ui={{
              Badge,
              GhostButton,
              PrimaryButton,
              StorefrontExpandableBusinessHours,
              StorefrontHeroShell
            }}
            heroStyles={{
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
            }}
            helperFns={{
              buildVisibleStorefrontContactRows,
              getDeliveryPlatformLinks
            }}
          />
      )}
      {!isServicesMode && (
        <>
          {/* ZONE 1: Navigation & Header */}
          {!isFnbMode && !isSimpleMode && !isResolvedOrderSubpage && (
            <section style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <GhostButton onClick={goDiscovery} style={{ padding: '8px 16px', minHeight: 44, fontSize: 13 }}>
                Back to Discovery
              </GhostButton>
              <div style={{ color: STYLES.colors.muted, fontSize: 13, fontWeight: 700 }}>{routeSlug} {' / '} {selectedStore?.tenant_name}</div>
              <div style={{ position: 'absolute', left: -99999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                Tenant page: {routeSlug}
              </div>
            </section>
          )}

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
              heroStyles={{ HERO_CANVAS_MAX_WIDTH, MAX_STOREFRONT_WHY_CHOOSE_US, MOBILE_DROPDOWN_MENU_STYLE, MOBILE_DROPDOWN_OPTION_STYLE, MOBILE_NATIVE_SELECT_STYLE, STOREFRONT_CONTACT_INFO_COLUMNS, STOREFRONT_INFO_ICON_COLUMN, STOREFRONT_INFO_PANEL_MAX_WIDTH, STOREFRONT_INFO_ROW_GAP, STYLES }}
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
