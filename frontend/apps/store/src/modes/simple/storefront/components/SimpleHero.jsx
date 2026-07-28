import React, { useState } from 'react';
import {
  MapPin,
  MessageSquare,
  MousePointer2,
  Phone,
  Star
} from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { StorefrontExpandedMapModal } from '../../../../discovery/components/StorefrontExpandedMapModal.jsx';
import { StorefrontHeaderNav as SharedStorefrontHeaderNav } from '../../../../shared/components/storefront/hero/StorefrontHeaderNav.jsx';
import { StorefrontHeroNameCluster as SharedStorefrontHeroNameCluster } from '../../../../shared/components/storefront/hero/StorefrontHeroNameCluster.jsx';
import { StorefrontShareQr as SharedStorefrontShareQr } from '../../../../shared/components/storefront/hero/StorefrontShareQr.jsx';
import { buildStorefrontQrUrl } from '../../../../shared/utils/storefrontQrUrl.js';
import { SimpleHeroAbout } from './SimpleHeroAbout.jsx';
import { SimpleHeroContactLocation } from './SimpleHeroContactLocation.jsx';
import { SimpleHeroMobileInfoCards } from './SimpleHeroMobileInfoCards.jsx';
import { SimpleHeroWhyShopHere } from './SimpleHeroWhyShopHere.jsx';
import { StorefrontAccountBranchSwitcher } from '../../../../shared/components/storefront/hero/StorefrontAccountBranchSwitcher.jsx';
import { useStorefrontAccountBranches } from '../../../../shared/hooks/useStorefrontAccountBranches.js';

const SimpleHero = ({
  simpleHeroModel,
  selectedStore,
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
  cartCount,
  setIsCheckoutOpen,
  modeAdapter,
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
  followEnabled = false,
  shareEnabled = true,
  followState,
  handleFollowAction,
  ui,
  heroStyles,
  helperFns
}) => {
  const { Badge, GhostButton, PrimaryButton, StorefrontExpandableBusinessHours, StorefrontHeroShell } = ui;
  const { buildVisibleStorefrontContactRows } = helperFns;
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
    STOREFRONT_CONTACT_INFO_COLUMNS,
    STOREFRONT_INFO_ICON_COLUMN,
    STOREFRONT_INFO_PANEL_MAX_WIDTH,
    STOREFRONT_INFO_ROW_GAP,
    STYLES
  } = heroStyles;
  const [isExpandedMapOpen, setIsExpandedMapOpen] = useState(false);
  const heroTheme = modeAdapter.heroTheme || {};
  const selectedBranchLabel = String(selectedLocation?.name || simpleHeroModel.locationLabel || '').trim();
  const storefrontCityLabel = String(selectedLocation?.city || selectedStore?.city || '').trim();
  const addressText = String(simpleHeroModel.addressLine || simpleHeroModel.locationLabel || '').trim();
  const aboutText = String(simpleHeroModel.sectionAboutText || '').trim();
  const hasAboutSection = aboutText.length > 0;
  const hasAboutToggle = aboutText.length > 180;
  const hasAddress = Boolean(addressText);
  const hasMapData = Array.isArray(simpleHeroModel.mapStores) && simpleHeroModel.mapStores.length > 0;
  const visibleWhyChooseUs = Array.isArray(simpleHeroModel.whyChooseUs) ? simpleHeroModel.whyChooseUs.slice(0, MAX_STOREFRONT_WHY_CHOOSE_US) : [];
  const visibleContactRows = buildVisibleStorefrontContactRows({
    contactRows: simpleHeroModel.contactRows,
    hours: simpleHeroModel.hours,
    addressText,
    directionsUrl: simpleHeroModel.directionsUrl
  });
  const hasWhyChooseUs = visibleWhyChooseUs.length > 0;
  const hasContactRows = visibleContactRows.length > 0;
  const desktopColumns = hasAboutSection
    ? (hasWhyChooseUs ? '1fr 1.6fr 0.92fr' : '1fr 1.6fr')
    : (hasWhyChooseUs ? '1.6fr 0.92fr' : '1fr');
  const storefrontShareUrl = selectedStore?.slug
    ? buildStorefrontQrUrl({
      slug: selectedStore.slug,
      currentPath: typeof window !== 'undefined' ? window.location.pathname : '/'
    })
    : '';

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
        storefrontName={simpleHeroModel.name}
        storefrontModeLabel={simpleHeroModel.modeLabel}
        storefrontLogoUrl={simpleHeroModel.profileImageUrl}
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: STYLES.colors.dark, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: '"Inter", sans-serif', minWidth: 0, maxWidth: 236, flex: '0 1 236px' }}>
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
                  fontFamily: '"Inter", sans-serif'
                }}
                containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
                menuStyle={{ minWidth: 320, width: 'max-content', maxWidth: 'min(420px, calc(100vw - 32px))', padding: 10 }}
                optionStyle={{ padding: '12px 18px', fontFamily: '"Inter", sans-serif' }}
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
        isMobileViewport={isMobileViewport}
        sectionStyle={{
          minHeight: isMobileViewport ? 190 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: simpleHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
            ? `url(${simpleHeroModel.coverImageUrl}) center/cover`
            : `linear-gradient(135deg, ${heroTheme.surface || '#0f172a'} 0%, ${heroTheme.accentDark || '#134e4a'} 52%, ${heroTheme.accent || '#0f766e'} 100%)`,
          boxShadow: STYLES.shadow.lg
        }}
        backgroundChildren={
          <>
            {simpleHeroModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
              <img
                src={simpleHeroModel.coverImageUrl}
                alt=""
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
          storeName={simpleHeroModel.storeName || selectedStore?.tenant_name || 'Storefront'}
          storeLogoUrl={simpleHeroModel.profileImageUrl || ''}
          isMobileViewport={isMobileViewport}
          accentColor={heroTheme.accent || '#0f766e'}
          shareEnabled={shareEnabled}
        />
        {isMobileViewport && (
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{simpleHeroModel.statusLabel}</Badge>
          </div>
        )}
        {!isMobileViewport && (
          <div style={{
            position: 'absolute',
            left: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            right: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            bottom: -25,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            paddingLeft: 218
          }}>
            <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: 35 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.statusLabel}</Badge>
                {simpleHeroModel.hours && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.hours}</span>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
                <h1 style={{ margin: 0, color: '#fff', fontSize: 50, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: heroTheme.displayFont }}>{simpleHeroModel.name}</h1>
                {simpleHeroModel.tagline ? (
                  <p style={{ margin: 0, color: '#ccfbf1', fontSize: 20, fontWeight: 700, lineHeight: 1.3, fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.tagline}</p>
                ) : (
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
                )}
              </div>
              <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 600, opacity: 0.95, marginBottom: 6, fontFamily: heroTheme.bodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Star size={16} fill="#5eead4" color="#5eead4" />{simpleHeroModel.ratingLabel}</span>
                <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span>
                <span style={{ flexShrink: 0 }}>{simpleHeroModel.modeLabel}</span>
                <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><MapPin size={16} />{simpleHeroModel.locationLabel}</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexDirection: 'row',
              flexShrink: 0,
              marginLeft: 'auto',
              marginBottom: 35
            }}>
              {simpleHeroModel.actions?.canCall && (
                <GhostButton onClick={() => openStorefrontActionLink(simpleHeroModel.actions?.callHref)} style={{ minWidth: 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: heroTheme.bodyFont }}>
                  <Phone size={18} />
                  Call
                </GhostButton>
              )}
              <PrimaryButton onClick={() => {
                if (cartCount > 0) {
                  setIsCheckoutOpen(true);
                  return;
                }
                document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }} style={{ minWidth: 150, background: heroTheme.accent || '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: '0 10px 25px rgba(15,118,110,0.28)', border: 'none', fontWeight: 900, fontFamily: heroTheme.bodyFont }}>
                <MousePointer2 size={18} />
                {cartCount > 0 ? 'Open Cart' : (modeAdapter.primaryActionLabel || 'Start Ordering')}
              </PrimaryButton>
            </div>
          </div>
        )}

        <div style={{
          position: 'absolute',
          left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          top: 'auto',
          bottom: isMobileViewport ? '-45px' : '-25px',
          width: isMobileViewport ? 110 : 190,
          height: isMobileViewport ? 110 : 190,
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
          {simpleHeroModel.profileImageUrl && !isBrandingImageBlocked(`hero-profile:${selectedStore.slug}`) ? (
            <img
              src={simpleHeroModel.profileImageUrl}
              alt={`${simpleHeroModel.name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => markBrandingImageError(`hero-profile:${selectedStore.slug}`)}
            />
          ) : (
            <div style={{ fontSize: isMobileViewport ? 32 : 66, fontWeight: 900, color: heroTheme.accentDark || '#134e4a', fontFamily: heroTheme.displayFont }}>{simpleHeroModel.name.charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{ display: isMobileViewport ? 'block' : 'none', background: '#fff' }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', minHeight: 38, marginLeft: 118, gap: 8, marginBottom: 12, marginRight: 2 }}>
              {simpleHeroModel.actions?.canMessage && (
                <GhostButton onClick={() => openStorefrontActionLink(simpleHeroModel.actions.messageHref)} style={{ flex: 1, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, fontFamily: heroTheme.bodyFont, fontWeight: 600, fontSize: 13 }}>
                  <MessageSquare size={16} />
                  Message
                </GhostButton>
              )}
              {simpleHeroModel.actions?.canCall && (
                <PrimaryButton onClick={() => openStorefrontActionLink(simpleHeroModel.actions.callHref)} style={{ flex: 1, background: heroTheme.accent || '#0f766e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, fontFamily: heroTheme.bodyFont }}>
                  <Phone size={16} />
                  Call
                </PrimaryButton>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <SharedStorefrontHeroNameCluster
                name={simpleHeroModel.name}
                textColor="#0f172a"
                fontSize={24}
                fontFamily={heroTheme.displayFont}
                followEnabled={followEnabled}
                followState={followState}
                handleFollowAction={handleFollowAction}
              />

              {simpleHeroModel.tagline ? (
                <p style={{ margin: 0, color: heroTheme.accent || '#0f766e', fontSize: 14, fontWeight: 600, fontStyle: 'italic', fontFamily: heroTheme.bodyFont }}>{simpleHeroModel.tagline}</p>
              ) : (
                <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.5, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
              )}

              <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#475569', fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: heroTheme.bodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}><Star size={14} fill="#5eead4" color="#5eead4" />{simpleHeroModel.ratingLabel}</span>
                <span style={{ opacity: 0.3, flexShrink: 0 }}>|</span>
                <span style={{ flexShrink: 0 }}>{simpleHeroModel.modeLabel}</span>
              </div>
            </div>
          </div>
        </div>
      {!isMobileViewport && (
        <div style={{ display: 'block' }}>
          <div style={{
            maxWidth: STOREFRONT_INFO_PANEL_MAX_WIDTH,
            margin: '70px auto 40px',
            padding: 26,
            background: '#ffffff',
            border: '1px solid #e8edf3',
            borderRadius: 24,
            boxShadow: '0 18px 42px rgba(15, 23, 42, 0.07)',
            display: 'grid',
            gridTemplateColumns: desktopColumns,
            gap: 26
          }}>
            {hasAboutSection && (
              <SimpleHeroAbout
                STYLES={STYLES}
                aboutText={aboutText}
                hasAboutToggle={hasAboutToggle}
                heroTheme={heroTheme}
              />
            )}

            <SimpleHeroContactLocation
              STYLES={STYLES}
              STOREFRONT_CONTACT_INFO_COLUMNS={STOREFRONT_CONTACT_INFO_COLUMNS}
              STOREFRONT_INFO_ICON_COLUMN={STOREFRONT_INFO_ICON_COLUMN}
              STOREFRONT_INFO_ROW_GAP={STOREFRONT_INFO_ROW_GAP}
              StorefrontExpandableBusinessHours={StorefrontExpandableBusinessHours}
              hasAboutSection={hasAboutSection}
              hasContactRows={hasContactRows}
              hasMapData={hasMapData}
              heroTheme={heroTheme}
              isMobileViewport={isMobileViewport}
              openStorefrontActionLink={openStorefrontActionLink}
              setIsExpandedMapOpen={setIsExpandedMapOpen}
              simpleHeroModel={simpleHeroModel}
              visibleContactRows={visibleContactRows}
            />

            {hasWhyChooseUs && (
              <SimpleHeroWhyShopHere
                STYLES={STYLES}
                heroTheme={heroTheme}
                isMobileViewport={isMobileViewport}
                visibleWhyChooseUs={visibleWhyChooseUs}
              />
            )}
          </div>
        </div>
      )}

      {isMobileViewport && (
        <SimpleHeroMobileInfoCards
          STYLES={STYLES}
          aboutText={aboutText}
          addressText={addressText}
          hasAboutSection={hasAboutSection}
          hasContactRows={hasContactRows}
          hasMapData={hasMapData}
          hasWhyChooseUs={hasWhyChooseUs}
          heroTheme={heroTheme}
          openStorefrontActionLink={openStorefrontActionLink}
          selectedBranchLabel={selectedBranchLabel}
          setIsExpandedMapOpen={setIsExpandedMapOpen}
          simpleHeroModel={simpleHeroModel}
          storefrontCityLabel={storefrontCityLabel}
          visibleContactRows={visibleContactRows}
          visibleWhyChooseUs={visibleWhyChooseUs}
        />
      )}      <StorefrontExpandedMapModal
        open={isExpandedMapOpen}
        onClose={() => setIsExpandedMapOpen(false)}
        title={`${simpleHeroModel.name || selectedStore?.tenant_name || 'Store'} Map`}
        subtitle="View the store location in a larger map."
        stores={simpleHeroModel.mapStores}
        selectedKey={simpleHeroModel.mapSelectedKey}
      />
    </section>
  );
};

export { SimpleHero };
