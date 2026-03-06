import { jest } from '@jest/globals';
import { Op } from 'sequelize';

const mockSendSubscriptionExpiringEmail = jest.fn();
const mockDbGet = jest.fn();
const mockAcquireLock = jest.fn();
const mockReleaseLock = jest.fn();

jest.unstable_mockModule('../src/services/emailService.js', () => ({
    sendSubscriptionExpiringEmail: mockSendSubscriptionExpiringEmail,
    sendPaymentFailedGracePeriodEmail: jest.fn(),
    sendSubscriptionCancelledEmail: jest.fn()
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: mockDbGet
    }
}));

jest.unstable_mockModule('../src/services/cacheService.js', () => ({
    default: {
        acquireLock: mockAcquireLock,
        releaseLock: mockReleaseLock
    }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

const { checkExpiringSubscriptions } = await import('../src/schedulers/billingScheduler.js');

function dateFromBase(base, daysFromNow, hour = 12) {
    const d = new Date(base);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return d;
}

function makeTenant(overrides = {}) {
    const tenant = {
        id: 'tenant-1',
        name: 'Tenant Co',
        admin_email: 'tenant@example.com',
        plan: 'premium',
        subscription_status: 'active',
        current_period_end: new Date(),
        last_expiry_notified_at: null,
        last_expiry_notification_type: null,
        ...overrides
    };

    tenant.update = jest.fn(async (payload) => {
        Object.assign(tenant, payload);
        return tenant;
    });

    return tenant;
}

function matchesExpiringWhere(tenant, where) {
    if (where.plan && tenant.plan !== where.plan) return false;
    if (where.subscription_status && tenant.subscription_status !== where.subscription_status) return false;

    const between = where.current_period_end?.[Op.between];
    if (between) {
        const [start, end] = between;
        if (!(tenant.current_period_end instanceof Date)) return false;
        if (tenant.current_period_end < start || tenant.current_period_end > end) return false;
    }

    const orConditions = where[Op.or];
    if (Array.isArray(orConditions) && orConditions.length > 0) {
        const matchesOr = orConditions.some((condition) => {
            if (Object.prototype.hasOwnProperty.call(condition, 'last_expiry_notified_at')) {
                const rule = condition.last_expiry_notified_at;
                if (rule === null) return tenant.last_expiry_notified_at == null;
                if (rule && rule[Op.lt]) {
                    return tenant.last_expiry_notified_at instanceof Date &&
                        tenant.last_expiry_notified_at < rule[Op.lt];
                }
            }

            if (Object.prototype.hasOwnProperty.call(condition, 'last_expiry_notification_type')) {
                const rule = condition.last_expiry_notification_type;
                if (rule && Object.prototype.hasOwnProperty.call(rule, Op.ne)) {
                    return tenant.last_expiry_notification_type !== rule[Op.ne];
                }
            }

            return false;
        });

        if (!matchesOr) return false;
    }

    return true;
}

function buildTenantModel(tenants) {
    return {
        findAll: jest.fn(async ({ where, limit }) => {
            const matched = tenants.filter((tenant) => matchesExpiringWhere(tenant, where));
            return matched.slice(0, limit || matched.length);
        })
    };
}

describe('billingScheduler.checkExpiringSubscriptions idempotency', () => {
    const FIXED_NOW = new Date('2026-03-03T10:00:00.000Z');

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_NOW);
        jest.clearAllMocks();
        mockSendSubscriptionExpiringEmail.mockReset();
        mockDbGet.mockReset();
        mockAcquireLock.mockReset();
        mockReleaseLock.mockReset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('sends once for a 7-day tenant and does not resend on immediate rerun', async () => {
        const tenant = makeTenant({
            id: 'tenant-7d',
            current_period_end: dateFromBase(FIXED_NOW, 7),
            last_expiry_notified_at: null,
            last_expiry_notification_type: null
        });

        const tenantModel = buildTenantModel([tenant]);
        mockDbGet.mockReturnValue(tenantModel);

        await checkExpiringSubscriptions();

        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(tenant.update).toHaveBeenCalledTimes(1);
        expect(tenant.last_expiry_notification_type).toBe('7-day');
        const firstNotifiedAt = tenant.last_expiry_notified_at;
        expect(firstNotifiedAt).toBeInstanceOf(Date);

        await checkExpiringSubscriptions();

        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(tenant.last_expiry_notified_at.getTime()).toBe(firstNotifiedAt.getTime());
    });

    it('sends again when tenant was last notified yesterday for the same label', async () => {
        const yesterday = dateFromBase(FIXED_NOW, -1, 10);
        const tenant = makeTenant({
            id: 'tenant-yesterday',
            current_period_end: dateFromBase(FIXED_NOW, 7),
            last_expiry_notified_at: yesterday,
            last_expiry_notification_type: '7-day'
        });

        const tenantModel = buildTenantModel([tenant]);
        mockDbGet.mockReturnValue(tenantModel);

        await checkExpiringSubscriptions();

        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(tenant.update).toHaveBeenCalledTimes(1);
        expect(tenant.last_expiry_notification_type).toBe('7-day');
        expect(tenant.last_expiry_notified_at.getTime()).toBeGreaterThan(yesterday.getTime());
    });

    it('sends when the last notification type differs (type-based idempotency)', async () => {
        const notifiedToday = dateFromBase(FIXED_NOW, 0, 9);
        const tenant = makeTenant({
            id: 'tenant-type-mismatch',
            current_period_end: dateFromBase(FIXED_NOW, 7),
            last_expiry_notified_at: notifiedToday,
            last_expiry_notification_type: '1-day'
        });

        const tenantModel = buildTenantModel([tenant]);
        mockDbGet.mockReturnValue(tenantModel);

        await checkExpiringSubscriptions();

        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(tenant.update).toHaveBeenCalledTimes(1);
        expect(tenant.last_expiry_notification_type).toBe('7-day');
    });

    it('does not update notification markers when email send fails', async () => {
        const tenant = makeTenant({
            id: 'tenant-send-fail',
            current_period_end: dateFromBase(FIXED_NOW, 7)
        });

        const tenantModel = buildTenantModel([tenant]);
        mockDbGet.mockReturnValue(tenantModel);
        mockSendSubscriptionExpiringEmail.mockRejectedValue(new Error('smtp down'));

        await expect(checkExpiringSubscriptions()).rejects.toThrow('smtp down');
        expect(tenant.update).not.toHaveBeenCalled();
        expect(tenant.last_expiry_notified_at).toBeNull();
        expect(tenant.last_expiry_notification_type).toBeNull();
    });

    it('processes 1-day range tenant once and remains idempotent on rerun', async () => {
        const tenant = makeTenant({
            id: 'tenant-1d',
            current_period_end: dateFromBase(FIXED_NOW, 1),
            last_expiry_notified_at: null,
            last_expiry_notification_type: null
        });

        const tenantModel = buildTenantModel([tenant]);
        mockDbGet.mockReturnValue(tenantModel);

        await checkExpiringSubscriptions();
        await checkExpiringSubscriptions();

        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(tenant.update).toHaveBeenCalledTimes(1);
        expect(tenant.last_expiry_notification_type).toBe('1-day');
    });
});
