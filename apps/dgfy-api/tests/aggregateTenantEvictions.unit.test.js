import { createTenantEvictionAggregator } from '../scripts/aggregate-tenant-evictions.js';

const logLine = (event) => `2026-10-28T10:00:00.000Z \u001b[32minfo\u001b[39m: \u001b[32m${JSON.stringify(event)}\u001b[39m`;

describe('tenant connector eviction aggregation', () => {
    test('aggregates caller shares and time bounds without retaining other log fields', () => {
        const aggregator = createTenantEvictionAggregator();
        aggregator.addLine('unrelated log contains tenant-id-and-private-name');
        aggregator.addLine(logLine({
            event: 'tenant_connector.lru_eviction',
            timestamp: '2026-10-28T10:02:00.000Z',
            caller: 'scheduler.business-admin-alert',
            tenant_id: 'private-tenant-id',
            tenant_name: 'Private Tenant'
        }));
        aggregator.addLine(logLine({
            event: 'tenant_connector.lru_eviction',
            timestamp: '2026-10-28T10:01:00.000Z',
            caller: 'unknown'
        }));
        aggregator.addLine(logLine({
            event: 'tenant_connector.lru_eviction',
            timestamp: '2026-10-28T10:03:00.000Z',
            caller: 'user@example.com'
        }));
        aggregator.addLine(logLine({
            event: 'different_event',
            timestamp: '2026-10-28T10:04:00.000Z',
            caller: 'worker.image-a'
        }));

        const summary = aggregator.summary();
        expect(summary).toEqual({
            event: 'tenant_connector.lru_eviction_summary',
            total_evictions: 3,
            first_event_at: '2026-10-28T10:01:00.000Z',
            last_event_at: '2026-10-28T10:03:00.000Z',
            callers: [
                { caller: 'scheduler.business-admin-alert', count: 1, percent: 33.3 },
                { caller: 'unknown', count: 2, percent: 66.7 }
            ]
        });
        expect(JSON.stringify(summary)).not.toMatch(/tenant-id|tenant_id|tenant_name|Private Tenant|example\.com/i);
    });

    test('keeps unknown visible at zero when the selected window has no evictions', () => {
        const aggregator = createTenantEvictionAggregator();
        aggregator.addLine('no eviction records in this window');

        expect(aggregator.summary()).toEqual({
            event: 'tenant_connector.lru_eviction_summary',
            total_evictions: 0,
            first_event_at: null,
            last_event_at: null,
            callers: [{ caller: 'unknown', count: 0, percent: 0 }]
        });
    });
});
