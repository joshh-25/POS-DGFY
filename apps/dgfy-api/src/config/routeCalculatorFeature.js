const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_PROFILE = 'car';

// The only profile currently configured on the live GraphHopper instance behind
// ROUTE_CALCULATOR_ENDPOINT. Reject anything else at validation time rather than
// forwarding it and getting an opaque GraphHopper 400 back.
export const ROUTE_CALCULATOR_SUPPORTED_PROFILES = Object.freeze([DEFAULT_PROFILE]);

export const routeCalculatorEndpoint = () => String(process.env.ROUTE_CALCULATOR_ENDPOINT || '').trim().replace(/\/+$/, '');

export const routeCalculatorEnabled = () => Boolean(routeCalculatorEndpoint());

export const routeCalculatorTimeoutMs = () => {
    const parsed = Number.parseInt(process.env.ROUTE_CALCULATOR_TIMEOUT_MS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

export const routeCalculatorDefaultProfile = () => {
    const configured = String(process.env.ROUTE_CALCULATOR_PROFILE || '').trim();
    return ROUTE_CALCULATOR_SUPPORTED_PROFILES.includes(configured) ? configured : DEFAULT_PROFILE;
};
