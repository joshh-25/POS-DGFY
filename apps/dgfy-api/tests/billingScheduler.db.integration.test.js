import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import crypto from 'crypto';

const mockSendSubscriptionExpiringEmail = jest.fn();
const mockIsEmailConfigured = jest.fn();

jest.unstable_mockModule('../src/services/emailService.js', () => ({
    isEmailConfigured: mockIsEmailConfigured,
    sendSubscriptionExpiringEmail: mockSendSubscriptionExpiringEmail,
    sendPaymentFailedGracePeriodEmail: jest.fn(),
    sendSubscriptionCancelledEmail: jest.fn()
}));

const { checkExpiringSubscriptions } = await import('../src/schedulers/billingScheduler.js');
const { sequelize, Tenant } = await import('../src/models/index.js');
const { ensureLandlordTenantSchemaReady } = await import('./helpers/landlordSchemaReadiness.js');

function toTargetDate(base, daysAhead) {
    const d = new Date(base);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(12, 0, 0, 0);
    return d;
}

describe('billingScheduler DB integration - expiring notifications idempotency', () => {
    const now = new Date();
    const tenantIds = [];

    async function createExpiringTenant({ daysAhead, notifiedAt = null, notifiedType = null }) {
        const id = crypto.randomUUID();
        tenantIds.push(id);

        return Tenant.create({
            id,
            name: `Scheduler DB Test ${id}`,
            db_name: `sku_tenant_sched_${id.slice(0, 8)}`,
            company_token: `token-sched-${id.slice(0, 8)}`,
            status: 'active',
            admin_email: `sched-${id.slice(0, 8)}@test.local`,
            plan: 'premium',
            subscription_status: 'active',
            current_period_end: toTargetDate(now, daysAhead),
            last_expiry_notified_at: notifiedAt,
            last_expiry_notification_type: notifiedType
        });
    }

    beforeAll(async () => {
        await sequelize.authenticate();
        await ensureLandlordTenantSchemaReady();
    });

    beforeEach(async () => {
        mockSendSubscriptionExpiringEmail.mockReset();
        mockIsEmailConfigured.mockReset();
        mockIsEmailConfigured.mockReturnValue(true);
        if (tenantIds.length > 0) {
            await Tenant.destroy({ where: { id: { [Op.in]: tenantIds } } });
            tenantIds.length = 0;
        }
    });

    afterAll(async () => {
        if (tenantIds.length > 0) {
            await Tenant.destroy({ where: { id: { [Op.in]: tenantIds } } });
        }
    });

    it('sends 7-day warning once and does not resend on immediate rerun', async () => {
        const tenant = await createExpiringTenant({ daysAhead: 7 });
        mockSendSubscriptionExpiringEmail.mockResolvedValue({ messageId: 'ok-1' });

        await checkExpiringSubscriptions();

        const firstState = await Tenant.findByPk(tenant.id);
        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(firstState.last_expiry_notification_type).toBe('7-day');
        expect(firstState.last_expiry_notified_at).toBeTruthy();
        const firstTimestamp = new Date(firstState.last_expiry_notified_at).getTime();

        await checkExpiringSubscriptions();

        const secondState = await Tenant.findByPk(tenant.id);
        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(new Date(secondState.last_expiry_notified_at).getTime()).toBe(firstTimestamp);
    });

    it('sends 1-day warning once and does not resend on immediate rerun', async () => {
        const tenant = await createExpiringTenant({ daysAhead: 1 });
        mockSendSubscriptionExpiringEmail.mockResolvedValue({ messageId: 'ok-2' });

        await checkExpiringSubscriptions();
        await checkExpiringSubscriptions();

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(refreshed.last_expiry_notification_type).toBe('1-day');
        expect(refreshed.last_expiry_notified_at).toBeTruthy();
    });

    it('persists notification markers even when email send fails', async () => {
        const tenant = await createExpiringTenant({ daysAhead: 7 });
        mockSendSubscriptionExpiringEmail.mockRejectedValue(new Error('smtp failure'));

        await checkExpiringSubscriptions();

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(refreshed.last_expiry_notification_type).toBe('7-day');
        expect(refreshed.last_expiry_notified_at).not.toBeNull();
    });

    it('allows send again when the previous send was yesterday for the same label', async () => {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const tenant = await createExpiringTenant({
            daysAhead: 7,
            notifiedAt: yesterday,
            notifiedType: '7-day'
        });

        mockSendSubscriptionExpiringEmail.mockResolvedValue({ messageId: 'ok-3' });

        await checkExpiringSubscriptions();

        const refreshed = await Tenant.findByPk(tenant.id);
        expect(mockSendSubscriptionExpiringEmail).toHaveBeenCalledTimes(1);
        expect(refreshed.last_expiry_notification_type).toBe('7-day');
        expect(new Date(refreshed.last_expiry_notified_at).getTime()).toBeGreaterThan(yesterday.getTime());
    });
});
