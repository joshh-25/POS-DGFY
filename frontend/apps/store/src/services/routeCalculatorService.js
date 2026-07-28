import { requestJson } from './requestJson.js';

const toFixedCoord = (value) => Number(value).toFixed(6);

export const getStoreRoute = async ({ origin, destination, profile = 'car' } = {}) => {
  const originLat = Number(origin?.latitude);
  const originLng = Number(origin?.longitude);
  const destLat = Number(destination?.latitude);
  const destLng = Number(destination?.longitude);
  if (![originLat, originLng, destLat, destLng].every(Number.isFinite)) {
    throw new Error('getStoreRoute requires finite origin/destination coordinates.');
  }

  const params = new URLSearchParams({
    origin_lat: toFixedCoord(originLat),
    origin_lng: toFixedCoord(originLng),
    dest_lat: toFixedCoord(destLat),
    dest_lng: toFixedCoord(destLng),
    profile
  });

  return requestJson(`/api/v1/storefront/route?${params.toString()}`, { method: 'GET', cache: 'default' });
};
