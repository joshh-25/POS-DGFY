import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (raw, fallback) => {
    const text = String(raw ?? '').trim().toLowerCase();
    if (text === 'true') return true;
    if (text === 'false') return false;
    return fallback;
};

const parseInteger = (raw, fallback) => {
    const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const geocodeConfig = {
    baseUrl: (process.env.GEOCODE_QUADRUPER_BASE_URL || 'https://quadruper.com/geocode').replace(/\/+$/, ''),
    // Disabled by default under test so no suite can reach the network.
    enabled: parseBoolean(process.env.GEOCODE_QUADRUPER_ENABLED, process.env.NODE_ENV !== 'test'),
    timeoutMs: parseInteger(process.env.GEOCODE_QUADRUPER_TIMEOUT_MS, 2500),
    cacheTtlSeconds: parseInteger(process.env.GEO_GEOCODE_REDIS_CACHE_TTL_SECONDS, 900),
    // Documented full PH data extent. Applied as a hard filter, not a bias.
    phBbox: '114.20624,4.55472,126.60253,21.11770'
};
