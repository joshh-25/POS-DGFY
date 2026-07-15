import { jest } from '@jest/globals';
import { buildCreateQrphSessionUseCase } from '../../src/modules/commercePayments/usecases/createQrphSessionUseCases.js';
import { PayMongoError, PayMongoServiceUnavailableError } from '../../src/modules/commercePayments/services/payMongoClient.js';

// Exercises 10-05-PLAN.md Task 2's <behavior> block at the usecase level
// (mirrors tests/unit/modules/shifts/shiftUseCases.test.js's
// mocked-collaborator convention): createQrphSession with the PayMongo
// client AND the repository mocked. Asserts metadata carries the order
// reference + tenant_id, the session persists with the shared expires_at,
// and no split payload is ever passed through.
//
// `checkQrphConfig` is always injected explicitly here (never relying on
// the real config/env.js gate + process.env), since config/env.js's
// exports are resolved once at module-load time (like every other
// env-driven constant in this codebase, e.g. NODE_ENV) — mutating
// process.env from a test file cannot retroactively change them. The
// dedicated "config is disabled" test below is what actually exercises
// that gate's wiring; every other test passes a stub that always reports
// `configured: true` so the gate never interferes with the behavior under
// test.

const makeOrder = (overrides = {}) => ({
    id: 'order-uuid-1',
    public_reference: 'SFO-TESTORDER01',
    tenant_id: 'tenant-uuid-1234-5678',
    total_centavos: 15000,
    ...overrides
});

const makePayMongoClient = (overrides = {}) => ({
    createQrphPaymentIntent: jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_abc123',
        paymentMethodId: 'pm_def456',
        qrCodeImageUrl: 'https://paymongo.example/qr/pi_abc123.png',
        expiresAt: new Date('2026-07-13T13:00:00.000Z')
    }),
    ...overrides
});

const makeRepository = (overrides = {}) => ({
    createSession: jest.fn().mockImplementation(async (payload) => ({
        id: 'session-uuid-1',
        public_reference: 'CPS-TESTSESSION1',
        storefront_order_id: payload.storefront_order_id,
        tenant_id: payload.tenant_id,
        status: 'awaiting_payment',
        provider: 'paymongo',
        provider_payment_intent_id: payload.provider_payment_intent_id,
        provider_payment_id: null,
        qr_code_image_url: payload.qr_code_image_url,
        amount_centavos: payload.amount_centavos,
        expires_at: payload.expires_at,
        split_payload: null,
        platform_fee_centavos: null
    })),
    ...overrides
});

const configuredGate = () => ({ configured: true, missing: [] });

describe('createQrphSession use case (STF-04, D-01, D-02)', () => {
    it('creates a QR Ph session with the shared expires_at and no split payload', async () => {
        const payMongoClient = makePayMongoClient();
        const repository = makeRepository();
        const order = makeOrder();

        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });
        const result = await createQrphSession({ order });

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual({
            session_public_reference: 'CPS-TESTSESSION1',
            qr_code_image_url: 'https://paymongo.example/qr/pi_abc123.png',
            expires_at: new Date('2026-07-13T13:00:00.000Z'),
            amount_centavos: 15000
        });

        // Persisted session carries the PayMongo intent's shared expires_at.
        expect(repository.createSession).toHaveBeenCalledWith(expect.objectContaining({
            storefront_order_id: 'order-uuid-1',
            tenant_id: 'tenant-uuid-1234-5678',
            amount_centavos: 15000,
            provider_payment_intent_id: 'pi_abc123',
            qr_code_image_url: 'https://paymongo.example/qr/pi_abc123.png',
            expires_at: new Date('2026-07-13T13:00:00.000Z')
        }));

        // No split payload is ever passed to the repository.
        const persistedPayload = repository.createSession.mock.calls[0][0];
        expect(persistedPayload).not.toHaveProperty('split_payload');
        expect(persistedPayload).not.toHaveProperty('platform_fee_centavos');
    });

    it('carries the order public_reference + UUID tenant_id in PayMongo metadata, with no split_payment arg', async () => {
        const payMongoClient = makePayMongoClient();
        const repository = makeRepository();
        const order = makeOrder({ tenant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });

        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });
        await createQrphSession({ order });

        expect(payMongoClient.createQrphPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
            amount: 15000,
            metadata: {
                commerce_payment_session: 'SFO-TESTORDER01',
                tenant_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
            }
        }));

        const callArgs = payMongoClient.createQrphPaymentIntent.mock.calls[0][0];
        expect(callArgs).not.toHaveProperty('splitPayment');
        expect(callArgs).not.toHaveProperty('split_payment');
        // tenant_id must never be coerced to a number anywhere on the call (Pitfall 7).
        expect(typeof callArgs.metadata.tenant_id).toBe('string');
    });

    it('fails validation when order.public_reference is missing', async () => {
        const payMongoClient = makePayMongoClient();
        const repository = makeRepository();
        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });

        const result = await createQrphSession({ order: makeOrder({ public_reference: undefined }) });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(payMongoClient.createQrphPaymentIntent).not.toHaveBeenCalled();
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('fails validation when order.total_centavos is not a positive integer', async () => {
        const payMongoClient = makePayMongoClient();
        const repository = makeRepository();
        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });

        const result = await createQrphSession({ order: makeOrder({ total_centavos: 0 }) });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(payMongoClient.createQrphPaymentIntent).not.toHaveBeenCalled();
    });

    it('maps a PayMongoServiceUnavailableError to a 503 SERVICE_UNAVAILABLE result without persisting a session', async () => {
        const payMongoClient = makePayMongoClient({
            createQrphPaymentIntent: jest.fn().mockRejectedValue(
                new PayMongoServiceUnavailableError('PayMongo is not configured (missing secret key).', { missing: ['PAYMONGO_SECRET_KEY'] })
            )
        });
        const repository = makeRepository();
        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });

        const result = await createQrphSession({ order: makeOrder() });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.statusCode).toBe(503);
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('maps a generic PayMongoError (provider rejected the request) to a 503 result without persisting a session', async () => {
        const payMongoClient = makePayMongoClient({
            createQrphPaymentIntent: jest.fn().mockRejectedValue(
                new PayMongoError('amount must be at least 10000', { statusCode: 400, providerError: { detail: 'amount must be at least 10000' } })
            )
        });
        const repository = makeRepository();
        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig: configuredGate });

        const result = await createQrphSession({ order: makeOrder() });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.statusCode).toBe(503);
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it('fails closed with 503 before calling PayMongo or persisting a session when commerce QR Ph config is disabled', async () => {
        const payMongoClient = makePayMongoClient();
        const repository = makeRepository();
        // checkQrphConfig is injectable specifically so this branch is
        // testable without mutating process.env after config/env.js has
        // already resolved its module-load-time constants.
        const checkQrphConfig = jest.fn().mockReturnValue({ configured: false, missing: ['COMMERCE_QRPH_ENABLED'] });

        const createQrphSession = buildCreateQrphSessionUseCase({ payMongoClient, repository, checkQrphConfig });
        const result = await createQrphSession({ order: makeOrder() });

        expect(result.isFailure).toBe(true);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.statusCode).toBe(503);
        expect(payMongoClient.createQrphPaymentIntent).not.toHaveBeenCalled();
        expect(repository.createSession).not.toHaveBeenCalled();
    });
});
