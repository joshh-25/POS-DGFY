import { jest } from '@jest/globals';
import { buildReactivateWithPayPalUseCase } from '../src/modules/payments/usecases/reactivateWithPayPalUseCase.js';
import { buildMigrateToPayPalUseCase } from '../src/modules/payments/usecases/migrateToPayPalUseCase.js';

const makeLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
});

const getEventTypes = (trackEngagementEvent) => (
    trackEngagementEvent.mock.calls.map(([payload]) => payload.eventType)
);

const getEventByType = (trackEngagementEvent, eventType) => (
    trackEngagementEvent.mock.calls
        .map(([payload]) => payload)
        .find((payload) => payload.eventType === eventType)
);

describe('payment lifecycle use-cases', () => {
    const originalStandardPlan = process.env.PAYPAL_STANDARD_PLAN_ID;
    const originalPremiumPlan = process.env.PAYPAL_PREMIUM_PLAN_ID;
    const originalLegacyPremiumPlan = process.env.PAYPAL_PLAN_ID;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.PAYPAL_STANDARD_PLAN_ID = 'P-STANDARD';
        process.env.PAYPAL_PREMIUM_PLAN_ID = 'P-PREMIUM';
        process.env.PAYPAL_PLAN_ID = '';
    });

    afterAll(() => {
        if (originalStandardPlan === undefined) {
            delete process.env.PAYPAL_STANDARD_PLAN_ID;
        } else {
            process.env.PAYPAL_STANDARD_PLAN_ID = originalStandardPlan;
        }

        if (originalPremiumPlan === undefined) {
            delete process.env.PAYPAL_PREMIUM_PLAN_ID;
        } else {
            process.env.PAYPAL_PREMIUM_PLAN_ID = originalPremiumPlan;
        }

        if (originalLegacyPremiumPlan === undefined) {
            delete process.env.PAYPAL_PLAN_ID;
        } else {
            process.env.PAYPAL_PLAN_ID = originalLegacyPremiumPlan;
        }
    });

    describe('reactivateWithPayPalUseCase', () => {
        it('blocks reactivation when tenant is not inactive', async () => {
            const tenant = {
                id: 'tenant-1',
                status: 'active',
                billing_cycle_anchor: 12
            };
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildReactivateWithPayPalUseCase({
                paymentRepository,
                paypalService: { verifySubscription: jest.fn() },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: null,
                subscriptionId: 'I-REACTIVATE-1',
                correlationId: 'req-reactivate-not-inactive'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('VALIDATION_FAILED');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_reactivation_attempted',
                'paypal_reactivation_blocked_not_inactive'
            ]);
            const attempted = getEventByType(trackEngagementEvent, 'paypal_reactivation_attempted');
            expect(attempted.source).toBe('payments.reactivate_with_paypal');
            expect(attempted.correlationId).toBe('req-reactivate-not-inactive');
        });

        it('resolves plan_id from nested PayPal response and handles end-of-month anchor', async () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-01-31T08:00:00.000Z'));

            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                status: 'inactive',
                billing_cycle_anchor: 31,
                update: jest.fn().mockResolvedValue(true)
            };

            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildReactivateWithPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        plan: { id: 'P-PREMIUM' }
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: null,
                subscriptionId: 'I-REACTIVATE-2',
                correlationId: 'req-reactivate-success'
            });

            expect(result.success).toBe(true);
            expect(result.data.plan).toBe('premium');
            expect(tenant.update).toHaveBeenCalledWith(expect.objectContaining({
                plan: 'premium',
                payment_method: 'paypal'
            }));

            const savedDate = tenant.update.mock.calls[0][0].current_period_end;
            expect(savedDate).toBeInstanceOf(Date);
            expect(savedDate.toISOString()).toBe('2026-02-28T08:00:00.000Z');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_reactivation_attempted',
                'paypal_reactivation_succeeded'
            ]);
            const success = getEventByType(trackEngagementEvent, 'paypal_reactivation_succeeded');
            expect(success.source).toBe('payments.reactivate_with_paypal');
            expect(success.correlationId).toBe('req-reactivate-success');
            expect(success.metadata.outcome).toBe('succeeded');

            jest.useRealTimers();
        });

        it('returns explicit configuration error when required plan env vars are missing', async () => {
            delete process.env.PAYPAL_STANDARD_PLAN_ID;
            delete process.env.PAYPAL_PREMIUM_PLAN_ID;
            delete process.env.PAYPAL_PLAN_ID;

            const tenant = {
                id: 'tenant-1',
                status: 'inactive',
                billing_cycle_anchor: 10,
                update: jest.fn().mockResolvedValue(true)
            };
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildReactivateWithPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        plan_id: 'P-PREMIUM'
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: null,
                subscriptionId: 'I-REACTIVATE-3',
                correlationId: 'req-reactivate-config-missing'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('INTERNAL_ERROR');
            expect(result.error.message).toContain('configuration is incomplete');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_reactivation_attempted',
                'paypal_reactivation_failed'
            ]);
        });

        it.each([
            [{ plan_id: 'P-PREMIUM' }, 'premium'],
            [{ plan: { plan_id: 'P-STANDARD' } }, 'standard'],
            [{ billing_info: { plan_id: 'P-PREMIUM' } }, 'premium'],
            [{ billing_info: { last_payment: { plan_id: 'P-STANDARD' } } }, 'standard']
        ])('resolves plan from PayPal payload shape %j', async (shape, expectedPlan) => {
            const tenant = {
                id: 'tenant-1',
                name: 'Acme',
                status: 'inactive',
                billing_cycle_anchor: 12,
                update: jest.fn().mockResolvedValue(true)
            };
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildReactivateWithPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        ...shape
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-1',
                userId: null,
                subscriptionId: 'I-REACTIVATE-SHAPE',
                correlationId: 'req-reactivate-plan-shape'
            });

            expect(result.success).toBe(true);
            expect(result.data.plan).toBe(expectedPlan);
        });
    });

    describe('migrateToPayPalUseCase', () => {
        const baseTenant = () => ({
            id: 'tenant-2',
            name: 'Manual Co',
            plan: 'standard',
            payment_method: 'manual',
            subscription_status: 'active',
            billing_cycle_anchor: null,
            current_period_end: null,
            update: jest.fn().mockResolvedValue(true)
        });

        it('blocks migration for inactive subscriptions', async () => {
            const tenant = baseTenant();
            tenant.subscription_status = 'inactive';
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildMigrateToPayPalUseCase({
                paymentRepository,
                paypalService: { verifySubscription: jest.fn() },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-2',
                userId: 99,
                subscriptionId: 'I-MIGRATE-1',
                correlationId: 'req-migrate-not-active'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('VALIDATION_FAILED');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_migration_attempted',
                'paypal_migration_blocked_not_active'
            ]);
            const blocked = getEventByType(trackEngagementEvent, 'paypal_migration_blocked_not_active');
            expect(blocked.source).toBe('payments.migrate');
            expect(blocked.correlationId).toBe('req-migrate-not-active');
        });

        it('maps standard plan from nested plan.id and succeeds', async () => {
            const tenant = baseTenant();
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildMigrateToPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        plan: { id: 'P-STANDARD' }
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-2',
                userId: 99,
                subscriptionId: 'I-MIGRATE-2',
                correlationId: 'req-migrate-standard'
            });

            expect(result.success).toBe(true);
            expect(tenant.update).toHaveBeenCalledWith(expect.objectContaining({
                payment_method: 'paypal',
                paypal_subscription_id: 'I-MIGRATE-2'
            }));
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_migration_attempted',
                'paypal_migration_succeeded'
            ]);
            const success = getEventByType(trackEngagementEvent, 'paypal_migration_succeeded');
            expect(success.source).toBe('payments.migrate');
            expect(success.correlationId).toBe('req-migrate-standard');
            expect(success.metadata.outcome).toBe('succeeded');
        });

        it('maps premium plan and blocks mismatch against tenant plan', async () => {
            const tenant = baseTenant();
            tenant.plan = 'standard';
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildMigrateToPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        plan_id: 'P-PREMIUM'
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-2',
                userId: 99,
                subscriptionId: 'I-MIGRATE-3',
                correlationId: 'req-migrate-plan-mismatch'
            });

            expect(result.success).toBe(false);
            expect(result.error.code).toBe('VALIDATION_FAILED');
            expect(result.error.message).toContain('currently on standard');
            expect(getEventTypes(trackEngagementEvent)).toEqual([
                'paypal_migration_attempted',
                'paypal_migration_blocked_plan_mismatch'
            ]);
        });

        it.each([
            [{ plan_id: 'P-STANDARD' }, 'standard'],
            [{ plan: { plan_id: 'P-PREMIUM' } }, 'premium'],
            [{ billing_info: { plan_id: 'P-STANDARD' } }, 'standard'],
            [{ billing_info: { last_payment: { plan_id: 'P-PREMIUM' } } }, 'premium']
        ])('accepts plan resolution payload shape %j in migration flow', async (shape, resolvedPlan) => {
            const tenant = baseTenant();
            tenant.plan = resolvedPlan;
            const paymentRepository = {
                findTenantById: jest.fn().mockResolvedValue(tenant)
            };
            const trackEngagementEvent = jest.fn().mockResolvedValue({ created: true });
            const useCase = buildMigrateToPayPalUseCase({
                paymentRepository,
                paypalService: {
                    verifySubscription: jest.fn().mockResolvedValue({
                        status: 'ACTIVE',
                        ...shape
                    })
                },
                trackEngagementEvent,
                logger: makeLogger()
            });

            const result = await useCase({
                tenantId: 'tenant-2',
                userId: 99,
                subscriptionId: 'I-MIGRATE-SHAPE',
                correlationId: 'req-migrate-plan-shape'
            });

            expect(result.success).toBe(true);
            expect(tenant.update).toHaveBeenCalledWith(expect.objectContaining({
                payment_method: 'paypal',
                paypal_subscription_id: 'I-MIGRATE-SHAPE'
            }));
        });
    });
});
