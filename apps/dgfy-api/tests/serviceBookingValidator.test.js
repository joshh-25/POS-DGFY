import {
    validateCreateServiceBooking,
    validateCreateAdminServiceBooking,
    validateServiceAvailabilityQuery,
    validateCreateServiceBookingHold,
    validateCreateServiceBookingBatch,
    validateSettleServiceBooking
} from '../src/validators/serviceValidator.js';
import { jest } from '@jest/globals';

// Regression coverage for a production incident: the public storefront booking route
// (POST /api/v1/store/services/bookings) always sent idempotency_key, but the shared
// Joi schema did not declare it, so stripUnknown:true silently dropped it before
// assertStorefrontIdempotency() unconditionally required it -- every storefront
// booking submission 400'd. Fixing that also required splitting the schema so the
// public route can no longer accept pos_transaction_id (see serviceBookingValidator's
// sibling IDOR regression test in servicesMode.usecases.test.js), since that field
// must stay admin/POS-only.

const runMiddleware = (middleware, req) => {
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    const next = jest.fn();
    middleware(req, res, next);
    return { res, next };
};

const storefrontBookingBody = () => ({
    service_item_id: 10,
    start_at: '2026-08-01T09:00:00.000Z',
    customer_name: 'Jane Doe',
    customer_email: 'jane@example.com',
    customer_phone: '09171234567',
    location_id: 3,
    payment_timing: 'postpaid',
    intake_responses: null,
    idempotency_key: 'store-service-abc123-xyz',
    notes: null
});

describe('serviceValidator booking schemas', () => {
    describe('validateCreateServiceBooking (public storefront route)', () => {
        it('preserves idempotency_key through validation (400 regression)', () => {
            const req = { body: storefrontBookingBody() };
            const { res, next } = runMiddleware(validateCreateServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.idempotency_key).toBe('store-service-abc123-xyz');
        });

        it('preserves quantity and hold_token for multi-unit / held bookings', () => {
            const req = {
                body: {
                    ...storefrontBookingBody(),
                    quantity: 3,
                    hold_token: 'hold-token-abc'
                }
            };
            const { next } = runMiddleware(validateCreateServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.quantity).toBe(3);
            expect(req.validatedData.hold_token).toBe('hold-token-abc');
        });

        it('strips pos_transaction_id from the public schema (IDOR regression)', () => {
            const req = {
                body: {
                    ...storefrontBookingBody(),
                    pos_transaction_id: 999
                }
            };
            const { res, next } = runMiddleware(validateCreateServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.pos_transaction_id).toBeUndefined();
        });
    });

    describe('validateCreateAdminServiceBooking (admin/POS route)', () => {
        it('still accepts pos_transaction_id for trusted internal callers', () => {
            const req = {
                body: {
                    ...storefrontBookingBody(),
                    pos_transaction_id: 4242
                }
            };
            const { res, next } = runMiddleware(validateCreateAdminServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.pos_transaction_id).toBe(4242);
        });

        it('also accepts the core fields (idempotency_key, quantity, hold_token)', () => {
            const req = {
                body: {
                    ...storefrontBookingBody(),
                    quantity: 2,
                    hold_token: 'hold-token-xyz'
                }
            };
            const { next } = runMiddleware(validateCreateAdminServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.idempotency_key).toBe('store-service-abc123-xyz');
            expect(req.validatedData.quantity).toBe(2);
            expect(req.validatedData.hold_token).toBe('hold-token-xyz');
        });
    });

    describe('validateServiceAvailabilityQuery (GET /services/availability)', () => {
        it('accepts a minimal availability query', () => {
            const req = { query: { service_item_id: '10', date: '2026-08-01' } };
            const { res, next } = runMiddleware(validateServiceAvailabilityQuery, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedQuery.service_item_id).toBe(10);
            expect(req.validatedQuery.date).toBe('2026-08-01');
        });

        it('rejects a malformed date', () => {
            const req = { query: { service_item_id: '10', date: '08/01/2026' } };
            const { res, next } = runMiddleware(validateServiceAvailabilityQuery, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });
    });

    describe('validateCreateServiceBookingHold (POST /services/holds)', () => {
        it('accepts a hold request with no customer fields', () => {
            const req = {
                body: {
                    service_item_id: 10,
                    start_at: '2026-08-01T09:00:00.000Z',
                    quantity: 2,
                    idempotency_key: 'store-hold-abc123'
                }
            };
            const { res, next } = runMiddleware(validateCreateServiceBookingHold, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.quantity).toBe(2);
        });

        it('strips pos_transaction_id from a public hold request', () => {
            const req = {
                body: {
                    service_item_id: 10,
                    start_at: '2026-08-01T09:00:00.000Z',
                    pos_transaction_id: 999
                }
            };
            const { res, next } = runMiddleware(validateCreateServiceBookingHold, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.pos_transaction_id).toBeUndefined();
        });
    });

    describe('validateCreateServiceBookingBatch (POST /services/bookings/batch)', () => {
        it('accepts multiple booking drafts under one shared customer identity (ADR 0016 multiplicity)', () => {
            const req = {
                body: {
                    customer_name: 'Jane Doe',
                    customer_email: 'jane@example.com',
                    idempotency_key: 'store-service-batch-abc123',
                    bookings: [
                        { service_item_id: 10, start_at: '2026-08-01T09:00:00.000Z', quantity: 1 },
                        { service_item_id: 11, start_at: '2026-08-02T10:00:00.000Z', quantity: 3 }
                    ]
                }
            };
            const { res, next } = runMiddleware(validateCreateServiceBookingBatch, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.bookings).toHaveLength(2);
            expect(req.validatedData.bookings[1].quantity).toBe(3);
        });

        it('rejects an empty bookings array', () => {
            const req = {
                body: {
                    customer_name: 'Jane Doe',
                    customer_email: 'jane@example.com',
                    bookings: []
                }
            };
            const { res, next } = runMiddleware(validateCreateServiceBookingBatch, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });
    });

    describe('validateSettleServiceBooking (POST /services/bookings/:booking_id/settle)', () => {
        it('rejects settlement without shift, terminal, and location context', () => {
            const req = { body: {} };
            const { res, next } = runMiddleware(validateSettleServiceBooking, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });

        it('accepts a parts array for a labor + part settlement', () => {
            const req = {
                body: {
                    parts: [{ item_id: 55, quantity: 2 }],
                    payment_type: 'gcash',
                    shift_id: 77,
                    terminal_id: 'COUNTER-01',
                    location_id: 3
                }
            };
            const { res, next } = runMiddleware(validateSettleServiceBooking, req);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.statusCode).toBe(200);
            expect(req.validatedData.parts).toHaveLength(1);
            expect(req.validatedData.parts[0]).toEqual({ item_id: 55, quantity: 2 });
        });

        it('rejects a part missing a positive item_id', () => {
            const req = { body: { parts: [{ quantity: 2 }], shift_id: 77, terminal_id: 'COUNTER-01', location_id: 3 } };
            const { res, next } = runMiddleware(validateSettleServiceBooking, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });

        it('rejects an unsupported payment_type', () => {
            const req = { body: { payment_type: 'crypto', shift_id: 77, terminal_id: 'COUNTER-01', location_id: 3 } };
            const { res, next } = runMiddleware(validateSettleServiceBooking, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });

        it('rejects client-calculated change_amount', () => {
            const req = { body: { payment_type: 'cash', cash_received: 1000, change_amount: 250, shift_id: 77, terminal_id: 'COUNTER-01', location_id: 3 } };
            const { res, next } = runMiddleware(validateSettleServiceBooking, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });
    });
});
