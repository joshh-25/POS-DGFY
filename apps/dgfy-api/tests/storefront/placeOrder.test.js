import { jest } from '@jest/globals';
import { ApplicationResult } from '../../src/shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../src/shared/contracts/domainErrors.js';
import { buildPlaceOrderUseCase } from '../../src/modules/storefront/usecases/placeOrderUseCases.js';
import { buildGetOrderStatusUseCase } from '../../src/modules/storefront/usecases/getOrderStatusUseCases.js';

// 10-06-PLAN.md Task 2 (TDD): placeOrder orchestration (durable-first ->
// reserve -> session) + getOrderStatus. Every collaborator (validateCart,
// resolveCheckoutIdentity, orderRepository, reserveStock/releaseReservation/
// setReservationExpiry, createQrphSession, finalizeCashOrder) is mocked —
// this exercises ONLY the orchestration seam's own D-10 ordering and
// failure-handling logic, mirroring createQrphSession.test.js's
// mocked-collaborator convention.

class TenantDatabaseUnavailableError extends Error {
    constructor(reason = 'unreachable', message = 'Unable to reach the tenant database for this business.') {
        super(message);
        this.name = 'TenantDatabaseUnavailableError';
        this.reason = reason;
    }
}

class InsufficientStockError extends Error {
    constructor(message = 'Insufficient stock.') {
        super(message);
        this.name = 'InsufficientStockError';
    }
}

class SequelizeUniqueConstraintError extends Error {
    constructor() {
        super('Validation error');
        this.name = 'SequelizeUniqueConstraintError';
    }
}

const NOW = new Date('2026-07-15T10:00:00.000Z');

const makeNormalizedLines = () => ([
    { product_id: 1, name: 'Widget', quantity: 2, unit_price_centavos: 5000, line_total_centavos: 10000 }
]);

const makeValidateCart = (overrides = {}) => jest.fn().mockImplementation(async () => ApplicationResult.success({
    normalizedLines: makeNormalizedLines(),
    totalCentavos: 10000,
    ...overrides
}));

const makeResolveCheckoutIdentity = (data = { guest_identity_id: 'guest-1' }) => jest.fn()
    .mockResolvedValue(ApplicationResult.success(data));

const makeOrderRow = (overrides = {}) => ({
    id: 'order-uuid-1',
    public_reference: 'SFO-TESTORDER01',
    tenant_id: 'business-uuid-1',
    target_type: 'storefront_checkout',
    idempotency_key: 'idem-key-12345678',
    request_hash: null,
    status: 'pending_payment',
    ...overrides
});

const makeOrderRepository = (overrides = {}) => ({
    findByIdempotency: jest.fn().mockResolvedValue(null),
    createOrder: jest.fn().mockImplementation(async (payload) => makeOrderRow(payload)),
    updateOrder: jest.fn().mockImplementation(async (id, patch) => makeOrderRow({ id, ...patch })),
    findByPublicReference: jest.fn().mockResolvedValue(null),
    ...overrides
});

const makeCreateQrphSession = (overrides = {}) => jest.fn().mockResolvedValue(ApplicationResult.success({
    session_public_reference: 'CPS-TESTSESSION1',
    qr_code_image_url: 'https://paymongo.example/qr/pi_abc123.png',
    expires_at: new Date('2026-07-15T10:30:00.000Z'),
    amount_centavos: 10000,
    ...overrides
}));

const baseInput = (overrides = {}) => ({
    businessId: 'business-uuid-1',
    idempotencyKey: 'idem-key-12345678',
    guestIdentityId: 'guest-1',
    lines: [{ productId: 1, quantity: 2 }],
    fulfillmentMode: 'pickup',
    fulfillmentTiming: 'immediate',
    paymentMethod: 'gcash',
    contact: { name: 'Test Customer', phone: '09171234567' },
    now: NOW,
    ...overrides
});

const buildDeps = (overrides = {}) => ({
    validateCart: makeValidateCart(),
    resolveCheckoutIdentity: makeResolveCheckoutIdentity(),
    orderRepository: makeOrderRepository(),
    reserveStock: jest.fn().mockResolvedValue({ reservations: [{ id: 1, product_id: 1, quantity: 2 }] }),
    releaseReservation: jest.fn().mockResolvedValue(1),
    setReservationExpiry: jest.fn().mockResolvedValue(1),
    createQrphSession: makeCreateQrphSession(),
    ...overrides
});

describe('buildPlaceOrderUseCase construction', () => {
    it('throws when a required dependency is missing', () => {
        expect(() => buildPlaceOrderUseCase({})).toThrow(/requires a validateCart/);
        expect(() => buildPlaceOrderUseCase({ validateCart: jest.fn() })).toThrow(/requires a resolveCheckoutIdentity/);
    });
});

describe('placeOrder — happy PayMongo (gcash) path (D-08, D-10, STF-05)', () => {
    it('records the durable order BEFORE reserving stock, reserves BEFORE creating the session, and re-stamps the shared expires_at on both the reservation and the order', async () => {
        const deps = buildDeps();
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isSuccess).toBe(true);
        expect(result.data.status).toBe('awaiting_payment');
        expect(result.data.qr_code_image_url).toBe('https://paymongo.example/qr/pi_abc123.png');
        expect(result.data.expires_at).toEqual(new Date('2026-07-15T10:30:00.000Z'));

        // Ordering: createOrder -> reserveStock -> createQrphSession
        const createOrderCallOrder = deps.orderRepository.createOrder.mock.invocationCallOrder[0];
        const reserveStockCallOrder = deps.reserveStock.mock.invocationCallOrder[0];
        const sessionCallOrder = deps.createQrphSession.mock.invocationCallOrder[0];
        expect(createOrderCallOrder).toBeLessThan(reserveStockCallOrder);
        expect(reserveStockCallOrder).toBeLessThan(sessionCallOrder);

        // Order created with status pending_payment BEFORE any tenant write.
        expect(deps.orderRepository.createOrder).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending_payment',
            tenant_id: 'business-uuid-1',
            guest_identity_id: 'guest-1',
            customer_account_id: null,
            total_centavos: 10000
        }));

        // Reservation carries a fallback hold-TTL (never open-ended, D-09).
        expect(deps.reserveStock).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'business-uuid-1',
            referenceId: expect.any(String),
            lines: [{ productId: 1, quantity: 2 }]
        }));
        const reserveCallArgs = deps.reserveStock.mock.calls[0][0];
        expect(reserveCallArgs.expiresAt).toBeInstanceOf(Date);
        expect(reserveCallArgs.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());

        // D-08: the SAME expires_at from the session is re-stamped onto the reservation.
        expect(deps.setReservationExpiry).toHaveBeenCalledWith(
            'business-uuid-1',
            reserveCallArgs.referenceId,
            new Date('2026-07-15T10:30:00.000Z')
        );

        // Order transitions to awaiting_payment carrying the same shared expires_at.
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith(
            'order-uuid-1',
            { status: 'awaiting_payment', expires_at: new Date('2026-07-15T10:30:00.000Z') }
        );

        // No release/failure cleanup on the happy path.
        expect(deps.releaseReservation).not.toHaveBeenCalled();
    });
});

describe('placeOrder — reserve fail-fast (D-10)', () => {
    it('maps TenantDatabaseUnavailableError to 503, marks the order failed, and never calls createQrphSession', async () => {
        const deps = buildDeps({
            reserveStock: jest.fn().mockRejectedValue(new TenantDatabaseUnavailableError('unreachable'))
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(503);
        expect(deps.createQrphSession).not.toHaveBeenCalled();
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'failed' });
    });

    it('maps InsufficientStockError to a 409 conflict', async () => {
        const deps = buildDeps({
            reserveStock: jest.fn().mockRejectedValue(new InsufficientStockError('Insufficient stock for product 1.'))
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(409);
        expect(result.error.details).toEqual(expect.objectContaining({ error_code: 'INSUFFICIENT_STOCK' }));
        expect(deps.createQrphSession).not.toHaveBeenCalled();
    });
});

describe('placeOrder — session-failure path (D-09 no orphaned hold)', () => {
    it('releases the reservation and marks the order failed when createQrphSession returns a failure result', async () => {
        const sessionFailure = ApplicationResult.failure(new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'PayMongo rejected the request.',
            { statusCode: 503 }
        ));
        const deps = buildDeps({
            createQrphSession: jest.fn().mockResolvedValue(sessionFailure)
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(503);
        expect(deps.releaseReservation).toHaveBeenCalledWith('business-uuid-1', expect.any(String));
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'failed' });
        expect(deps.setReservationExpiry).not.toHaveBeenCalled();
    });

    it('releases the reservation and marks the order failed when createQrphSession THROWS, then re-throws', async () => {
        const thrown = new Error('unexpected PayMongo client crash');
        const deps = buildDeps({
            createQrphSession: jest.fn().mockRejectedValue(thrown)
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        await expect(placeOrder(baseInput())).rejects.toThrow('unexpected PayMongo client crash');
        expect(deps.releaseReservation).toHaveBeenCalledWith('business-uuid-1', expect.any(String));
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'failed' });
    });
});

describe('placeOrder — idempotent replay (D-04)', () => {
    it('safely replays when idempotency_key + identical payload was already used', async () => {
        const input = baseInput();
        const normalizedPayload = {
            businessId: input.businessId,
            lines: input.lines,
            fulfillmentMode: input.fulfillmentMode,
            fulfillmentTiming: input.fulfillmentTiming,
            requestedFor: null,
            paymentMethod: input.paymentMethod,
            contact: input.contact
        };
        // eslint-disable-next-line global-require
        const { computeRequestHash } = await import('../../src/modules/storefront/repositories/storefrontOrderRepository.js');
        const existingHash = computeRequestHash(normalizedPayload);

        const deps = buildDeps({
            orderRepository: makeOrderRepository({
                findByIdempotency: jest.fn().mockResolvedValue(makeOrderRow({
                    request_hash: existingHash,
                    status: 'awaiting_payment'
                }))
            })
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(input);

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual({
            order_reference: 'SFO-TESTORDER01',
            status: 'awaiting_payment',
            idempotent_replay: true
        });
        expect(deps.validateCart).not.toHaveBeenCalled();
        expect(deps.reserveStock).not.toHaveBeenCalled();
    });

    it('returns 409 when idempotency_key was reused with a DIFFERENT payload', async () => {
        const deps = buildDeps({
            orderRepository: makeOrderRepository({
                findByIdempotency: jest.fn().mockResolvedValue(makeOrderRow({ request_hash: 'a-completely-different-hash' }))
            })
        });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(409);
        expect(deps.validateCart).not.toHaveBeenCalled();
    });

    it('re-resolves a lost-guard race on createOrder to the winner row (replay)', async () => {
        // Pre-compute the expected hash so the winner row matches it exactly.
        const input = baseInput();
        const { computeRequestHash } = await import('../../src/modules/storefront/repositories/storefrontOrderRepository.js');
        const winnerHash = computeRequestHash({
            businessId: input.businessId,
            lines: input.lines,
            fulfillmentMode: input.fulfillmentMode,
            fulfillmentTiming: input.fulfillmentTiming,
            requestedFor: null,
            paymentMethod: input.paymentMethod,
            contact: input.contact
        });
        const winner = makeOrderRow({ status: 'pending_payment', request_hash: winnerHash });

        const orderRepository = makeOrderRepository({
            createOrder: jest.fn().mockRejectedValue(new SequelizeUniqueConstraintError()),
            findByIdempotency: jest.fn()
                .mockResolvedValueOnce(null) // first lookup (step 0): no existing order yet
                .mockResolvedValueOnce(winner) // second lookup (after the race): the winner's row
        });

        const deps = buildDeps({ orderRepository });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(input);

        expect(result.isSuccess).toBe(true);
        expect(result.data.idempotent_replay).toBe(true);
        expect(deps.reserveStock).not.toHaveBeenCalled();
    });
});

describe('placeOrder — cash immediate-finalize path ([ASSUMED A3])', () => {
    it('finalizes immediately via the injected finalizeCashOrder and returns a finalized status', async () => {
        const finalizeCashOrder = jest.fn().mockResolvedValue(ApplicationResult.success({
            availment: { id: 42 },
            payment: { id: 7 },
            idempotent: false
        }));
        const deps = buildDeps({ finalizeCashOrder });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput({ paymentMethod: 'cash' }));

        expect(result.isSuccess).toBe(true);
        expect(result.data).toEqual({ order_reference: expect.stringMatching(/^SFO-[A-Z0-9]{10}$/), status: 'finalized' });
        expect(deps.createQrphSession).not.toHaveBeenCalled();
        expect(finalizeCashOrder).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'business-uuid-1',
            paymentMethod: 'cash',
            totalCentavos: 10000,
            lines: [expect.objectContaining({ productId: 1, quantity: 2, unitPrice: '50.0000' })]
        }));
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', {
            status: 'finalized',
            availment_id: 42
        });
        expect(deps.releaseReservation).not.toHaveBeenCalled();
    });

    it('releases the reservation and marks the order failed when finalizeCashOrder fails', async () => {
        const finalizeFailure = ApplicationResult.failure(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'boom'));
        const deps = buildDeps({ finalizeCashOrder: jest.fn().mockResolvedValue(finalizeFailure) });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput({ paymentMethod: 'cash' }));

        expect(result.isFailure).toBe(true);
        expect(deps.releaseReservation).toHaveBeenCalledWith('business-uuid-1', expect.any(String));
        expect(deps.orderRepository.updateOrder).toHaveBeenCalledWith('order-uuid-1', { status: 'failed' });
    });

    it('fails closed with 503 when no finalizeCashOrder is injected (isolated testing / pre-10-08 composition)', async () => {
        const deps = buildDeps(); // no finalizeCashOrder
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput({ paymentMethod: 'cash' }));

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(503);
        expect(result.error.details).toEqual(expect.objectContaining({ error_code: 'CASH_FINALIZE_UNAVAILABLE' }));
        expect(deps.releaseReservation).toHaveBeenCalledWith('business-uuid-1', expect.any(String));
    });
});

describe('placeOrder — input validation', () => {
    it('rejects a missing businessId', async () => {
        const deps = buildDeps();
        const placeOrder = buildPlaceOrderUseCase(deps);
        const result = await placeOrder(baseInput({ businessId: undefined }));
        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(400);
    });

    it('rejects a short/missing idempotency_key', async () => {
        const deps = buildDeps();
        const placeOrder = buildPlaceOrderUseCase(deps);
        const result = await placeOrder(baseInput({ idempotencyKey: 'short' }));
        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(400);
    });

    it('rejects an invalid payment_method', async () => {
        const deps = buildDeps();
        const placeOrder = buildPlaceOrderUseCase(deps);
        const result = await placeOrder(baseInput({ paymentMethod: 'bitcoin' }));
        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(400);
    });

    it('propagates a validateCart failure without creating an order', async () => {
        const cartFailure = ApplicationResult.failure(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Product not found.'));
        const deps = buildDeps({ validateCart: jest.fn().mockResolvedValue(cartFailure) });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(deps.orderRepository.createOrder).not.toHaveBeenCalled();
    });

    it('propagates a resolveCheckoutIdentity failure without creating an order', async () => {
        const identityFailure = ApplicationResult.failure(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Verification required.'));
        const deps = buildDeps({ resolveCheckoutIdentity: jest.fn().mockResolvedValue(identityFailure) });
        const placeOrder = buildPlaceOrderUseCase(deps);

        const result = await placeOrder(baseInput());

        expect(result.isFailure).toBe(true);
        expect(deps.orderRepository.createOrder).not.toHaveBeenCalled();
    });

    it('rejects an out-of-business-hours scheduled request WITHOUT creating an order or reserving stock', async () => {
        const deps = buildDeps();
        const placeOrder = buildPlaceOrderUseCase(deps);

        const narrowHours = {
            timezone: 'UTC',
            weekly: {
                sun: { enabled: false, intervals: [] }, mon: { enabled: false, intervals: [] },
                tue: { enabled: false, intervals: [] }, wed: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
                thu: { enabled: false, intervals: [] }, fri: { enabled: false, intervals: [] }, sat: { enabled: false, intervals: [] }
            }
        };
        const result = await placeOrder(baseInput({
            fulfillmentTiming: 'scheduled',
            requestedFor: new Date('2026-07-15T22:00:00.000Z').toISOString(),
            businessHours: narrowHours
        }));

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(422);
        expect(deps.orderRepository.createOrder).not.toHaveBeenCalled();
        expect(deps.reserveStock).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// getOrderStatus (STF-05 consumer read, IDOR-safe)
// ---------------------------------------------------------------------------

describe('getOrderStatus (T-10-06-05 IDOR guard)', () => {
    it('throws at construction time without an orderRepository', () => {
        expect(() => buildGetOrderStatusUseCase({})).toThrow(/requires an orderRepository/);
    });

    it('rejects a missing reference', async () => {
        const getOrderStatus = buildGetOrderStatusUseCase({ orderRepository: makeOrderRepository() });
        const result = await getOrderStatus({ reference: '' });
        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(400);
    });

    it('returns 404 for an unknown reference', async () => {
        const orderRepository = makeOrderRepository({ findByPublicReference: jest.fn().mockResolvedValue(null) });
        const getOrderStatus = buildGetOrderStatusUseCase({ orderRepository });
        const result = await getOrderStatus({ reference: 'SFO-NOTFOUND01' });
        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(404);
    });

    it('returns status for an account-linked order by opaque reference alone', async () => {
        const orderRepository = makeOrderRepository({
            findByPublicReference: jest.fn().mockResolvedValue(makeOrderRow({
                customer_account_id: 'account-1',
                guest_identity_id: null,
                status: 'awaiting_payment'
            }))
        });
        const getOrderStatus = buildGetOrderStatusUseCase({ orderRepository });
        const result = await getOrderStatus({ reference: 'SFO-TESTORDER01' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.order_reference).toBe('SFO-TESTORDER01');
        expect(result.data.status).toBe('awaiting_payment');
    });

    it('requires a matching requesterEmail for a guest-linked order', async () => {
        const orderRepository = makeOrderRepository({
            findByPublicReference: jest.fn().mockResolvedValue(makeOrderRow({ guest_identity_id: 'guest-1' }))
        });
        const guestIdentityRepository = { findByEmail: jest.fn().mockResolvedValue({ id: 'guest-1' }) };
        const getOrderStatus = buildGetOrderStatusUseCase({ orderRepository, guestIdentityRepository });

        const withoutEmail = await getOrderStatus({ reference: 'SFO-TESTORDER01' });
        expect(withoutEmail.isFailure).toBe(true);
        expect(withoutEmail.statusCode).toBe(403);

        const withEmail = await getOrderStatus({ reference: 'SFO-TESTORDER01', requesterEmail: 'guest@example.com' });
        expect(withEmail.isSuccess).toBe(true);
        expect(guestIdentityRepository.findByEmail).toHaveBeenCalledWith('guest@example.com');
    });

    it('rejects a mismatched requesterEmail for a guest-linked order (IDOR guard)', async () => {
        const orderRepository = makeOrderRepository({
            findByPublicReference: jest.fn().mockResolvedValue(makeOrderRow({ guest_identity_id: 'guest-1' }))
        });
        const guestIdentityRepository = { findByEmail: jest.fn().mockResolvedValue({ id: 'guest-DIFFERENT' }) };
        const getOrderStatus = buildGetOrderStatusUseCase({ orderRepository, guestIdentityRepository });

        const result = await getOrderStatus({ reference: 'SFO-TESTORDER01', requesterEmail: 'attacker@example.com' });

        expect(result.isFailure).toBe(true);
        expect(result.statusCode).toBe(403);
    });
});
