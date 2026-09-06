import { useCallback, useState } from 'react';
import { useStoreRoute } from '../../../hooks/useStoreRoute.js';
import { STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY } from '../../../theme/storefrontStyleTokens.js';

const ETA_FONT_SIZE = STOREFRONT_BUSINESS_INFORMATION_TYPOGRAPHY.desktop.metadata;

/**
 * Shows an in-app driving distance/ETA to the store, resolved on demand
 * (click) rather than requesting geolocation passively on page load. Sits
 * next to the existing "Get directions" external-maps link, which keeps
 * working unchanged as the primary navigation action.
 */
export function StorefrontDirectionsEta({ latitude, longitude, bodyFont }) {
  const [origin, setOrigin] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  const destination = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;

  const { distanceKm, durationMinutes, loading: routeLoading, error: routeError } = useStoreRoute({
    origin,
    destination,
    enabled: Boolean(origin && destination)
  });

  const handleLocate = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!navigator?.geolocation) {
      setLocateError('Location is not supported on this device/browser.');
      return;
    }
    setLocateError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocateError('Unable to get your current location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  if (!destination) return null;

  if (!origin && !locating) {
    return (
      <button
        type="button"
        onClick={handleLocate}
        style={{ padding: 0, border: 'none', background: 'transparent', color: '#64748b', fontSize: ETA_FONT_SIZE, fontWeight: 700, cursor: 'pointer', justifySelf: 'start', fontFamily: bodyFont }}
      >
        {locateError || 'How far is this from me?'}
      </button>
    );
  }

  if (locating || routeLoading) {
    return <div style={{ fontSize: ETA_FONT_SIZE, color: '#94a3b8', fontFamily: bodyFont }}>Calculating distance…</div>;
  }

  if (routeError || !Number.isFinite(distanceKm)) {
    return null;
  }

  return (
    <div style={{ fontSize: ETA_FONT_SIZE, color: '#64748b', fontWeight: 700, fontFamily: bodyFont }}>
      {distanceKm.toFixed(1)} km · {durationMinutes} min drive
    </div>
  );
}
