import { DeliveryPinMap } from '../../../../features/locations/components/DeliveryPinMap.jsx';

export function SimpleDeliveryPinPanel({
  customerPin = null,
  pinLocationError = '',
  pinLocationLoading = false,
  onClearPin,
  onPinChange,
  onPinMyLocation
}) {
  const hasPin = Boolean(customerPin);

  return (
    <div style={{ border: '1px solid #d9e4e8', borderRadius: 14, padding: 12, background: 'linear-gradient(180deg,#f8fffe 0%,#ffffff 100%)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Delivery Pin</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Optional, but recommended for faster handoff.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onPinMyLocation} disabled={pinLocationLoading} style={{ borderRadius: 12, border: '1px solid #0f766e', background: '#fff', color: '#0f766e', padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>
            {pinLocationLoading ? 'Pinning...' : 'Pin My Location'}
          </button>
          <button type="button" onClick={onClearPin} disabled={!hasPin} style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '8px 12px', fontWeight: 700, cursor: !hasPin ? 'not-allowed' : 'pointer' }}>
            Clear Pin
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '9px 12px' }}>
        {hasPin
          ? `Pinned at ${Number(customerPin.latitude).toFixed(6)}, ${Number(customerPin.longitude).toFixed(6)}`
          : 'No pin selected yet. Tap the map or use your current location.'}
      </div>
      <DeliveryPinMap pin={customerPin} onPinChange={onPinChange} disabled={false} />
      {pinLocationError && <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>{pinLocationError}</p>}
    </div>
  );
}
