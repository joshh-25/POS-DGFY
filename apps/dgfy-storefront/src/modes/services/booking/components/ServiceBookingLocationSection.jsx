import React, { useState } from 'react';
import { CheckCircle2, Expand, MapPin, Navigation, Plus, X } from 'lucide-react';
import { SavedAddressCard } from '../../../../shared/components/checkout/SavedAddressCard.jsx';
import { ServiceBookingSectionHeader } from './ServiceBookingSectionHeader.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

function ProfileLocationCard({ icon, title, description, servicesPrimary, servicesPrimarySoft, servicesPrimaryBorder, servicesDisplayFont }) {
  return (
    <div role="status" style={{ border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 16, background: servicesPrimarySoft, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: SERVICES_PALETTE.primaryLight, color: servicesPrimary, flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <strong style={{ fontSize: 14, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>{title}</strong>
        <span style={{ fontSize: 12, lineHeight: 1.4, color: SERVICES_PALETTE.textSecondary }}>{description}</span>
      </span>
    </div>
  );
}

function BranchLocationPicker({ isMobileViewport, selectedLocationId, setSelectedLocationId, storeLocations = [], servicesPrimary, servicesPrimarySoft, servicesPrimaryBorder, servicesDisplayFont }) {
  const locations = Array.isArray(storeLocations) ? storeLocations : [];
  if (locations.length === 0) {
    return (
      <ProfileLocationCard
        icon={<MapPin size={19} />}
        title="Branch not selected yet"
        description="Choose a branch from the storefront before confirming this appointment."
        servicesPrimary={servicesPrimary}
        servicesPrimarySoft={servicesPrimarySoft}
        servicesPrimaryBorder={servicesPrimaryBorder}
        servicesDisplayFont={servicesDisplayFont}
      />
    );
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: SERVICES_PALETTE.textSecondary }}>Choose a branch</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {locations.map((location) => {
          const locationId = location?.location_id;
          const isSelected = selectedLocationId != null && String(selectedLocationId) === String(locationId);
          const label = String(location?.name || location?.label || `Branch ${locationId || ''}`).trim();
          const address = String(location?.full_address || location?.address_line || location?.address || '').trim();
          return (
            <button
              key={String(locationId || label)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedLocationId(locationId)}
              style={{ minHeight: 72, borderRadius: 14, border: `1.5px solid ${isSelected ? servicesPrimary : SERVICES_PALETTE.border}`, background: isSelected ? servicesPrimarySoft : SERVICES_PALETTE.surface, padding: '11px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', cursor: 'pointer', boxShadow: isSelected ? `0 8px 18px ${SERVICES_PALETTE.primaryShadow}` : 'none' }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: isSelected ? servicesPrimary : SERVICES_PALETTE.textPrimary, background: isSelected ? SERVICES_PALETTE.primaryLight : SERVICES_PALETTE.page, flexShrink: 0 }}>{isSelected ? <CheckCircle2 size={16} /> : <MapPin size={16} />}</span>
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <strong style={{ color: SERVICES_PALETTE.textPrimary, fontSize: 13, lineHeight: 1.25, fontFamily: servicesDisplayFont || 'inherit' }}>{label}</strong>
                {address ? <span style={{ color: SERVICES_PALETTE.textMuted, fontSize: 11, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{address}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ServiceBookingLocationSection({
  STYLES,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesDisplayFont,
  servicesBodyFont,
  isMobileViewport,
  DeliveryPinMap,
  deliverySavedLocations,
  accountAddressesLoading,
  accountAddressesError,
  selectedSavedLocationId,
  setSelectedSavedLocationId,
  setDeliveryLocationAction,
  applySavedDeliveryLocation,
  customerPin,
  setCustomerPin,
  handlePinMyLocation,
  pinLocationLoading,
  deliveryLocationAction,
  deliveryLocationDisplayAddress,
  handleAddPinnedLocation,
  canAddPinnedLocation,
  isDgfyCustomerSignedIn,
  pinLocationError,
  showExpandedDeliveryMap,
  setShowExpandedDeliveryMap,
  serviceFlowMethod = '',
  serviceFlowProfileMethod = '',
  selectedLocationId,
  setSelectedLocationId,
  storeLocations = [],
  compactLayout = false,
}) {
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

  const normalizedFlowMethod = String(serviceFlowMethod || '').trim().toLowerCase();
  const normalizedProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const isOnlineFlow = normalizedFlowMethod === 'online' || normalizedProfileMethod === 'online';
  const isBranchFlow = normalizedFlowMethod === 'appointment' || normalizedProfileMethod === 'appointment';
  const isNeutralHybridFlow = normalizedProfileMethod === 'hybrid' && !['appointment', 'on_site'].includes(normalizedFlowMethod);

  const getLocationTitle = (location = {}) => {
    const fullAddress = String(location?.fullAddress || '').trim();
    if (fullAddress) return fullAddress;
    const address = String(location?.address || '').trim();
    if (address) return address;
    const label = String(location?.label || '').trim();
    if (label) return label;
    const fallbackParts = [
      location?.barangay,
      location?.city,
      location?.province,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return fallbackParts.join(', ') || 'Saved location';
  };
  const getLocationMetaLabel = (location = {}) => {
    const note = String(
      location?.landmarkNote
      || location?.label
      || location?.landmark_note
      || ''
    ).trim();
    const title = getLocationTitle(location);
    if (note && note.toLowerCase() !== title.toLowerCase()) return note;
    return isDgfyCustomerSignedIn ? 'Saved address' : 'Saved location';
  };
  const compactRowControlHeight = isMobileViewport ? 46 : 48;
  const mapHeight = isMobileViewport ? 'clamp(230px, 34svh, 280px)' : (compactLayout ? 220 : 260);
  const homeLocation = compactLayout
    ? deliverySavedLocations.find((location) => String(location?.label || '').trim().toLowerCase() === 'home')
      || deliverySavedLocations.find((location) => location?.source === 'account' && location?.isDefault)
      || deliverySavedLocations.find((location) => location?.source === 'account')
      || null
    : null;
  const homeLocationCard = homeLocation ? { ...homeLocation, label: 'Home' } : null;
  const isHomeLocationSelected = Boolean(
    homeLocation
    && String(selectedSavedLocationId) === String(homeLocation.id)
    && deliveryLocationAction === 'saved'
  );
  const isAreaLocationSelected = compactLayout && ['map', 'current'].includes(deliveryLocationAction);
  const normalizedHomeAddress = String(homeLocation?.fullAddress || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedCurrentAddress = String(deliveryLocationDisplayAddress || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const hasMatchingHomeCoordinates = Boolean(
    homeLocation
    && Number.isFinite(Number(homeLocation.latitude))
    && Number.isFinite(Number(homeLocation.longitude))
    && Number.isFinite(Number(customerPin?.latitude))
    && Number.isFinite(Number(customerPin?.longitude))
    && Number(homeLocation.latitude).toFixed(6) === Number(customerPin.latitude).toFixed(6)
    && Number(homeLocation.longitude).toFixed(6) === Number(customerPin.longitude).toFixed(6)
  );
  const isCurrentLocationSavedAsHome = compactLayout
    && Boolean(homeLocation)
    && ((normalizedHomeAddress && normalizedHomeAddress === normalizedCurrentAddress) || hasMatchingHomeCoordinates);
  const showHomeSaveAction = !compactLayout || !isCurrentLocationSavedAsHome;
  const stopMapOverlayInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (isOnlineFlow) return null;

  if (isBranchFlow || isNeutralHybridFlow) {
    return (
      <section style={{ display: 'grid', gap: 14 }}>
        <ServiceBookingSectionHeader
          title={isNeutralHybridFlow ? 'Location' : 'Branch'}
          showIcon={false}
          servicesPrimary={servicesPrimary}
          servicesPrimarySoft={servicesPrimarySoft}
          servicesPrimaryBorder={servicesPrimaryBorder}
          servicesDisplayFont={servicesDisplayFont}
        />
        {isNeutralHybridFlow ? (
          <ProfileLocationCard
            icon={<MapPin size={19} />}
            title="Choose a service location"
            description="Choose whether this service takes place at a branch or at your address."
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesDisplayFont={servicesDisplayFont}
          />
        ) : (
          <BranchLocationPicker
            isMobileViewport={isMobileViewport}
            selectedLocationId={selectedLocationId}
            setSelectedLocationId={setSelectedLocationId}
            storeLocations={storeLocations}
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesDisplayFont={servicesDisplayFont}
          />
        )}
      </section>
    );
  }

  return (
    <>
      <section style={{ display: 'grid', gap: 14 }}>
        <ServiceBookingSectionHeader
          icon={<MapPin size={19} />}
          title="Location"
          showIcon={false}
          servicesPrimary={servicesPrimary}
          servicesPrimarySoft={servicesPrimarySoft}
          servicesPrimaryBorder={servicesPrimaryBorder}
          servicesDisplayFont={servicesDisplayFont}
        />

        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            background: '#fff',
            padding: isMobileViewport ? 14 : (compactLayout ? 12 : 18),
            display: 'grid',
            gap: compactLayout ? 10 : 12,
            boxSizing: 'border-box',
            overflow: 'visible',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport || compactLayout ? '1fr' : '280px minmax(0, 1fr)', gap: compactLayout ? 10 : 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <div style={{ display: 'grid', gap: compactLayout ? 8 : 12 }}>
              {compactLayout ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {homeLocationCard ? (
                    <SavedAddressCard
                      key={`service-home-location-${homeLocationCard.id}`}
                      address={homeLocationCard}
                      isSelected={isHomeLocationSelected}
                      isBusy={false}
                      onSelect={() => applySavedDeliveryLocation(homeLocation)}
                      showActions={false}
                      themeColor={servicesPrimary}
                      themeBg={servicesPrimarySoft}
                      themeHoverBorder={servicesPrimaryBorder}
                      themeHoverBg={servicesPrimarySoft}
                      themeShadowColor="rgba(26,78,141,0.12)"
                      themeShadowColorSoft="rgba(26,78,141,0.08)"
                      compact
                    />
                  ) : (
                    <div role="status" style={{ minHeight: 54, border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: 14, background: SERVICES_PALETTE.surface, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: SERVICES_PALETTE.page, color: SERVICES_PALETTE.textMuted, flexShrink: 0 }}>
                        <MapPin size={15} />
                      </span>
                      <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <strong style={{ fontSize: 12, lineHeight: 1.25, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>Home</strong>
                        <span style={{ fontSize: 10.5, lineHeight: 1.35, color: SERVICES_PALETTE.textMuted }}>No saved home location yet.</span>
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-pressed={isAreaLocationSelected}
                    onClick={() => {
                      setDeliveryLocationAction('map');
                      setSelectedSavedLocationId('');
                    }}
                    style={{ minHeight: 54, borderRadius: 14, border: `1.5px solid ${isAreaLocationSelected ? servicesPrimary : SERVICES_PALETTE.border}`, background: isAreaLocationSelected ? servicesPrimarySoft : SERVICES_PALETTE.surface, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', color: SERVICES_PALETTE.textPrimary, cursor: 'pointer', boxShadow: isAreaLocationSelected ? '0 8px 18px rgba(26,78,141,0.12)' : 'none' }}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: isAreaLocationSelected ? SERVICES_PALETTE.primaryLight : SERVICES_PALETTE.page, color: servicesPrimary, flexShrink: 0 }}>
                      <MapPin size={15} />
                    </span>
                    <span style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
                      <strong style={{ fontSize: 12, lineHeight: 1.25, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>Choose an area</strong>
                      <span style={{ fontSize: 10.5, lineHeight: 1.35, color: SERVICES_PALETTE.textMuted }}>Select the service area on the map.</span>
                    </span>
                    <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${isAreaLocationSelected ? servicesPrimary : SERVICES_PALETTE.border}`, background: isAreaLocationSelected ? servicesPrimary : 'transparent', boxShadow: isAreaLocationSelected ? `inset 0 0 0 4px ${SERVICES_PALETTE.surface}` : 'none', flexShrink: 0 }} />
                  </button>
                </div>
              ) : isMobileViewport ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: servicesBodyFont }}>
                    Service address
                  </div>
                  {deliverySavedLocations.length === 0 ? (
                    <button
                      type="button"
                      aria-label="Add New Location"
                      onClick={() => {
                        setDeliveryLocationAction('map');
                        setSelectedSavedLocationId('');
                      }}
                      style={{ minHeight: 44, borderRadius: 14, border: `1.5px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, color: servicesPrimary, cursor: 'pointer', flexShrink: 0, boxShadow: '0 10px 20px rgba(26,78,141,0.12)', transition: 'all 200ms ease', fontSize: 13 }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: servicesPrimary, background: SERVICES_PALETTE.primaryLight, transition: 'all 200ms ease' }}>
                        <Plus size={18} />
                      </span>
                      Add New Location
                    </button>
                  ) : (
                    <>
                      {(() => {
                        const activeLoc = deliverySavedLocations.find(l => String(l.id) === String(selectedSavedLocationId)) || deliverySavedLocations.find(l => l.isDefault) || deliverySavedLocations[0];
                        const isSelected = String(selectedSavedLocationId) === String(activeLoc.id) && deliveryLocationAction !== 'map' && deliveryLocationAction !== 'current';
                        return (
                          <SavedAddressCard
                            key={`service-mobile-location-${activeLoc.id}`}
                            address={activeLoc}
                            isSelected={isSelected}
                            isBusy={false}
                            onSelect={() => applySavedDeliveryLocation(activeLoc)}
                            showActions={false}
                            themeColor={servicesPrimary}
                            themeBg={servicesPrimarySoft}
                            themeHoverBorder={servicesPrimaryBorder}
                            themeHoverBg={servicesPrimarySoft}
                            themeShadowColor="rgba(26,78,141,0.12)"
                            themeShadowColorSoft="rgba(26,78,141,0.08)"
                            compact={compactLayout}
                          />
                        );
                      })()}
                      <button type="button" onClick={() => setShowMobileAddressModal(true)} style={{ minHeight: 44, borderRadius: 14, background: servicesPrimarySoft, border: `1.5px solid ${servicesPrimaryBorder}`, color: servicesPrimary, fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        View all saved addresses
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div
                    className={deliverySavedLocations.length > 3 ? 'fnb-saved-locations-scroll' : undefined}
                    style={{
                      maxHeight: deliverySavedLocations.length > 3 ? (compactLayout ? 208 : 240) : 'none',
                      overflowY: deliverySavedLocations.length > 3 ? 'auto' : 'visible',
                      display: 'grid',
                      gap: compactLayout ? 6 : 8,
                      paddingRight: deliverySavedLocations.length > 3 ? 4 : 0,
                      paddingTop: deliverySavedLocations.length > 3 ? 4 : 0,
                      paddingBottom: deliverySavedLocations.length > 3 ? 4 : 0,
                      scrollbarGutter: 'stable',
                      scrollPaddingBlock: 4,
                      boxSizing: 'border-box',
                    }}
                  >
                    {deliverySavedLocations.map((location) => {
                      const isSelected = String(selectedSavedLocationId) === String(location.id) && deliveryLocationAction !== 'map' && deliveryLocationAction !== 'current';
                      return (
                        <SavedAddressCard
                          key={`service-desktop-location-${location.id}`}
                          address={location}
                          isSelected={isSelected}
                          isBusy={false}
                          onSelect={() => applySavedDeliveryLocation(location)}
                          showActions={false}
                          themeColor={servicesPrimary}
                          themeBg={servicesPrimarySoft}
                          themeHoverBorder={servicesPrimaryBorder}
                          themeHoverBg={servicesPrimarySoft}
                          themeShadowColor="rgba(26,78,141,0.12)"
                          themeShadowColorSoft="rgba(26,78,141,0.08)"
                          compact={compactLayout}
                        />
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-label="Add New Location"
                    onClick={() => {
                      setDeliveryLocationAction('map');
                      setSelectedSavedLocationId('');
                    }}
                    style={{
                      minHeight: compactLayout ? 42 : 44,
                      borderRadius: compactLayout ? 11 : 12,
                      border: `1.5px solid ${deliveryLocationAction === 'map' ? servicesPrimaryBorder : SERVICES_PALETTE.border}`,
                      background: deliveryLocationAction === 'map' ? servicesPrimarySoft : '#fff',
                      padding: compactLayout ? '0 12px' : '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontWeight: 700,
                      color: '#1e293b',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: deliveryLocationAction === 'map' ? '0 10px 20px rgba(26,78,141,0.12)' : 'none',
                      transition: 'all 200ms ease',
                      fontSize: compactLayout ? 12 : 13,
                      marginTop: compactLayout ? 2 : 4
                    }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: deliveryLocationAction === 'map' ? servicesPrimary : '#94a3b8', background: deliveryLocationAction === 'map' ? SERVICES_PALETTE.primaryLight : 'transparent', transition: 'all 200ms ease' }}>
                      <Plus size={18} />
                    </span>
                    Add New Location
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: compactLayout ? 10 : 12 }}>
              <DeliveryPinMap
                pin={customerPin}
                onPinChange={(nextPin) => {
                  setDeliveryLocationAction('map');
                  setSelectedSavedLocationId('');
                  setCustomerPin(nextPin);
                }}
                disabled={false}
                height={mapHeight}
                highlighted
                highlightColor={servicesPrimary}
                highlightGlow="rgba(26,78,141,0.16)"
                overlayControls={(
                  <>
                    <button
                      type="button"
                      onMouseDown={stopMapOverlayInteraction}
                      onPointerDown={stopMapOverlayInteraction}
                      onTouchStart={stopMapOverlayInteraction}
                      onClick={(event) => {
                        stopMapOverlayInteraction(event);
                        handlePinMyLocation();
                      }}
                      disabled={pinLocationLoading}
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        minHeight: 38,
                        borderRadius: 999,
                        border: `1px solid ${deliveryLocationAction === 'current' ? servicesPrimary : SERVICES_PALETTE.border}`,
                        background: deliveryLocationAction === 'current' ? servicesPrimarySoft : SERVICES_PALETTE.surface,
                        color: deliveryLocationAction === 'current' ? SERVICES_PALETTE.primaryDark : SERVICES_PALETTE.textPrimary,
                        padding: '0 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: pinLocationLoading ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                        pointerEvents: 'auto',
                        zIndex: 11,
                      }}
                    >
                      <Navigation size={15} />
                      {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                    </button>

                    <button
                      type="button"
                      onMouseDown={stopMapOverlayInteraction}
                      onPointerDown={stopMapOverlayInteraction}
                      onTouchStart={stopMapOverlayInteraction}
                      onClick={(event) => {
                        stopMapOverlayInteraction(event);
                        setDeliveryLocationAction('map');
                        setSelectedSavedLocationId('');
                      }}
                      style={{
                        position: 'absolute',
                        right: 12,
                        bottom: 12,
                        minHeight: 34,
                        borderRadius: 999,
                        border: `1px solid ${deliveryLocationAction === 'map' ? servicesPrimary : SERVICES_PALETTE.border}`,
                        background: deliveryLocationAction === 'map' ? servicesPrimarySoft : 'rgba(255,255,255,0.96)',
                        color: deliveryLocationAction === 'map' ? SERVICES_PALETTE.primaryDark : SERVICES_PALETTE.textSecondary,
                        padding: '0 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                        pointerEvents: 'auto',
                        zIndex: 11,
                      }}
                    >
                      <MapPin size={14} />
                      Drag to adjust pin
                    </button>

                    <button
                      type="button"
                      onMouseDown={stopMapOverlayInteraction}
                      onPointerDown={stopMapOverlayInteraction}
                      onTouchStart={stopMapOverlayInteraction}
                      onClick={(event) => {
                        stopMapOverlayInteraction(event);
                        setShowExpandedDeliveryMap(true);
                      }}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 12,
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        border: '1px solid #dbe5ee',
                        background: '#ffffff',
                        color: '#334155',
                        display: 'grid',
                        placeItems: 'center',
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                        boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                        zIndex: 11,
                      }}
                    >
                      <Expand size={16} />
                    </button>
                  </>
                )}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport || !showHomeSaveAction ? '1fr' : 'minmax(0, 1fr) auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    minHeight: compactRowControlHeight,
                    borderRadius: 16,
                    border: `1px solid ${deliveryLocationDisplayAddress ? servicesPrimaryBorder : SERVICES_PALETTE.border}`,
                    background: '#fff',
                    padding: isMobileViewport ? '8px 11px' : '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: deliveryLocationDisplayAddress ? '#334155' : '#94a3b8',
                    fontSize: 13,
                    minWidth: 0,
                  }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: servicesPrimarySoft, color: servicesPrimary, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                    <MapPin size={15} />
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', fontWeight: 600 }}>
                    {deliveryLocationDisplayAddress || 'Selected service address will appear here.'}
                  </span>
                </div>
                {showHomeSaveAction ? (
                  <button
                    type="button"
                    onClick={() => handleAddPinnedLocation({ saveAsHome: compactLayout, selectAfterSave: !compactLayout })}
                    disabled={!canAddPinnedLocation}
                    style={{
                      minHeight: compactRowControlHeight,
                      borderRadius: 16,
                      border: `1px solid ${servicesPrimary}`,
                      background: canAddPinnedLocation ? servicesPrimary : '#f8fafc',
                      color: canAddPinnedLocation ? '#fff' : '#94a3b8',
                      padding: '0 13px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed',
                      minWidth: isMobileViewport ? 104 : 120,
                      boxShadow: canAddPinnedLocation ? '0 14px 28px rgba(26,78,141,0.18)' : 'none',
                    }}
                  >
                    {compactLayout ? 'Save as Home' : (isDgfyCustomerSignedIn ? 'Save Address' : 'Add Location')}
                  </button>
                ) : null}
              </div>

              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={14} color="#64748b" />
                <span>This is the address where the service will be provided.</span>
              </div>

              {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
            </div>
          </div>
        </div>
      </section>

      {showExpandedDeliveryMap && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(15,23,42,0.46)', display: 'grid', placeItems: 'center', padding: isMobileViewport ? 16 : 28 }}>
          <div style={{ width: 'min(980px, 100%)', maxHeight: '90vh', overflow: 'auto', borderRadius: 20, background: '#fff', border: '1px solid #dbe5ee', boxShadow: '0 26px 60px rgba(15,23,42,0.22)', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', fontFamily: servicesDisplayFont }}>Large Map</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Tap anywhere on the map to pin your service location.</div>
              </div>
              <button type="button" onClick={() => setShowExpandedDeliveryMap(false)} style={{ minHeight: 40, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '0 14px', fontWeight: 700, cursor: 'pointer', fontFamily: servicesBodyFont }}>
                Close
              </button>
            </div>

            <DeliveryPinMap
              pin={customerPin}
              onPinChange={(nextPin) => {
                setDeliveryLocationAction('map');
                setSelectedSavedLocationId('');
                setCustomerPin(nextPin);
              }}
              disabled={false}
              height={isMobileViewport ? 'clamp(340px, min(70svh, calc(100svh - 220px)), 620px)' : 520}
              highlighted
              highlightColor={servicesPrimary}
              highlightGlow="rgba(26,78,141,0.16)"
              overlayControls={(
                <>
                  <button
                    type="button"
                    onMouseDown={stopMapOverlayInteraction}
                    onPointerDown={stopMapOverlayInteraction}
                    onTouchStart={stopMapOverlayInteraction}
                    onClick={(event) => {
                      stopMapOverlayInteraction(event);
                      handlePinMyLocation();
                    }}
                    disabled={pinLocationLoading}
                    style={{
                      position: 'absolute',
                      top: 12,
                      left: 12,
                      minHeight: 38,
                      borderRadius: 999,
                      border: `1px solid ${deliveryLocationAction === 'current' ? servicesPrimary : SERVICES_PALETTE.border}`,
                      background: deliveryLocationAction === 'current' ? servicesPrimarySoft : SERVICES_PALETTE.surface,
                      color: deliveryLocationAction === 'current' ? SERVICES_PALETTE.primaryDark : SERVICES_PALETTE.textPrimary,
                      padding: '0 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: pinLocationLoading ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                      pointerEvents: 'auto',
                      zIndex: 11,
                    }}
                  >
                    <Navigation size={15} />
                    {pinLocationLoading ? 'Locating...' : 'Use Current Location'}
                  </button>

                  <button
                    type="button"
                    onMouseDown={stopMapOverlayInteraction}
                    onPointerDown={stopMapOverlayInteraction}
                    onTouchStart={stopMapOverlayInteraction}
                    onClick={(event) => {
                      stopMapOverlayInteraction(event);
                      setDeliveryLocationAction('map');
                      setSelectedSavedLocationId('');
                    }}
                    style={{
                      position: 'absolute',
                      right: 12,
                      bottom: 12,
                      minHeight: 34,
                      borderRadius: 999,
                      border: `1px solid ${deliveryLocationAction === 'map' ? servicesPrimary : SERVICES_PALETTE.border}`,
                      background: deliveryLocationAction === 'map' ? servicesPrimarySoft : 'rgba(255,255,255,0.96)',
                      color: deliveryLocationAction === 'map' ? SERVICES_PALETTE.primaryDark : SERVICES_PALETTE.textSecondary,
                      padding: '0 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
                      pointerEvents: 'auto',
                      zIndex: 11,
                    }}
                  >
                    <MapPin size={14} />
                    Drag to adjust pin
                  </button>
                </>
              )}
            />

            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
              <div style={{ minHeight: compactRowControlHeight, borderRadius: 14, border: `1px solid ${deliveryLocationDisplayAddress ? servicesPrimaryBorder : SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.surface, padding: '0 13px', display: 'flex', alignItems: 'center', color: deliveryLocationDisplayAddress ? SERVICES_PALETTE.textSecondary : '#94a3b8', fontSize: 13, minWidth: 0 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                  {deliveryLocationDisplayAddress || 'Selected service address will appear here.'}
                </span>
              </div>
              <button type="button" onClick={handleAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ minHeight: compactRowControlHeight, borderRadius: 14, border: `1px solid ${servicesPrimary}`, background: canAddPinnedLocation ? servicesPrimary : SERVICES_PALETTE.page, color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', boxShadow: canAddPinnedLocation ? '0 14px 28px rgba(26,78,141,0.18)' : 'none' }}>
                {isDgfyCustomerSignedIn ? 'Save Address' : 'Add Location'}
              </button>
            </div>

            {pinLocationError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</div>}
          </div>
        </div>
      )}
      {showMobileAddressModal && isMobileViewport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ position: 'absolute', inset: 0 }} onClick={() => setShowMobileAddressModal(false)} />
          <div style={{ position: 'relative', background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '24px 16px max(24px, env(safe-area-inset-bottom))', display: 'grid', gap: 16, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', paddingTop: 6, fontFamily: servicesDisplayFont }}>Saved Addresses</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
                <button type="button" onClick={() => setShowMobileAddressModal(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569' }}>
                  <X size={18} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  aria-label="Add New Location"
                  onClick={() => {
                    setShowMobileAddressModal(false);
                    setDeliveryLocationAction('map');
                    setSelectedSavedLocationId('');
                  }}
                  style={{
                    height: 32,
                    borderRadius: 999,
                    border: 'none',
                    background: servicesPrimarySoft,
                    padding: '0 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 800,
                    color: servicesPrimary,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontFamily: servicesBodyFont
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Add New Location
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {deliverySavedLocations.map((location) => {
                const isSelected = String(selectedSavedLocationId) === String(location.id) && deliveryLocationAction !== 'map' && deliveryLocationAction !== 'current';
                return (
                  <SavedAddressCard
                    key={`service-modal-location-${location.id}`}
                    address={location}
                    isSelected={isSelected}
                    isBusy={false}
                    onSelect={() => {
                      applySavedDeliveryLocation(location);
                      setShowMobileAddressModal(false);
                    }}
                    showActions={false}
                    themeColor={servicesPrimary}
                    themeBg={servicesPrimarySoft}
                    themeHoverBorder={servicesPrimaryBorder}
                    themeHoverBg={servicesPrimarySoft}
                    themeShadowColor="rgba(26,78,141,0.12)"
                    themeShadowColorSoft="rgba(26,78,141,0.08)"
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
