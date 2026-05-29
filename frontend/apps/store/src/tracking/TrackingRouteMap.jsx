const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasCoordinate = (point) => (
  Number.isFinite(Number(point?.latitude))
  && Number.isFinite(Number(point?.longitude))
);

function PointBadge({ label, tone = 'store', title }) {
  const isStore = tone === 'store';
  const ring = isStore ? '#0F6FFF' : '#F97316';
  const shadow = isStore ? 'rgba(15,111,255,0.14)' : 'rgba(249,115,22,0.16)';

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, minWidth: 92 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: '#fff',
          border: `2px solid ${ring}`,
          boxShadow: `0 12px 24px ${shadow}`,
          color: ring,
          display: 'grid',
          placeItems: 'center',
          fontSize: 15,
          fontWeight: 900
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.96)',
          border: '1px solid #dbe5ee',
          boxShadow: '0 10px 24px rgba(15,23,42,.06)',
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: 'nowrap'
        }}
      >
        {title}
      </div>
    </div>
  );
}

export default function TrackingRouteMap({
  storePin = null,
  customerPin = null,
  mapHeight = 280
}) {
  const hasStorePin = hasCoordinate(storePin);
  const hasCustomerPin = hasCoordinate(customerPin);
  const isDeliveryPreview = hasCustomerPin;
  const rightTitle = isDeliveryPreview ? 'Your pin' : 'Point B';
  const footerText = isDeliveryPreview
    ? 'Simple delivery direction preview from point A to point B.'
    : 'Route preview is under development. Live tracking is not available yet.';

  return (
    <div
      style={{
        height: mapHeight,
        borderRadius: 20,
        border: '1px solid #dbe5ee',
        background: '#f8fafc',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.10) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          opacity: 0.85
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 24% 28%, rgba(15,111,255,0.08) 0, rgba(15,111,255,0.08) 72px, transparent 74px), radial-gradient(circle at 78% 74%, rgba(249,115,22,0.08) 0, rgba(249,115,22,0.08) 84px, transparent 86px)'
        }}
      />

      <div style={{ position: 'relative', height: '100%', width: '100%', padding: 24, display: 'grid' }}>
        <div style={{ alignSelf: 'center', justifySelf: 'center', width: '100%', maxWidth: 420, display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
            <PointBadge label="A" tone="store" title={hasStorePin ? 'Store' : 'Point A'} />
            <div style={{ flex: 1, minWidth: 86, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: '100%', borderTop: '4px dashed #94a3b8' }} />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '5px 10px',
                  borderRadius: 999,
                  background: '#fff',
                  border: '1px solid #dbe5ee',
                  color: '#64748b',
                  fontSize: 11,
                  fontWeight: 800,
                  whiteSpace: 'nowrap'
                }}
              >
                A to B
              </div>
            </div>
            <PointBadge label="B" tone="customer" title={rightTitle} />
          </div>
        </div>

        <div style={{ alignSelf: 'end', justifySelf: 'stretch', display: 'grid', gap: 10 }}>
          <div
            style={{
              justifySelf: 'start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.94)',
              border: '1px solid #dbe5ee',
              color: '#475569',
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {footerText}
          </div>
          <div
            style={{
              justifySelf: 'start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 999,
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              color: '#9a3412',
              fontSize: 12,
              fontWeight: 800
            }}
          >
            Route preview is under development
          </div>
        </div>
      </div>
    </div>
  );
}

export const extractTrackingMapCoordinates = (trackingResult, selectedStore, selectedLocation) => {
  const raw = trackingResult?.raw || {};
  const fromTracking = {
    storeLatitude: toNumberOrNull(trackingResult?.storeLatitude ?? raw?.location?.latitude ?? raw?.order?.location_latitude ?? raw?.order?.store_latitude),
    storeLongitude: toNumberOrNull(trackingResult?.storeLongitude ?? raw?.location?.longitude ?? raw?.order?.location_longitude ?? raw?.order?.store_longitude),
    customerLatitude: toNumberOrNull(trackingResult?.customerLatitude ?? raw?.delivery_latitude ?? raw?.order?.delivery_latitude),
    customerLongitude: toNumberOrNull(trackingResult?.customerLongitude ?? raw?.delivery_longitude ?? raw?.order?.delivery_longitude)
  };

  const fromSelection = {
    storeLatitude: toNumberOrNull(selectedLocation?.latitude ?? selectedStore?.latitude),
    storeLongitude: toNumberOrNull(selectedLocation?.longitude ?? selectedStore?.longitude)
  };

  return {
    storePin: (Number.isFinite(fromTracking.storeLatitude) && Number.isFinite(fromTracking.storeLongitude))
      ? { latitude: fromTracking.storeLatitude, longitude: fromTracking.storeLongitude }
      : (Number.isFinite(fromSelection.storeLatitude) && Number.isFinite(fromSelection.storeLongitude))
        ? { latitude: fromSelection.storeLatitude, longitude: fromSelection.storeLongitude }
        : null,
    customerPin: (Number.isFinite(fromTracking.customerLatitude) && Number.isFinite(fromTracking.customerLongitude))
      ? { latitude: fromTracking.customerLatitude, longitude: fromTracking.customerLongitude }
      : null
  };
};
