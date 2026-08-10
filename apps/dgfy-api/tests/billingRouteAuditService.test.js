import {
    recordBillingRouteOutcome,
    getBillingRouteOutcomes,
    __resetBillingRouteAuditForTests
} from '../src/services/billingRouteAuditService.js';

describe('billingRouteAuditService', () => {
    afterEach(() => {
        __resetBillingRouteAuditForTests();
    });

    it('records only billing funnel routes', () => {
        recordBillingRouteOutcome({
            method: 'POST',
            route: '/api/v1/payments/upgrade',
            statusCode: 200,
            requestId: 'req-1',
            timestamp: new Date('2026-03-06T09:00:00.000Z')
        });
        recordBillingRouteOutcome({
            method: 'GET',
            route: '/health',
            statusCode: 200,
            requestId: 'req-2',
            timestamp: new Date('2026-03-06T09:00:00.000Z')
        });

        const entries = getBillingRouteOutcomes({
            now: new Date('2026-03-06T10:00:00.000Z'),
            lookbackHours: 24
        });

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            route: 'POST /api/v1/payments/upgrade',
            statusCode: 200,
            requestId: 'req-1'
        });
    });
});
