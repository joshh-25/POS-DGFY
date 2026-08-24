import React from 'react';
import { CheckCircle2, Navigation } from 'lucide-react';
import { DEFAULT_CENTER } from '../../../app/runtime/storefrontMapRuntime.js';

export function createAddressPinEditorRenderer(ctx) {
  const {
    DeliveryPinMap,
    accountAddressPinAction,
    applyAccountAddressPin,
    handleAccountAddressCurrentLocation,
    isMobileViewport,
    normalizeCoordinatePair
  } = ctx;

  return function AddressPinEditorRenderer({ draft = {}, onChange, mode = 'address', renderFormRow = null, showDefaultAddressNote = false }) {
    const storedPin = normalizeCoordinatePair(draft);
    const pin = storedPin || DEFAULT_CENTER;
    const isBusy = accountAddressPinAction.loading && accountAddressPinAction.mode === mode;
    const errorMessage = accountAddressPinAction.mode === mode ? accountAddressPinAction.error : '';
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
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 11 }}>
        {useLocationButton}
      </div>
    );

    return (
      <>
        <div style={{ display: 'grid', gap: isMobileViewport ? 8 : 10, border: '1px solid #dbe5ee', borderRadius: 12, background: '#f8fafc', padding: isMobileViewport ? 8 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <strong>Location Pin</strong>
              {!isMobileViewport && <div style={{ fontSize: 12, color: '#64748b' }}>Pin your exact location on the map. The selected address will fill in below.</div>}
            </div>
            {showDefaultAddressNote && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, padding: '7px 11px', background: '#afe8f4', color: '#1a4e8d', fontSize: 11, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                This will be set as your default address automatically.
              </div>
            )}
          </div>
          <DeliveryPinMap
            pin={pin}
            onPinChange={(nextPin) => applyAccountAddressPin({ pin: nextPin, onChange, mode })}
            disabled={isBusy}
            height={isMobileViewport ? 'clamp(220px, 34svh, 320px)' : 'clamp(300px, 48vh, 460px)'}
            highlighted={Boolean(storedPin)}
            pinInstruction="Drag to pin location"
            showAttributionControl={false}
            overlayControls={renderOverlayControls()}
          />
          {typeof renderFormRow === 'function' ? renderFormRow({ isExpanded: false }) : null}
          {errorMessage ? <div style={{ fontSize: 12, color: '#b91c1c' }}>{errorMessage}</div> : null}
        </div>
      </>
    );
  };
}
