import { jest } from '@jest/globals';

describe('engagementService write audit', () => {
    afterEach(async () => {
        const module = await import('../src/services/engagementService.js');
        module.__resetEngagementWriteAuditForTests();
        delete global.__ENGAGEMENT_EVENT_MODEL_OVERRIDE__;
    });

    it('tracks created, deduped, failed, and skipped write outcomes', async () => {
        const findOrCreate = jest.fn()
            .mockResolvedValueOnce([{ id: 'evt-1' }, true])
            .mockResolvedValueOnce([{ id: 'evt-1' }, false]);
        const create = jest.fn().mockRejectedValueOnce(new Error('write exploded'));

        global.__ENGAGEMENT_EVENT_MODEL_OVERRIDE__ = {
            findOrCreate,
            create
        };

        const module = await import('../src/services/engagementService.js');

        await module.trackEngagementEvent({
            eventType: 'premium_upgrade_attempted',
            correlationId: 'req-1',
            useIdempotency: true
        });
        await module.trackEngagementEvent({
            eventType: 'premium_upgrade_attempted',
            correlationId: 'req-1',
            useIdempotency: true
        });
        await module.trackEngagementEvent({
            eventType: 'premium_upgrade_failed',
            correlationId: 'req-1'
        });
        await module.trackEngagementEvent({});

        const stats = module.getEngagementWriteAuditStats({
            now: new Date(),
            lookbackHours: 24
        });

        expect(stats.totalTracked).toBe(4);
        expect(stats.writeFailedCount).toBe(1);
        expect(stats.skippedCount).toBe(1);
        expect(stats.missingEventTypeCount).toBe(1);
        expect(stats.tableMissingCount).toBe(0);
        expect(stats.modelUnavailableCount).toBe(0);
    });

    it('writes expanded schema fields into the persistence payload', async () => {
        const findOrCreate = jest.fn().mockResolvedValueOnce([{ id: 'evt-2' }, true]);

        global.__ENGAGEMENT_EVENT_MODEL_OVERRIDE__ = {
            findOrCreate,
            create: jest.fn()
        };

        const module = await import('../src/services/engagementService.js');

        await module.trackEngagementEvent({
            eventType: 'paypal_webhook_failed',
            eventCategory: 'billing_funnel',
            eventVersion: 1,
            correlationId: 'webhook-1',
            requestId: 'req-1',
            traceId: 'trace-1',
            outcome: 'failed',
            failureCode: 'processing_failed',
            failureReason: 'boom',
            providerEventId: 'WH-123',
            providerEventTime: new Date('2026-03-06T09:00:00.000Z'),
            environment: 'test',
            surface: '/api/v1/payments/webhook',
            actorType: 'system',
            isInternalActor: false,
            isBotSuspected: false,
            useIdempotency: true
        });

        const call = findOrCreate.mock.calls[0][0];
        expect(call.defaults).toMatchObject({
            event_type: 'paypal_webhook_failed',
            event_category: 'billing_funnel',
            event_version: 1,
            correlation_id: 'webhook-1',
            request_id: 'req-1',
            trace_id: 'trace-1',
            outcome: 'failed',
            failure_code: 'processing_failed',
            failure_reason: 'boom',
            provider_event_id: 'WH-123',
            environment: 'test',
            surface: '/api/v1/payments/webhook',
            actor_type: 'system',
            is_internal_actor: false,
            is_bot_suspected: false
        });
        expect(call.defaults.provider_event_time).toEqual(new Date('2026-03-06T09:00:00.000Z'));
    });
});
