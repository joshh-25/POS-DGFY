import { useEffect, useRef, useState } from 'react';
import { getStoreRoute } from '../../services/routeCalculatorService.js';

const roundCoord = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(5) : '';
};

const buildSignature = (origin, destination) => (
  `${roundCoord(origin?.latitude)},${roundCoord(origin?.longitude)}` +
  `->${roundCoord(destination?.latitude)},${roundCoord(destination?.longitude)}`
);

const hasFiniteCoords = (point) => (
  Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))
);

const INITIAL_STATE = { distanceKm: null, durationMinutes: null, geometry: null, loading: false, error: '' };

/**
 * Fetches a real (road-network) route between the customer's current location
 * and a chosen store via the backend's GraphHopper proxy. Always degrades
 * gracefully on `error` — callers should fall back to whatever they already
 * render today (straight line / external maps link), never block on this.
 */
export function useStoreRoute({ origin, destination, enabled = true } = {}) {
  const [state, setState] = useState(INITIAL_STATE);
  const requestIdRef = useRef(0);
  const lastSignatureRef = useRef('');

  const originReady = hasFiniteCoords(origin);
  const destinationReady = hasFiniteCoords(destination);
  const signature = originReady && destinationReady ? buildSignature(origin, destination) : '';

  useEffect(() => {
    if (!enabled || !signature) {
      lastSignatureRef.current = '';
      setState(INITIAL_STATE);
      return;
    }
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;

    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: '' }));

    getStoreRoute({ origin, destination })
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          distanceKm: Number.isFinite(data?.distance_meters) ? data.distance_meters / 1000 : null,
          durationMinutes: Number.isFinite(data?.duration_seconds) ? Math.round(data.duration_seconds / 60) : null,
          geometry: data?.geometry || null,
          loading: false,
          error: ''
        });
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        setState({ ...INITIAL_STATE, error: error?.message || 'Unable to calculate route.' });
      });
  }, [enabled, signature, origin, destination]);

  return state;
}
