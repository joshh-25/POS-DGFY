export default [
    {
        event_type: 'company_registration_attempted',
        tenant_id: 'tenant-1',
        subscription_id: 'sub-1',
        correlation_id: 'req-1',
        metadata: { outcome: 'attempted' },
        event_time: new Date('2026-03-06T09:00:00.000Z')
    },
    {
        event_type: 'company_registration_succeeded',
        tenant_id: 'tenant-1',
        subscription_id: 'sub-1',
        correlation_id: 'req-1',
        metadata: { outcome: 'succeeded' },
        event_time: new Date('2026-03-06T09:00:05.000Z')
    }
];
