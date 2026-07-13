import { jest } from '@jest/globals';
import { validateFulfillment, isWithinBusinessHours } from '../../src/modules/storefront/usecases/schedulingValidation.js';
import {
    StorefrontOrderRepository,
    computeRequestHash,
    generateOrderPublicReference,
    isUniqueConstraintViolation
} from '../../src/modules/storefront/repositories/storefrontOrderRepository.js';

// 10-06-PLAN.md Task 1 (TDD): scheduling/fulfillment validator (STF-04,
// D-11..D-13) + the landlord storefront order repository's idempotency
// contract (STF-05, D-04). businessHours below use UTC ("timezone:'UTC'")
// so weekday/hour assertions are deterministic regardless of the CI
// runner's local timezone.

const ALWAYS_OPEN_HOURS = {
    timezone: 'UTC',
    weekly: {
        sun: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        mon: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        tue: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        wed: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        thu: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        fri: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] },
        sat: { enabled: true, intervals: [{ open: '00:00', close: '23:59' }] }
    }
};

// A narrow 09:00-17:00 UTC window, enabled every day.
const NARROW_HOURS = {
    timezone: 'UTC',
    weekly: {
        sun: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        mon: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        tue: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        wed: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        thu: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        fri: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] },
        sat: { enabled: true, intervals: [{ open: '09:00', close: '17:00' }] }
    }
};

// Fixed reference "now": Wednesday 2026-07-15T10:00:00.000Z, inside
// NARROW_HOURS's 09:00-17:00 window.
const NOW = new Date('2026-07-15T10:00:00.000Z');

describe('validateFulfillment (STF-04, D-11..D-13)', () => {
    it('rejects an invalid fulfillment_mode', () => {
        expect(() => validateFulfillment({
            fulfillmentMode: 'dine_in',
            fulfillmentTiming: 'immediate',
            now: NOW
        })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    });

    it('rejects an invalid fulfillment_timing', () => {
        expect(() => validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'whenever',
            now: NOW
        })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
    });

    it('immediate timing normalizes requestedFor to null, no bounds applied', () => {
        const result = validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'immediate',
            now: NOW
        });
        expect(result).toEqual({ requestedFor: null });
    });

    it('scheduled: requires requested_for', () => {
        expect(() => validateFulfillment({
            fulfillmentMode: 'delivery',
            fulfillmentTiming: 'scheduled',
            requestedFor: null,
            now: NOW
        })).toThrow(expect.objectContaining({
            code: 'VALIDATION_FAILED',
            details: expect.objectContaining({ reason_code: 'REQUESTED_FOR_REQUIRED' })
        }));
    });

    it('scheduled: rejects a malformed requested_for', () => {
        expect(() => validateFulfillment({
            fulfillmentMode: 'delivery',
            fulfillmentTiming: 'scheduled',
            requestedFor: 'not-a-date',
            now: NOW
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'INVALID_REQUESTED_FOR' })
        }));
    });

    it('scheduled: in-hours, above min-lead, within max-advance -> accepted, normalized requestedFor returned', () => {
        // NOW + 2h, inside NARROW_HOURS window, well above the 30-min default lead.
        const requestedFor = new Date('2026-07-15T12:00:00.000Z').toISOString();
        const result = validateFulfillment({
            fulfillmentMode: 'delivery',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: NARROW_HOURS,
            now: NOW
        });
        expect(result.requestedFor).toEqual(new Date('2026-07-15T12:00:00.000Z'));
    });

    it('scheduled: out-of-hours (outside the branch weekly window) is rejected', () => {
        // NOW + 12h -> 2026-07-15T22:00:00Z, outside NARROW_HOURS' 09:00-17:00 window.
        const requestedFor = new Date('2026-07-15T22:00:00.000Z').toISOString();
        expect(() => validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: NARROW_HOURS,
            now: NOW
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'OUTSIDE_BUSINESS_HOURS' })
        }));
    });

    it('scheduled: below the minimum lead time is rejected (default 30 min)', () => {
        // NOW + 10 minutes, still inside NARROW_HOURS' window, but below the 30-min default lead.
        const requestedFor = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
        expect(() => validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: ALWAYS_OPEN_HOURS,
            now: NOW
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'REQUESTED_FOR_BELOW_MIN_LEAD' })
        }));
    });

    it('scheduled: beyond the maximum advance window is rejected (default 14 days)', () => {
        const requestedFor = new Date(NOW.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();
        expect(() => validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: ALWAYS_OPEN_HOURS,
            now: NOW
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'REQUESTED_FOR_BEYOND_MAX_ADVANCE' })
        }));
    });

    it('scheduled: a non-future requested_for is rejected', () => {
        const requestedFor = new Date(NOW.getTime() - 60 * 1000).toISOString();
        expect(() => validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: ALWAYS_OPEN_HOURS,
            now: NOW
        })).toThrow(expect.objectContaining({
            details: expect.objectContaining({ reason_code: 'REQUESTED_FOR_NOT_FUTURE' })
        }));
    });

    it('honors env-configurable minLeadMinutes/maxAdvanceDays overrides', () => {
        // 5 minutes ahead would fail the default 30-min lead, but passes with a 1-min override.
        const requestedFor = new Date(NOW.getTime() + 5 * 60 * 1000).toISOString();
        const result = validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: ALWAYS_OPEN_HOURS,
            now: NOW,
            minLeadMinutes: 1,
            maxAdvanceDays: 14
        });
        expect(result.requestedFor).toEqual(new Date(requestedFor));
    });

    it('no configured business hours means always open (D-12 default)', () => {
        const requestedFor = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
        const result = validateFulfillment({
            fulfillmentMode: 'pickup',
            fulfillmentTiming: 'scheduled',
            requestedFor,
            businessHours: null,
            now: NOW
        });
        expect(result.requestedFor).toEqual(new Date(requestedFor));
    });
});

describe('isWithinBusinessHours', () => {
    it('returns true when no businessHours schedule is configured', () => {
        expect(isWithinBusinessHours(NOW, null)).toBe(true);
        expect(isWithinBusinessHours(NOW, undefined)).toBe(true);
    });

    it('returns true within a configured weekday interval, false outside it', () => {
        expect(isWithinBusinessHours(new Date('2026-07-15T10:00:00.000Z'), NARROW_HOURS)).toBe(true);
        expect(isWithinBusinessHours(new Date('2026-07-15T22:00:00.000Z'), NARROW_HOURS)).toBe(false);
    });

    it('matches an overnight interval that started the previous day', () => {
        const overnightHours = {
            timezone: 'UTC',
            weekly: {
                sun: { enabled: true, intervals: [{ open: '22:00', close: '02:00' }] },
                mon: { enabled: false, intervals: [] },
                tue: { enabled: false, intervals: [] },
                wed: { enabled: false, intervals: [] },
                thu: { enabled: false, intervals: [] },
                fri: { enabled: false, intervals: [] },
                sat: { enabled: false, intervals: [] }
            }
        };
        // Monday 01:00 UTC — covered by Sunday's 22:00-02:00 overnight interval.
        expect(isWithinBusinessHours(new Date('2026-07-13T01:00:00.000Z'), overnightHours)).toBe(true);
        // Monday 03:00 UTC — past the overnight window's close.
        expect(isWithinBusinessHours(new Date('2026-07-13T03:00:00.000Z'), overnightHours)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// StorefrontOrderRepository (Task 1) — mocked Sequelize model, mirrors
// guestIdentityRepository.test.js's / commercePaymentRepository's
// mocked-model convention. No live dgfy_core connection.
// ---------------------------------------------------------------------------

class SequelizeUniqueConstraintError extends Error {
    constructor() {
        super('Validation error');
        this.name = 'SequelizeUniqueConstraintError';
    }
}

const makeRecord = (overrides = {}) => {
    const data = {
        id: 'order-uuid-1',
        public_reference: 'SFO-TESTORDER01',
        tenant_id: 'tenant-uuid-1',
        target_type: 'storefront_checkout',
        idempotency_key: 'idem-key-12345678',
        request_hash: 'a'.repeat(64),
        status: 'pending_payment',
        ...overrides
    };
    return {
        ...data,
        get: jest.fn(({ plain } = {}) => (plain ? { ...data } : data)),
        update: jest.fn(async (patch) => {
            Object.assign(data, patch);
            return data;
        })
    };
};

const makeModel = (overrides = {}) => ({
    findOne: jest.fn(async () => null),
    findByPk: jest.fn(async () => null),
    create: jest.fn(async () => makeRecord()),
    ...overrides
});

describe('StorefrontOrderRepository', () => {
    it('throws when constructed without a storefrontOrderModel', () => {
        expect(() => new StorefrontOrderRepository({})).toThrow(/requires a storefrontOrderModel/);
    });

    describe('createOrder', () => {
        it('persists via model.create and returns a plain object', async () => {
            const created = makeRecord();
            const model = makeModel({ create: jest.fn(async () => created) });
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            const payload = { public_reference: 'SFO-TESTORDER01', tenant_id: 'tenant-uuid-1' };
            const result = await repository.createOrder(payload);

            expect(model.create).toHaveBeenCalledWith(payload);
            expect(result.public_reference).toBe('SFO-TESTORDER01');
        });
    });

    describe('findByIdempotency', () => {
        it('returns null without querying when tenant_id or idempotency_key is missing', async () => {
            const model = makeModel();
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            expect(await repository.findByIdempotency({ tenant_id: null, idempotency_key: 'k' })).toBeNull();
            expect(await repository.findByIdempotency({ tenant_id: 't', idempotency_key: null })).toBeNull();
            expect(model.findOne).not.toHaveBeenCalled();
        });

        it('queries the (tenant_id, target_type, idempotency_key) unique index', async () => {
            const record = makeRecord();
            const model = makeModel({ findOne: jest.fn(async () => record) });
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            const result = await repository.findByIdempotency({
                tenant_id: 'tenant-uuid-1',
                target_type: 'storefront_checkout',
                idempotency_key: 'idem-key-12345678'
            });

            expect(model.findOne).toHaveBeenCalledWith({
                where: { tenant_id: 'tenant-uuid-1', target_type: 'storefront_checkout', idempotency_key: 'idem-key-12345678' }
            });
            expect(result.id).toBe('order-uuid-1');
        });
    });

    describe('updateOrder', () => {
        it('returns null when the order does not exist', async () => {
            const model = makeModel({ findByPk: jest.fn(async () => null) });
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            expect(await repository.updateOrder('missing-id', { status: 'failed' })).toBeNull();
        });

        it('applies the patch and returns the updated plain object', async () => {
            const record = makeRecord();
            const model = makeModel({ findByPk: jest.fn(async () => record) });
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            const result = await repository.updateOrder('order-uuid-1', { status: 'failed' });

            expect(record.update).toHaveBeenCalledWith({ status: 'failed' });
            expect(result.status).toBe('failed');
        });
    });

    describe('findByPublicReference', () => {
        it('returns null for a blank reference without querying', async () => {
            const model = makeModel();
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            expect(await repository.findByPublicReference('')).toBeNull();
            expect(model.findOne).not.toHaveBeenCalled();
        });

        it('queries by public_reference', async () => {
            const record = makeRecord();
            const model = makeModel({ findOne: jest.fn(async () => record) });
            const repository = new StorefrontOrderRepository({ storefrontOrderModel: model });

            const result = await repository.findByPublicReference('SFO-TESTORDER01');

            expect(model.findOne).toHaveBeenCalledWith({ where: { public_reference: 'SFO-TESTORDER01' } });
            expect(result.public_reference).toBe('SFO-TESTORDER01');
        });
    });
});

describe('computeRequestHash (D-04)', () => {
    it('produces identical hashes for the same payload regardless of key order', () => {
        const a = computeRequestHash({ businessId: 'b1', lines: [{ productId: 1, quantity: 2 }], paymentMethod: 'cash' });
        const b = computeRequestHash({ paymentMethod: 'cash', lines: [{ quantity: 2, productId: 1 }], businessId: 'b1' });
        expect(a).toBe(b);
        expect(a).toHaveLength(64);
    });

    it('produces a different hash when the payload changes (tamper/mismatch detection)', () => {
        const a = computeRequestHash({ businessId: 'b1', paymentMethod: 'cash' });
        const b = computeRequestHash({ businessId: 'b1', paymentMethod: 'gcash' });
        expect(a).not.toBe(b);
    });
});

describe('generateOrderPublicReference', () => {
    it('generates an opaque SFO-prefixed reference', () => {
        const ref = generateOrderPublicReference();
        expect(ref).toMatch(/^SFO-[A-Z0-9]{10}$/);
    });
});

describe('isUniqueConstraintViolation', () => {
    it('recognizes a SequelizeUniqueConstraintError', () => {
        expect(isUniqueConstraintViolation(new SequelizeUniqueConstraintError())).toBe(true);
    });

    it('recognizes a raw mysql2 ER_DUP_ENTRY error (original/parent shapes)', () => {
        const original = new Error('dup');
        original.original = { code: 'ER_DUP_ENTRY' };
        expect(isUniqueConstraintViolation(original)).toBe(true);

        const parent = new Error('dup');
        parent.parent = { errno: 1062 };
        expect(isUniqueConstraintViolation(parent)).toBe(true);
    });

    it('returns false for an unrelated error', () => {
        expect(isUniqueConstraintViolation(new Error('unrelated'))).toBe(false);
        expect(isUniqueConstraintViolation(null)).toBe(false);
    });
});
