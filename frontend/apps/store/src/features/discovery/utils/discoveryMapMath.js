export const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => value * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + (Math.sin(dLon / 2) ** 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

export const getSpreadMarkerCoordinate = (lat, lng, index, total) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(index) || total <= 1) {
    return { latitude: lat, longitude: lng };
  }
  const ringPosition = index + 1;
  const angle = ((Math.PI * 2) / total) * ringPosition;
  const radiusDegrees = 0.00016 + Math.floor(index / 6) * 0.00005;
  const lngAdjustment = radiusDegrees * Math.cos(angle) / Math.max(Math.cos((lat * Math.PI) / 180), 0.35);
  const latAdjustment = radiusDegrees * Math.sin(angle);
  return {
    latitude: lat + latAdjustment,
    longitude: lng + lngAdjustment
  };
};
