const EARTH_RADIUS_KM = 6371;

const toRadians = (value) => (value * Math.PI) / 180;

export const distanceKm = (first, second) => {
    const dLat = toRadians(second.latitude - first.latitude);
    const dLon = toRadians(second.longitude - first.longitude);
    const lat1 = toRadians(first.latitude);
    const lat2 = toRadians(second.latitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const distanceMeters = (first, second) => Math.round(distanceKm(first, second) * 1000);
