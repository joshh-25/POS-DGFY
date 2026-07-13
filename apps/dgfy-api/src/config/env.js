import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

export const PORT = Number.parseInt(process.env.PORT || '5100', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DGFY_BACKEND_BASE_URL = (
    process.env.DGFY_BACKEND_BASE_URL
    || (NODE_ENV === 'production' ? 'http://backend:5000' : 'http://localhost:5000')
).replace(/\/+$/, '');

// --- PayMongo QR Ph commerce payments config (Phase 10 Plan 05, D-01) ---
//
// Mirrors backend/src/services/paymongoService.js's mode-aware secret
// resolution (test vs live keys), re-implemented here rather than imported
// — apps/dgfy-api never imports backend/ code (v2.0 Commerce Domain
// zero-touch constraint). See modules/commercePayments/services/
// payMongoClient.js for the fetch-based client that consumes this config.
//
// D-02 (split excision): deliberately NO `PAYMONGO_DGFY_MERCHANT_ID` /
// `COMMERCE_PAYMONGO_SPLIT_ENABLED` here — a single DGFY account collects
// the full order amount this phase. Re-adding split later is a
// provider-side arg on createPaymentIntent, not a config/schema addition.
export const PAYMONGO_MODE = process.env.PAYMONGO_MODE === 'live' ? 'live' : 'test';

const resolveModeAwareSecret = (baseVar, testVar, liveVar) => (
    PAYMONGO_MODE === 'live'
        ? (process.env[liveVar] || process.env[baseVar] || null)
        : (process.env[testVar] || process.env[baseVar] || null)
);

export const PAYMONGO_SECRET_KEY = resolveModeAwareSecret(
    'PAYMONGO_SECRET_KEY',
    'PAYMONGO_TEST_SECRET_KEY',
    'PAYMONGO_LIVE_SECRET_KEY'
);

export const PAYMONGO_WEBHOOK_SECRET = resolveModeAwareSecret(
    'PAYMONGO_WEBHOOK_SECRET',
    'PAYMONGO_TEST_WEBHOOK_SECRET',
    'PAYMONGO_LIVE_WEBHOOK_SECRET'
);

export const PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = Number.parseInt(
    process.env.PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS || '300',
    10
);

export const PAYMONGO_API_BASE_URL = (
    process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1'
).replace(/\/+$/, '');

// Feature flags — both default OFF (matches
// backend/src/config/commercePaymentsFeature.js's `=== 'true'` convention).
// COMMERCE_PAYMENTS_ENABLED gates the whole commerce-payments surface;
// COMMERCE_QRPH_ENABLED gates the QR Ph rail specifically (future rails can
// be added without re-flagging the whole surface).
export const COMMERCE_PAYMENTS_ENABLED = process.env.COMMERCE_PAYMENTS_ENABLED === 'true';
export const COMMERCE_QRPH_ENABLED = process.env.COMMERCE_QRPH_ENABLED === 'true';

/**
 * Reports whether QR Ph payment-session creation is safely configured.
 * Returns { configured, missing } (never a bare boolean) so callers
 * (createQrphSessionUseCases.js) can surface exactly which env vars/flags
 * are absent in a 503 response, instead of a generic "unavailable" message.
 * @returns {{configured: boolean, missing: string[]}}
 */
export const requireCommerceQrphConfig = () => {
    const missing = [];
    if (!COMMERCE_PAYMENTS_ENABLED) missing.push('COMMERCE_PAYMENTS_ENABLED');
    if (!COMMERCE_QRPH_ENABLED) missing.push('COMMERCE_QRPH_ENABLED');
    if (!PAYMONGO_SECRET_KEY) missing.push('PAYMONGO_SECRET_KEY');
    return { configured: missing.length === 0, missing };
};
