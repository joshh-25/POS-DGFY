export default [
    {
        event_type: 'premium_upgrade_attempted',
        tenant_id: 'tenant-1',
        subscription_id: 'sub-1',
        correlation_id: 'req-up-1',
        metadata: { outcome: 'attempted' },
        event_time: new Date('2026-03-06T08:00:00.000Z')
    },
    {
        event_type: 'paypal_payment_sale_completed',
        tenant_id: 'tenant-1',
        subscription_id: 'sub-1',
        correlation_id: '',
        metadata: { outcome: 'succeeded' },
        event_time: new Date('2026-03-06T08:10:00.000Z')
    }
];
