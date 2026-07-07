import React from 'react';
import { Maximize, Navigation, X } from 'lucide-react';

export function createAddressPinEditorRenderer(ctx) {
  const {
    DeliveryPinMap,
    accountAddressPinAction,
    applyAccountAddressPin,
    expandedAccountAddressMapMode,
    handleAccountAddressCurrentLocation,
    isMobileViewport,
    normalizeCoordinatePair,
    servicesBodyFont,
    servicesDisplayFont,
    setExpandedAccountAddressMapMode
  } = ctx;

  return ({ draft = {}, onChange, mode = 'address', renderFormRow = null }) => {
    const pin = normalizeCoordinatePair(draft);
    const isBusy = accountAddressPinAction.loading && accountAddressPinAction.mode === mode;
    const errorMessage = accountAddressPinAction.mode === mode ? accountAddressPinAction.error : '';
    const isExpanded = expandedAccountAddressMapMode === mode;
    const stopMapOverlayInteraction = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const useLocationButton = (
      <button
        type="button"
        onMouseDown={stopMapOverlayInteraction}
        onPointerDown={stopMapOverlayInteraction}
        onTouchStart={stopMapOverlayInteraction}
        onClick={(event) => {
          stopMapOverlayInteraction(event);
          handleAccountAddressCurrentLocation({ onChange, mode });
        }}
        disabled={isBusy}
        style={{
          minHeight: 44,
          borderRadius: 12,
          border: `1px solid ${isBusy ? '#dbe5ee' : '#cbd5e1'}`,
          background: isBusy ? '#f8fafc' : '#ffffff',
          color: '#1e293b',
          padding: '0 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: isBusy ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
          pointerEvents: 'auto'
        }}
      >
        <Navigation size={15} />
        {isBusy ? 'Locating...' : 'Use Current Location'}
      </button>
    );
    const renderOverlayControls = () => (
      <>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 11 }}>
          {useLocationButton}
        </div>
        <button
          type="button"
          onMouseDown={stopMapOverlayInteraction}
          onPointerDown={stopMapOverlayInteraction}
          onTouchStart={stopMapOverlayInteraction}
          onClick={(event) => {
            stopMapOverlayInteraction(event);
            setExpandedAccountAddressMapMode(isExpanded ? '' : mode);
          }}
          aria-label={isExpanded ? 'Collapse address map' : 'Expand address map'}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 42,
            height: 42,
            borderRadius: 14,
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#334155',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
            pointerEvents: 'auto',
            cursor: 'pointer',
            zIndex: 11
          }}
        >
          {isExpanded ? <X size={18} /> : <Maximize size={18} />}
        </button>
      </>
    );

    return (
      <>
        <div style={{ display: 'grid', gap: 10, border: '1px solid #dbe5ee', borderRadius: 14, background: '#f8fafc', padding: 10 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><strong>Location Pin</strong><div style={{ fontSize: 12, color: '#64748b' }}>Pin your exact location on the map. The selected address will fill in below.</div></div>
          </div>
          <DeliveryPinMap
            pin={pin}
            onPinChange={(nextPin) => applyAccountAddressPin({ pin: nextPin, onChange, mode })}
            disabled={isBusy}
            height={180}
            highlighted={Boolean(pin)}
            overlayControls={renderOverlayControls()}
          />
          {typeof renderFormRow === 'function' ? renderFormRow({ isExpanded: false }) : null}
          {errorMessage ? <div style={{ fontSize: 12, color: '#b91c1c' }}>{errorMessage}</div> : null}
        </div>
        {isExpanded ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(15,23,42,0.46)', padding: isMobileViewport ? 12 : 24 }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                maxWidth: isMobileViewport ? '100%' : 'min(1280px, calc(100vw - 48px))',
                maxHeight: '100%',
                margin: '0 auto',
                overflow: 'hidden',
                borderRadius: isMobileViewport ? 18 : 22,
                background: '#fff',
                border: '1px solid #dbe5ee',
                boxShadow: '0 26px 60px rgba(15,23,42,0.22)',
                padding: isMobileViewport ? 16 : 20,
                display: 'grid',
                gridTemplateRows: 'auto minmax(0, 1fr) auto auto',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', fontFamily: servicesDisplayFont }}>Large Map</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Tap or drag the pin to select the exact address.</div>
                </div>
                <button type="button" onClick={() => setExpandedAccountAddressMapMode('')} style={{ minHeight: 40, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '0 14px', fontWeight: 700, cursor: 'pointer', fontFamily: servicesBodyFont }}>
                  Close
                </button>
              </div>
              <DeliveryPinMap
                pin={pin}
                onPinChange={(nextPin) => applyAccountAddressPin({ pin: nextPin, onChange, mode })}
                disabled={isBusy}
                height="100%"
                highlighted={Boolean(pin)}
                overlayControls={renderOverlayControls()}
              />
              {typeof renderFormRow === 'function' ? renderFormRow({ isExpanded: true }) : null}
              {errorMessage ? <div style={{ fontSize: 12, color: '#b91c1c' }}>{errorMessage}</div> : null}
            </div>
          </div>
        ) : null}
      </>
    );
  };
}
