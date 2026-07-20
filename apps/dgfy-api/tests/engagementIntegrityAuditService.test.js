import { jest } from '@jest/globals';
import { auditBillingFunnelIntegrity } from '../src/services/engagementIntegrityAuditService.js';
import { recordBillingRouteOutcome, __resetBillingRouteAuditForTests } from '../src/services/billingRouteAuditService.js';

const createEvent = ({
    event_type,
    correlation_id,
    tenant_id = 'tenant-1',
    subscription_id = null,
    metadata = {},
    event_time
}) => ({
    event_type,
    correlation_id,
    tenant_id,
    subscription_id,
    metadata,
    event_time
});

describe('engagementIntegrityAuditService', () => {
    afterEach(() => {
        __resetBillingRouteAuditForTests();
    });

    it('returns healthy when recent billing-funnel rows are complete and deduped', async () => {
        const now = new Date('2026-03-06T10:00:00.000Z');
        recordBillingRouteOutcome({
            method: 'POST',
            route: '/api/v1/admin/tenants/register',
            statusCode: 201,
            requestId: 'req-1',
            timestamp: new Date('2026-03-06T09:00:06.000Z')
        });
        const model = {
            findAll: jest.fn().mockResolvedValue([
                createEvent({
                    event_type: 'company_registration_attempted',
                    correlation_id: 'req-1',
                    metadata: { outcome: 'attempted' },
                    event_time: new Date('2026-03-06T09:00:00.000Z')
                }),
                createEvent({
                    event_type: 'company_registration_succeeded',
                    correlation_id: 'req-1',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T09:00:05.000Z')
                }),
                createEvent({
                    event_type: 'paypal_payment_sale_completed',
                    correlation_id: 'txn-1',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T09:30:00.000Z')
                })
            ])
        };

        const result = await auditBillingFunnelIntegrity({
            engagementEventModel: model,
            paymentModel: { findAll: jest.fn().mockResolvedValue([]) },
            tenantModel: { findAll: jest.fn().mockResolvedValue([{ id: 'tenant-1', status: 'active', plan: 'premium', subscription_status: 'active', paypal_subscription_id: null }]) },
            webhookLogModel: { findAll: jest.fn().mockResolvedValue([]) },
            now,
            lookbackHours: 24,
            attemptGraceMinutes: 15
        });

        expect(result.status).toBe('healthy');
        expect(result.rowsScanned).toBe(3);
        expect(result.missingCorrelationCount).toBe(0);
        expect(result.missingOutcomeCount).toBe(0);
        expect(result.orphanAttemptCount).toBe(0);
        expect(result.duplicateEventCount).toBe(0);
        expect(result.paymentWithoutTelemetryCount).toBe(0);
        expect(result.tenantStateMismatchCount).toBe(0);
        expect(result.routeOutcomeMismatchCount).toBe(0);
        expect(result.issues).toEqual([]);
    });

    it('flags orphan attempts, missing correlation IDs, missing outcomes, and duplicate event keys', async () => {
        const now = new Date('2026-03-06T10:00:00.000Z');
        recordBillingRouteOutcome({
            method: 'POST',
            route: '/api/v1/payments/upgrade',
            statusCode: 400,
            requestId: 'req-missing-route',
            timestamp: new Date('2026-03-06T08:00:10.000Z')
        });
        const model = {
            findAll: jest.fn().mockResolvedValue([
                createEvent({
                    event_type: 'premium_upgrade_attempted',
                    correlation_id: 'req-up-1',
                    metadata: { outcome: 'attempted' },
                    event_time: new Date('2026-03-06T08:00:00.000Z')
                }),
                createEvent({
                    event_type: 'paypal_payment_sale_completed',
                    correlation_id: '',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T08:10:00.000Z')
                }),
                createEvent({
                    event_type: 'company_registration_succeeded',
                    correlation_id: 'req-reg-1',
                    metadata: {},
                    event_time: new Date('2026-03-06T08:20:00.000Z')
                }),
                createEvent({
                    event_type: 'premium_upgrade_succeeded',
                    correlation_id: 'req-up-2',
                    subscription_id: 'sub-correct',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T08:25:00.000Z')
                }),
                createEvent({
                    event_type: 'paypal_subscription_cancelled',
                    correlation_id: 'sub-1',
                    subscription_id: 'sub-1',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T08:30:00.000Z')
                }),
                createEvent({
                    event_type: 'paypal_subscription_cancelled',
                    correlation_id: 'sub-1',
                    subscription_id: 'sub-1',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T08:30:01.000Z')
                })
            ])
        };

        const result = await auditBillingFunnelIntegrity({
            engagementEventModel: model,
            paymentModel: { findAll: jest.fn().mockResolvedValue([{ tenant_id: 'tenant-1', transaction_id: 'txn-missing', status: 'completed', payment_method: 'paypal', payment_date: new Date('2026-03-06T08:00:00.000Z') }]) },
            tenantModel: { findAll: jest.fn().mockResolvedValue([{ id: 'tenant-1', status: 'pending', plan: 'standard', subscription_status: 'inactive', paypal_subscription_id: 'wrong-sub' }]) },
            webhookLogModel: { findAll: jest.fn().mockResolvedValue([{ webhook_id: 'wh-1', event_type: 'PAYMENT.SALE.COMPLETED', resource_id: 'txn-webhook-missing', status: 'processed', processed_at: new Date('2026-03-06T08:35:00.000Z'), createdAt: new Date('2026-03-06T08:34:00.000Z') }]) },
            now,
            lookbackHours: 24,
            attemptGraceMinutes: 15
        });

        expect(result.status).toBe('degraded');
        expect(result.missingCorrelationCount).toBe(1);
        expect(result.missingOutcomeCount).toBe(1);
        expect(result.orphanAttemptCount).toBe(1);
        expect(result.duplicateEventCount).toBe(1);
        expect(result.paymentWithoutTelemetryCount).toBe(1);
        expect(result.tenantStateMismatchCount).toBeGreaterThanOrEqual(1);
        expect(result.webhookWithoutTelemetryCount).toBe(1);
        expect(result.routeOutcomeMismatchCount).toBe(1);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'missing_correlation_id', event_type: 'paypal_payment_sale_completed' }),
            expect.objectContaining({ type: 'missing_outcome', event_type: 'company_registration_succeeded' }),
            expect.objectContaining({ type: 'orphan_attempt', event_type: 'premium_upgrade_attempted', correlation_id: 'req-up-1' }),
            expect.objectContaining({ type: 'duplicate_event_key', event_type: 'paypal_subscription_cancelled', correlation_id: 'sub-1', count: 2 }),
            expect.objectContaining({ type: 'payment_without_telemetry', correlation_id: 'txn-missing' }),
            expect.objectContaining({ type: 'premium_upgrade_state_mismatch', event_type: 'premium_upgrade_succeeded' }),
            expect.objectContaining({ type: 'webhook_without_telemetry', correlation_id: 'txn-webhook-missing' }),
            expect.objectContaining({ type: 'route_outcome_without_matching_telemetry', request_id: 'req-missing-route' })
        ]));
    });

    it('respects configured thresholds when deciding health status', async () => {
        const now = new Date('2026-03-06T10:00:00.000Z');
        const model = {
            findAll: jest.fn().mockResolvedValue([
                createEvent({
                    event_type: 'paypal_payment_sale_completed',
                    correlation_id: '',
                    metadata: { outcome: 'succeeded' },
                    event_time: new Date('2026-03-06T08:10:00.000Z')
                })
            ])
        };

        const result = await auditBillingFunnelIntegrity({
            engagementEventModel: model,
            paymentModel: null,
            tenantModel: null,
            webhookLogModel: null,
            now,
            thresholds: {
                missingCorrelationCount: 1,
                missingOutcomeCount: 0,
                orphanAttemptCount: 0,
                duplicateEventCount: 0,
                paymentWithoutTelemetryCount: 0,
                tenantStateMismatchCount: 0,
                webhookWithoutTelemetryCount: 0,
                recentWriteFailures: 0,
                recentSkips: 0
            }
        });

        expect(result.missingCorrelationCount).toBe(1);
        expect(result.status).toBe('healthy');
        expect(result.thresholdBreaches).toEqual([]);
    });

    it('returns degraded when the EngagementEvent model is unavailable', async () => {
        const result = await auditBillingFunnelIntegrity({
            engagementEventModel: null,
            now: new Date('2026-03-06T10:00:00.000Z')
        });

        expect(result.status).toBe('degraded');
        expect(result.errors).toEqual([
            expect.objectContaining({ scope: 'model' })
        ]);
    });
});
