import React, { useState } from 'react';
import { Expand, MapPin, Navigation, Plus, X } from 'lucide-react';
import { SavedAddressCard } from '../../checkout/components/SavedAddressCard.jsx';

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
  serviceLocationLandmarkNote,
  setServiceLocationLandmarkNote,
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
}) {
  const [showMobileAddressModal, setShowMobileAddressModal] = useState(false);

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
  const compactSavedLocationHeight = isMobileViewport ? 56 : 58;
  const compactSecondaryButtonHeight = isMobileViewport ? 44 : 46;
  const compactRowControlHeight = isMobileViewport ? 46 : 48;
  const mapHeight = isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260;
  const stopMapOverlayInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Location
        </div>

        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            background: '#fff',
            padding: isMobileViewport ? 16 : 18,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              {isMobileViewport ? (
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
                      style={{ minHeight: 44, borderRadius: 14, border: `1.5px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700, color: servicesPrimary, cursor: 'pointer', flexShrink: 0, boxShadow: '0 10px 20px rgba(15,118,110,0.12)', transition: 'all 200ms ease', fontSize: 13 }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: servicesPrimary, background: '#ccfbf1', transition: 'all 200ms ease' }}>
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
                            themeHoverBg="#f0fdfa"
                            themeShadowColor="rgba(15,118,110,0.12)"
                            themeShadowColorSoft="rgba(15,118,110,0.08)"
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
                      maxHeight: deliverySavedLocations.length > 3 ? 240 : 'none',
                      overflowY: deliverySavedLocations.length > 3 ? 'auto' : 'visible',
                      display: 'grid',
                      gap: 8,
                      paddingRight: deliverySavedLocations.length > 3 ? 4 : 0
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
                          themeHoverBg="#f0fdfa"
                          themeShadowColor="rgba(15,118,110,0.12)"
                          themeShadowColorSoft="rgba(15,118,110,0.08)"
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
                      minHeight: 44,
                      borderRadius: 12,
                      border: `1.5px solid ${deliveryLocationAction === 'map' ? servicesPrimaryBorder : '#dbe5ee'}`,
                      background: deliveryLocationAction === 'map' ? servicesPrimarySoft : '#fff',
                      padding: '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontWeight: 700,
                      color: '#1e293b',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: deliveryLocationAction === 'map' ? '0 10px 20px rgba(15,118,110,0.12)' : 'none',
                      transition: 'all 200ms ease',
                      fontSize: 13,
                      marginTop: 4
                    }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', color: deliveryLocationAction === 'map' ? servicesPrimary : '#94a3b8', background: deliveryLocationAction === 'map' ? '#ccfbf1' : 'transparent', transition: 'all 200ms ease' }}>
                      <Plus size={18} />
                    </span>
                    Add New Location
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
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
                highlightGlow="rgba(15,118,110,0.16)"
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
                        border: `1px solid ${deliveryLocationAction === 'current' ? servicesPrimary : '#dbe5ee'}`,
                        background: deliveryLocationAction === 'current' ? '#ecfeff' : '#ffffff',
                        color: deliveryLocationAction === 'current' ? '#134e4a' : '#1e293b',
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
                        border: `1px solid ${deliveryLocationAction === 'map' ? servicesPrimary : '#dbe5ee'}`,
                        background: deliveryLocationAction === 'map' ? '#ecfeff' : 'rgba(255,255,255,0.96)',
                        color: deliveryLocationAction === 'map' ? '#134e4a' : '#334155',
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
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.45fr) minmax(220px, 0.8fr) auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    minHeight: compactRowControlHeight,
                    borderRadius: 16,
                    border: `1px solid ${deliveryLocationDisplayAddress ? '#99f6e4' : '#dbe5ee'}`,
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
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#eff6ff', color: servicesPrimary, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
                    <MapPin size={15} />
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', fontWeight: 600 }}>
                    {deliveryLocationDisplayAddress || 'Selected service address will appear here.'}
                  </span>
                </div>
                <input
                  type="text"
                  value={serviceLocationLandmarkNote}
                  onChange={(event) => setServiceLocationLandmarkNote(event.target.value)}
                  placeholder="Landmark / Unit / Notes (optional)"
                  style={{
                    minHeight: compactRowControlHeight,
                    width: '100%',
                    borderRadius: 16,
                    border: '1px solid #dbe5ee',
                    background: '#fff',
                    padding: '0 13px',
                    color: '#334155',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddPinnedLocation}
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
                    boxShadow: canAddPinnedLocation ? '0 14px 28px rgba(15,118,110,0.18)' : 'none',
                  }}
                >
                  {isDgfyCustomerSignedIn ? 'Save Address' : 'Add Location'}
                </button>
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
              highlightGlow="rgba(15,118,110,0.16)"
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
                      border: `1px solid ${deliveryLocationAction === 'current' ? servicesPrimary : '#dbe5ee'}`,
                      background: deliveryLocationAction === 'current' ? '#ecfeff' : '#ffffff',
                      color: deliveryLocationAction === 'current' ? '#134e4a' : '#1e293b',
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
                      border: `1px solid ${deliveryLocationAction === 'map' ? servicesPrimary : '#dbe5ee'}`,
                      background: deliveryLocationAction === 'map' ? '#ecfeff' : 'rgba(255,255,255,0.96)',
                      color: deliveryLocationAction === 'map' ? '#134e4a' : '#334155',
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.45fr) minmax(220px, 0.8fr) auto', gap: 10, alignItems: 'center' }}>
              <div style={{ minHeight: compactRowControlHeight, borderRadius: 14, border: `1px solid ${deliveryLocationDisplayAddress ? '#99f6e4' : '#dbe5ee'}`, background: '#fff', padding: '0 13px', display: 'flex', alignItems: 'center', color: deliveryLocationDisplayAddress ? '#334155' : '#94a3b8', fontSize: 13, minWidth: 0 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                  {deliveryLocationDisplayAddress || 'Selected service address will appear here.'}
                </span>
              </div>
              <input
                type="text"
                value={serviceLocationLandmarkNote}
                onChange={(event) => setServiceLocationLandmarkNote(event.target.value)}
                placeholder="Landmark / Unit / Notes (optional)"
                style={{
                  minHeight: compactRowControlHeight,
                  borderRadius: 14,
                  border: '1px solid #dbe5ee',
                  background: '#fff',
                  padding: '0 13px',
                  color: '#334155',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              />
              <button type="button" onClick={handleAddPinnedLocation} disabled={!canAddPinnedLocation} style={{ minHeight: compactRowControlHeight, borderRadius: 14, border: `1px solid ${servicesPrimary}`, background: canAddPinnedLocation ? servicesPrimary : '#f8fafc', color: canAddPinnedLocation ? '#fff' : '#94a3b8', padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: canAddPinnedLocation ? 'pointer' : 'not-allowed', boxShadow: canAddPinnedLocation ? '0 14px 28px rgba(15,118,110,0.18)' : 'none' }}>
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
                    themeHoverBg="#f0fdfa"
                    themeShadowColor="rgba(15,118,110,0.12)"
                    themeShadowColorSoft="rgba(15,118,110,0.08)"
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
