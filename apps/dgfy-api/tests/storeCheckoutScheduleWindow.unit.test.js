import { jest } from '@jest/globals';

const { buildStoreCartQuoteUseCase } = await import('../src/modules/store/usecases/storeUseCases.js');

const storefrontHours = {
    mode: 'weekly', timezone: 'Asia/Manila',
    weekly: Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, {
        enabled: true, intervals: [{ open: '00:00', close: '00:00' }]
    }]))
};

const repository = () => ({
    findLocationById: jest.fn().mockResolvedValue({
        location_id: 2, name: 'Main', is_open: true, is_active: true,
        supports_delivery: true, supports_pickup: true, supports_dine_in: true,
        fulfillment_lead_time_min_days: 2, fulfillment_lead_time_max_days: 4
    }),
    getSettingsByKeys: jest.fn().mockResolvedValue([
        { setting_key: 'customer_access_mode', setting_value: 'transaction' },
        { setting_key: 'tenant_onboarding_progress', setting_value: JSON.stringify({ step_payloads: { business_classification: { legitimacy: { registration_status: 'registered' } } } }) },
        { setting_key: 'storefront_hours', setting_value: JSON.stringify(storefrontHours) },
        { setting_key: 'pos_open_status', setting_value: 'true' }
    ]),
    findSellableItemsByIds: jest.fn().mockResolvedValue([{
        item_id: 40, name: 'Widget', current_stock: 100, default_sale_price: 80,
        cost_per_unit: 67, unit_of_measure: 'pc', vat_type: 'vatable'
    }])
});

const payload = (method, scheduledFor) => ({
    location_id: 2, order_method: method, payment_type: 'cash',
    scheduled_for: scheduledFor, lines: [{ item_id: 40, quantity: 1 }]
});

describe('storefront scheduled checkout guards', () => {
    test.each(['delivery', 'pickup', 'dine_in'])('rejects past %s schedules before quoting', async (method) => {
        const quote = buildStoreCartQuoteUseCase({ storeRepository: repository() });
        const result = await quote({ payload: payload(method, new Date(Date.now() - 86400000).toISOString()) });
        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe(method === 'dine_in' ? 'DINE_IN_SCHEDULE_MUST_BE_FUTURE' : 'SCHEDULE_MUST_BE_FUTURE');
    });

    test('rejects a future pickup outside the configured lead-time window', async () => {
        const quote = buildStoreCartQuoteUseCase({ storeRepository: repository() });
        const result = await quote({ payload: payload('pickup', new Date(Date.now() + 7 * 86400000).toISOString()) });
        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('SCHEDULE_OUTSIDE_LEAD_TIME_WINDOW');
    });
});
