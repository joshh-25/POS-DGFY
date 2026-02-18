/**
 * Regression tests for paymentController.js webhook handler business logic.
 *
 * These tests import the REAL production controller and assert on actual
 * mutations made to mock tenant objects. If a fix is reverted in
 * paymentController.js, the relevant test will fail.
 *
 * Gap 2 — handleSubscriptionActivated: plan must be set to 'premium'
 *   BILLING.SUBSCRIPTION.ACTIVATED must set plan='premium' in addition to
 *   subscription_status='active'. Without it, requirePremium middleware
 *   blocks the tenant even though their subscription is active.
 *
 * Gap 3 — handleSubscriptionCancelled: cancelled_at must be recorded
 *   BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED/EXPIRED must set cancelled_at.
 *   The user-initiated cancelSubscription endpoint already does this; the
 *   webhook path (PayPal-portal cancellation) must be consistent.
 *
 * Gap 1 / Gap 4 are covered via syncWithPayPal and handlePaymentCompleted
 *   integration assertions below.
 *
 * Mocking strategy (ESM-compatible):
 *   - jest.unstable_mockModule for db (models/index.js), paypalService, and logger
 *   - Dynamic import of the real controller in beforeAll so mocks are in place
 *   - handleWebhook is driven with minimal fake req/res objects
 *   - syncWithPayPal is called with fake req/res objects
 *   - Tenant.findOne / Tenant.findByPk return mock tenant objects with jest.fn() methods
 *   - All assertions are on the mock tenant's save/update call arguments
 */

import { jest } from '@jest/globals';

// ── 1. Mock db (models/index.js) ──────────────────────────────────────────────
// The controller destructures { Tenant, Payment, WebhookLog } from db at module
// load time. We provide a fake db object whose models are all jest.fn() stubs.

const mockTenantSave   = jest.fn().mockResolvedValue(true);
const mockTenantUpdate = jest.fn().mockResolvedValue(true);

function makeTenant(overrides = {}) {
    return {
        id:                     'tenant-001',
        name:                   'Acme Corp',
        plan:                   'standard',
        subscription_status:    'inactive',
        paypal_subscription_id: 'I-SUB-123',
        current_period_end:     null,
        billing_cycle_anchor:   null,
        cancelled_at:           null,
        save:                   mockTenantSave,
        update:                 mockTenantUpdate,
        ...overrides,
    };
}

// WebhookLog stubs — simulate "no existing log" so idempotency check passes
const mockWebhookLogFindOne    = jest.fn().mockResolvedValue(null);
const mockWebhookLogFindOrCreate = jest.fn().mockResolvedValue([
    { update: jest.fn().mockResolvedValue(true) }
]);

// Payment.create stub
const mockPaymentCreate = jest.fn().mockResolvedValue(true);

// Sequelize transaction stub — immediately calls the callback
const mockTransaction = jest.fn().mockImplementation(async (cb) => cb({}));

const mockDb = {
    Tenant: {
        findOne:  jest.fn(),
        findByPk: jest.fn(),
    },
    Payment: {
        create: mockPaymentCreate,
    },
    WebhookLog: {
        findOne:      mockWebhookLogFindOne,
        findOrCreate: mockWebhookLogFindOrCreate,
    },
    sequelize: {
        transaction: mockTransaction,
    },
};

jest.unstable_mockModule('../src/models/index.js', () => ({
    default: mockDb,
    ...mockDb,
}));

// ── 2. Mock paypalService ─────────────────────────────────────────────────────
// verifyWebhookSignature: always return true so the signature gate passes.
// getSubscriptionDetails: configured per-test for syncWithPayPal tests.

const mockVerifyWebhookSignature = jest.fn().mockResolvedValue(true);
const mockGetSubscriptionDetails = jest.fn();

jest.unstable_mockModule('../src/services/paypalService.js', () => ({
    paypalService: {
        verifyWebhookSignature: mockVerifyWebhookSignature,
        getSubscriptionDetails: mockGetSubscriptionDetails,
        cancelSubscription:     jest.fn().mockResolvedValue(true),
        verifySubscription:     jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
}));

// ── 3. Mock logger (silence output) ──────────────────────────────────────────
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        info:  jest.fn(),
        warn:  jest.fn(),
        error: jest.fn(),
    },
}));

// ── 4. Load the real controller after mocks are registered ───────────────────
let handleWebhook;
let syncWithPayPal;
let cancelSubscription;

beforeAll(async () => {
    const mod = await import('../src/controllers/paymentController.js');
    handleWebhook      = mod.handleWebhook;
    syncWithPayPal     = mod.syncWithPayPal;
    cancelSubscription = mod.cancelSubscription;
});

// ── 5. Shared test utilities ──────────────────────────────────────────────────

/** Build a minimal Express req for handleWebhook */
function makeWebhookReq(eventType, resource = {}) {
    return {
        body: {
            event_type: eventType,
            resource,
        },
        headers: {
            'paypal-transmission-id': `tx-${Date.now()}`,
        },
    };
}

/** Minimal Express res with jest spies */
function makeRes() {
    const res = {
        status: jest.fn(),
        send:   jest.fn(),
        json:   jest.fn(),
    };
    // status(...).send(...) chaining
    res.status.mockReturnValue(res);
    return res;
}

beforeEach(() => {
    jest.clearAllMocks();

    // Reset WebhookLog to always allow processing (no duplicate)
    mockWebhookLogFindOne.mockResolvedValue(null);
    mockWebhookLogFindOrCreate.mockResolvedValue([
        { update: jest.fn().mockResolvedValue(true) }
    ]);

    // Signature always passes
    mockVerifyWebhookSignature.mockResolvedValue(true);

    // Transaction executes callback immediately
    mockTransaction.mockImplementation(async (cb) => cb({}));
    mockPaymentCreate.mockResolvedValue(true);
    mockTenantSave.mockResolvedValue(true);
    mockTenantUpdate.mockResolvedValue(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2 — BILLING.SUBSCRIPTION.ACTIVATED must set plan='premium'
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 2 — handleSubscriptionActivated: plan must be set to premium', () => {

    it('2a. sets plan=premium on the tenant object before calling save()', async () => {
        const tenant = makeTenant({ plan: 'standard', subscription_status: 'inactive' });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        const req = makeWebhookReq('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB-123' });
        const res = makeRes();

        await handleWebhook(req, res);

        // The real handler must have mutated tenant.plan before calling save()
        expect(tenant.plan).toBe('premium');
        expect(mockTenantSave).toHaveBeenCalled();
    });

    it('2b. sets subscription_status=active alongside plan=premium', async () => {
        const tenant = makeTenant({ plan: 'standard', subscription_status: 'inactive' });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        const req = makeWebhookReq('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB-123' });
        const res = makeRes();

        await handleWebhook(req, res);

        expect(tenant.subscription_status).toBe('active');
    });

    it('2c. regression: without this fix the tenant would fail requirePremium', async () => {
        // Demonstrate the pre-fix state: plan stays 'standard', requirePremium blocks.
        // Then demonstrate the post-fix state: plan becomes 'premium', access granted.
        function requirePremiumGate(t) { return t.plan === 'premium'; }

        const tenantBefore = makeTenant({ plan: 'standard', subscription_status: 'inactive' });
        expect(requirePremiumGate(tenantBefore)).toBe(false);

        // After the real handler runs:
        mockDb.Tenant.findOne.mockResolvedValue(tenantBefore);
        await handleWebhook(
            makeWebhookReq('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB-123' }),
            makeRes()
        );

        expect(requirePremiumGate(tenantBefore)).toBe(true);
    });

    it('2d. sets billing_cycle_anchor if not already set', async () => {
        const tenant = makeTenant({ billing_cycle_anchor: null });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        await handleWebhook(
            makeWebhookReq('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB-123' }),
            makeRes()
        );

        expect(tenant.billing_cycle_anchor).toBeGreaterThan(0);
    });

    it('2e. does NOT overwrite an existing billing_cycle_anchor', async () => {
        const tenant = makeTenant({ billing_cycle_anchor: 15 });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        await handleWebhook(
            makeWebhookReq('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-SUB-123' }),
            makeRes()
        );

        expect(tenant.billing_cycle_anchor).toBe(15);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3 — BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED/EXPIRED must set cancelled_at
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 3 — handleSubscriptionCancelled: cancelled_at must be recorded', () => {

    for (const eventType of [
        'BILLING.SUBSCRIPTION.CANCELLED',
        'BILLING.SUBSCRIPTION.SUSPENDED',
        'BILLING.SUBSCRIPTION.EXPIRED',
    ]) {
        it(`${eventType} — sets cancelled_at to a Date`, async () => {
            const tenant = makeTenant({ cancelled_at: null });
            mockDb.Tenant.findOne.mockResolvedValue(tenant);

            const before = new Date();
            await handleWebhook(makeWebhookReq(eventType, { id: 'I-SUB-123' }), makeRes());
            const after = new Date();

            expect(tenant.cancelled_at).toBeInstanceOf(Date);
            expect(tenant.cancelled_at >= before).toBe(true);
            expect(tenant.cancelled_at <= after).toBe(true);
        });

        it(`${eventType} — sets subscription_status=cancelled`, async () => {
            const tenant = makeTenant({ subscription_status: 'active' });
            mockDb.Tenant.findOne.mockResolvedValue(tenant);

            await handleWebhook(makeWebhookReq(eventType, { id: 'I-SUB-123' }), makeRes());

            expect(tenant.subscription_status).toBe('cancelled');
        });

        it(`${eventType} — does NOT change plan (billingScheduler handles downgrade)`, async () => {
            const tenant = makeTenant({ plan: 'premium' });
            mockDb.Tenant.findOne.mockResolvedValue(tenant);

            await handleWebhook(makeWebhookReq(eventType, { id: 'I-SUB-123' }), makeRes());

            expect(tenant.plan).toBe('premium');
        });
    }

    it('consistency: webhook handler sets same fields as cancelSubscription endpoint', async () => {
        // Both code paths must produce {subscription_status, cancelled_at}.
        // Webhook path — capture what gets set on the tenant object:
        const webhookTenant = makeTenant();
        mockDb.Tenant.findOne.mockResolvedValue(webhookTenant);
        await handleWebhook(
            makeWebhookReq('BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-SUB-123' }),
            makeRes()
        );

        // cancelSubscription endpoint path — capture what update() is called with:
        const endpointTenant = makeTenant({ paypal_subscription_id: 'I-SUB-123' });
        mockDb.Tenant.findByPk.mockResolvedValue(endpointTenant);
        const req = { tenant: { id: 'tenant-001' } };
        const res = makeRes();
        await cancelSubscription(req, res);

        // Both must have set cancelled_at to a Date
        expect(webhookTenant.cancelled_at).toBeInstanceOf(Date);
        // cancelSubscription uses tenant.update(), check the call args
        const updateArgs = mockTenantUpdate.mock.calls[0][0];
        expect(updateArgs.cancelled_at).toBeInstanceOf(Date);
        expect(updateArgs.subscription_status).toBe('cancelled');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4 — syncWithPayPal must set plan='premium' when PayPal status is ACTIVE
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 4 — syncWithPayPal: plan must be set to premium when PayPal status is ACTIVE', () => {

    function makeSyncReq(tenantId = 'tenant-001') {
        return { tenant: { id: tenantId } };
    }

    it('4a. sets plan=premium in the update payload when PayPal status is ACTIVE', async () => {
        const tenant = makeTenant({ plan: 'standard', subscription_status: 'inactive' });
        mockDb.Tenant.findByPk.mockResolvedValue(tenant);
        mockGetSubscriptionDetails.mockResolvedValue({ status: 'ACTIVE', billing_info: null });

        await syncWithPayPal(makeSyncReq(), makeRes());

        const updatePayload = mockTenantUpdate.mock.calls[0][0];
        expect(updatePayload.plan).toBe('premium');
        expect(updatePayload.subscription_status).toBe('active');
    });

    it('4b. regression: without this fix requirePremium would still block an ACTIVE subscriber', async () => {
        function requirePremiumGate(t) { return t.plan === 'premium'; }

        const tenant = makeTenant({ plan: 'standard', subscription_status: 'inactive' });
        mockDb.Tenant.findByPk.mockResolvedValue(tenant);
        mockGetSubscriptionDetails.mockResolvedValue({ status: 'ACTIVE', billing_info: null });

        // The real update() must propagate plan back to the object for the gate to work.
        // Simulate what Sequelize's update() does — apply the payload to the object:
        mockTenantUpdate.mockImplementation(async (payload) => {
            Object.assign(tenant, payload);
        });

        await syncWithPayPal(makeSyncReq(), makeRes());

        expect(requirePremiumGate(tenant)).toBe(true);
    });

    it('4c. does NOT set plan when PayPal status is CANCELLED', async () => {
        const tenant = makeTenant({ plan: 'premium' });
        mockDb.Tenant.findByPk.mockResolvedValue(tenant);
        mockGetSubscriptionDetails.mockResolvedValue({ status: 'CANCELLED', billing_info: null });

        await syncWithPayPal(makeSyncReq(), makeRes());

        const updatePayload = mockTenantUpdate.mock.calls[0][0];
        expect(updatePayload.plan).toBeUndefined();
        expect(updatePayload.subscription_status).toBe('cancelled');
    });

    it('4d. does NOT set plan when PayPal status is SUSPENDED', async () => {
        const tenant = makeTenant({ plan: 'premium' });
        mockDb.Tenant.findByPk.mockResolvedValue(tenant);
        mockGetSubscriptionDetails.mockResolvedValue({ status: 'SUSPENDED', billing_info: null });

        await syncWithPayPal(makeSyncReq(), makeRes());

        const updatePayload = mockTenantUpdate.mock.calls[0][0];
        expect(updatePayload.plan).toBeUndefined();
        expect(updatePayload.subscription_status).toBe('past_due');
    });

    it('4e. does NOT set plan when PayPal status is EXPIRED', async () => {
        const tenant = makeTenant({ plan: 'premium' });
        mockDb.Tenant.findByPk.mockResolvedValue(tenant);
        mockGetSubscriptionDetails.mockResolvedValue({ status: 'EXPIRED', billing_info: null });

        await syncWithPayPal(makeSyncReq(), makeRes());

        const updatePayload = mockTenantUpdate.mock.calls[0][0];
        expect(updatePayload.plan).toBeUndefined();
        expect(updatePayload.subscription_status).toBe('inactive');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 1 — handlePaymentCompleted: period_end must extend from MAX(current_period_end, now)
// ─────────────────────────────────────────────────────────────────────────────

describe('Gap 1 — handlePaymentCompleted: period_end idempotency', () => {

    function makePaymentResource(overrides = {}) {
        return {
            id:                   'TXN-001',
            billing_agreement_id: 'I-SUB-123',
            amount:               { total: '29.99', currency: 'USD' },
            ...overrides,
        };
    }

    it('1a. first payment (null period_end) — extends approximately 1 month from now', async () => {
        const tenant = makeTenant({ current_period_end: null, billing_cycle_anchor: null });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        const req = makeWebhookReq('PAYMENT.SALE.COMPLETED', makePaymentResource());

        const before = new Date();
        await handleWebhook(req, makeRes());
        const after = new Date();

        // tenant.save() is called inside the transaction with the new period end
        expect(mockTenantSave).toHaveBeenCalled();
        // The new period end must be roughly 1 month from now (28–32 days)
        const newEnd = tenant.current_period_end;
        expect(newEnd).toBeInstanceOf(Date);
        const daysAhead = (newEnd - before) / (1000 * 60 * 60 * 24);
        expect(daysAhead).toBeGreaterThanOrEqual(27);
        expect(daysAhead).toBeLessThanOrEqual(33);
    });

    it('1b. duplicate/late webhook with FUTURE period_end — does NOT reset it backward', async () => {
        // Tenant already has a future end date (paid 1st, duplicate arrives on 5th)
        const futureEnd = new Date();
        futureEnd.setDate(futureEnd.getDate() + 25);
        const tenant = makeTenant({ current_period_end: futureEnd, billing_cycle_anchor: null });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        const req = makeWebhookReq('PAYMENT.SALE.COMPLETED', makePaymentResource());
        await handleWebhook(req, makeRes());

        const newEnd = tenant.current_period_end;
        // Must be LATER than the existing future end, not reset to now+30
        expect(newEnd > futureEnd).toBe(true);
    });

    it('1c. sets plan=premium on payment completed', async () => {
        const tenant = makeTenant({ plan: 'standard' });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        await handleWebhook(
            makeWebhookReq('PAYMENT.SALE.COMPLETED', makePaymentResource()),
            makeRes()
        );

        expect(tenant.plan).toBe('premium');
    });

    it('1d. uses next_billing_date from PayPal resource when provided (authoritative path)', async () => {
        // This covers the 3.4 proposal: prefer PayPal's own next_billing_date over
        // any local calendar calculation. The controller checks resource.next_billing_date
        // first (paymentController.js line 124), so a webhook that includes this field
        // must set current_period_end to exactly that value.
        const tenant = makeTenant({ current_period_end: null, billing_cycle_anchor: null });
        mockDb.Tenant.findOne.mockResolvedValue(tenant);

        const paypalNextBillingDate = '2026-04-15T00:00:00Z';

        const req = makeWebhookReq('PAYMENT.SALE.COMPLETED', makePaymentResource({
            next_billing_date: paypalNextBillingDate,
        }));

        await handleWebhook(req, makeRes());

        expect(mockTenantSave).toHaveBeenCalled();
        const newEnd = tenant.current_period_end;
        expect(newEnd).toBeInstanceOf(Date);
        expect(newEnd.getTime()).toBe(new Date(paypalNextBillingDate).getTime());
    });
});
