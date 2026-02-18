/**
 * Tests for the production startup environment guard in server.js.
 *
 * The problem being solved:
 *   The fail-closed fix on verifyWebhookSignature (Finding 3.1) correctly rejects
 *   webhooks when PAYPAL_WEBHOOK_ID is missing in production. But that means a
 *   misconfigured deploy would silently break every payment renewal for real users —
 *   their subscription would never get extended even though they paid.
 *
 *   The startup guard catches this at deploy time instead of at runtime:
 *   if any required PayPal env var is missing in production, the server refuses
 *   to start and logs a CRITICAL error.
 *
 * Strategy:
 *   We cannot call startServer() in tests (it talks to a real DB and calls
 *   process.exit). Instead we extract and test the detection logic directly —
 *   the same filter expression used in server.js — to confirm it identifies
 *   the right missing variables under each condition.
 *
 * Scenarios:
 *   1. production + all vars present  → no missing vars  (server starts)
 *   2. production + PAYPAL_WEBHOOK_ID missing → detected (server would exit)
 *   3. production + PAYPAL_CLIENT_ID missing  → detected
 *   4. production + PAYPAL_CLIENT_SECRET missing → detected
 *   5. production + multiple vars missing      → all detected at once
 *   6. development + vars missing              → guard not active (not production)
 *   7. test        + vars missing              → guard not active
 */

const REQUIRED_PAYPAL_VARS = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_WEBHOOK_ID',
];

/**
 * Mirrors the detection logic from server.js startServer():
 *   const missing = requiredPaypalEnvVars.filter(k => !process.env[k]);
 *   if (missing.length > 0) process.exit(1)
 */
function detectMissingVars(env) {
    return REQUIRED_PAYPAL_VARS.filter(k => !env[k]);
}

function wouldExitInProduction(env) {
    if (env.NODE_ENV !== 'production') return false;
    return detectMissingVars(env).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Production startup env guard — PayPal variable detection', () => {

    it('1. production + all vars present — no missing vars detected', () => {
        const env = {
            NODE_ENV:               'production',
            PAYPAL_CLIENT_ID:       'real-client-id',
            PAYPAL_CLIENT_SECRET:   'real-secret',
            PAYPAL_WEBHOOK_ID:      'WH-REAL-ID',
        };
        expect(detectMissingVars(env)).toHaveLength(0);
        expect(wouldExitInProduction(env)).toBe(false);
    });

    it('2. production + PAYPAL_WEBHOOK_ID missing — detected', () => {
        const env = {
            NODE_ENV:               'production',
            PAYPAL_CLIENT_ID:       'real-client-id',
            PAYPAL_CLIENT_SECRET:   'real-secret',
            // PAYPAL_WEBHOOK_ID intentionally absent
        };
        const missing = detectMissingVars(env);
        expect(missing).toContain('PAYPAL_WEBHOOK_ID');
        expect(wouldExitInProduction(env)).toBe(true);
    });

    it('3. production + PAYPAL_CLIENT_ID missing — detected', () => {
        const env = {
            NODE_ENV:               'production',
            // PAYPAL_CLIENT_ID intentionally absent
            PAYPAL_CLIENT_SECRET:   'real-secret',
            PAYPAL_WEBHOOK_ID:      'WH-REAL-ID',
        };
        const missing = detectMissingVars(env);
        expect(missing).toContain('PAYPAL_CLIENT_ID');
        expect(wouldExitInProduction(env)).toBe(true);
    });

    it('4. production + PAYPAL_CLIENT_SECRET missing — detected', () => {
        const env = {
            NODE_ENV:               'production',
            PAYPAL_CLIENT_ID:       'real-client-id',
            // PAYPAL_CLIENT_SECRET intentionally absent
            PAYPAL_WEBHOOK_ID:      'WH-REAL-ID',
        };
        const missing = detectMissingVars(env);
        expect(missing).toContain('PAYPAL_CLIENT_SECRET');
        expect(wouldExitInProduction(env)).toBe(true);
    });

    it('5. production + all three vars missing — all three detected at once', () => {
        const env = { NODE_ENV: 'production' };
        const missing = detectMissingVars(env);
        expect(missing).toEqual(expect.arrayContaining(REQUIRED_PAYPAL_VARS));
        expect(missing).toHaveLength(3);
        expect(wouldExitInProduction(env)).toBe(true);
    });

    it('6. development + PAYPAL_WEBHOOK_ID missing — guard is not active', () => {
        const env = {
            NODE_ENV:               'development',
            PAYPAL_CLIENT_ID:       'test-client',
            PAYPAL_CLIENT_SECRET:   'test-secret',
            // PAYPAL_WEBHOOK_ID absent — this is fine in dev
        };
        // detectMissingVars would find it, but the guard only fires in production
        expect(wouldExitInProduction(env)).toBe(false);
    });

    it('7. test env + vars missing — guard is not active', () => {
        const env = { NODE_ENV: 'test' };
        expect(wouldExitInProduction(env)).toBe(false);
    });
});
