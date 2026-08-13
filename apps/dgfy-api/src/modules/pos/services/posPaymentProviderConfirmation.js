import crypto from 'crypto';

const DEFAULT_MAX_SKEW_SECONDS = 5 * 60;

const normalizeSignature = (value) => String(value || '').trim().replace(/^sha256=/i, '').toLowerCase();
const normalizeTimestamp = (value) => value instanceof Date
    ? value.toISOString()
    : String(value || '').trim();

const buildCanonicalConfirmation = ({ session, allocation, payload }) => [
    String(session?.session_reference || session?.pos_payment_session_id || '').trim(),
    String(allocation?.pos_payment_allocation_id || '').trim(),
    String(allocation?.payment_provider || '').trim().toLowerCase(),
    String(allocation?.payment_reference || '').trim(),
    Number(allocation?.applied_amount || 0).toFixed(4),
    String(payload?.provider_event_id || '').trim(),
    normalizeTimestamp(payload?.provider_confirmed_at)
].join('|');

export const createPosPaymentProviderConfirmationVerifier = ({
    secret = process.env.POS_PAYMENT_CONFIRMATION_SECRET,
    maxSkewSeconds = DEFAULT_MAX_SKEW_SECONDS
} = {}) => async ({ session, allocation, payload = {} }) => {
    if (!secret || String(secret).length < 32) return { verified: false, reason: 'POS payment provider confirmation is not configured with a sufficiently strong secret.' };

    const providerEventId = String(payload.provider_event_id || '').trim();
    const providerConfirmedAt = normalizeTimestamp(payload.provider_confirmed_at);
    const suppliedSignature = normalizeSignature(payload.provider_signature);
    if (!providerEventId || !providerConfirmedAt || !suppliedSignature) {
        return { verified: false, reason: 'Provider confirmation evidence is incomplete.' };
    }

    const confirmedAt = Date.parse(providerConfirmedAt);
    if (!Number.isFinite(confirmedAt)) return { verified: false, reason: 'Provider confirmation timestamp is invalid.' };
    if (Math.abs(Date.now() - confirmedAt) > Number(maxSkewSeconds) * 1000) {
        return { verified: false, reason: 'Provider confirmation timestamp is outside the accepted window.' };
    }

    const expectedSignature = crypto
        .createHmac('sha256', String(secret))
        .update(buildCanonicalConfirmation({ session, allocation, payload }))
        .digest('hex');
    const suppliedBuffer = Buffer.from(suppliedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
        return { verified: false, reason: 'Provider confirmation signature is invalid.' };
    }

    return {
        verified: true,
        provider_event_id: providerEventId,
        provider_confirmed_at: new Date(confirmedAt)
    };
};

export const buildPosPaymentProviderConfirmationCanonical = buildCanonicalConfirmation;
