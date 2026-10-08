import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();
const orderList = jest.fn();
const sequelize = { query };

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => name === 'sequelize' ? sequelize : null),
        getStore: jest.fn(() => ({ sequelize }))
    }
}));

jest.unstable_mockModule('../src/modules/businessAdmin/repositories/businessAdminOrderCenterRepository.js', () => ({
    businessAdminOrderCenterRepository: { listOrders: orderList }
}));

let businessAdminCustomerRepository;

beforeAll(async () => {
    ({ businessAdminCustomerRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminCustomerRepository.js'));
});

beforeEach(() => {
    query.mockReset();
    orderList.mockReset();
});

describe('Business Admin customer history canonical source', () => {
    it('keeps customer analytics local while reading related transactions from Order Center', async () => {
        query
            .mockResolvedValueOnce([{
                customer_key: 'linked:7',
                customer_id: 7,
                customer_name: 'Canonical Customer',
                customer_email: 'customer@example.test',
                customer_phone: '09170000000',
                customer_address: '12 Main Street, Iloilo City',
                visit_count: 2,
                total_spend: 250,
                average_order: 125,
                first_purchase_at: '2026-09-20T01:00:00.000Z',
                last_purchase_at: '2026-09-21T01:00:00.000Z'
            }])
            .mockResolvedValueOnce([{
                item_id: 3,
                item_name: 'Coffee',
                quantity: 2,
                net_spend: 250,
                order_count: 2
            }]);
        orderList.mockResolvedValue({
            orders: [{
                transaction_id: 42,
                invoice_number: 'INV-42',
                created_at: '2026-09-21T01:00:00.000Z',
                source: 'in_store',
                transaction_status: 'completed',
                payment_type: 'cash',
                total_amount: 125,
                branch_id: 9
            }],
            pagination: { page: 1, limit: 50, total: 1, total_pages: 1 }
        });

        const result = await businessAdminCustomerRepository.getCustomerDetail({
            profileRef: 'linked:7',
            dateFrom: '2026-09-21',
            dateTo: '2026-09-21',
            branchId: 9,
            allowedLocationIds: [9]
        });

        expect(orderList).toHaveBeenCalledWith({
            allowedLocationIds: [9],
            filters: expect.objectContaining({
                page: 1,
                limit: 50,
                branchId: 9,
                transactionStatus: 'completed',
                customerHistoryOnly: true,
                customerProfileRef: 'linked:7',
                endAtExclusive: expect.any(String)
            })
        });
        expect(query).toHaveBeenCalledTimes(2);
        expect(result.orders).toEqual([expect.objectContaining({
            transaction_id: 42,
            location_id: 9,
            total_amount: 125
        })]);
        expect(result.address_line).toBe('12 Main Street, Iloilo City');
        expect(result.meta.source).toBe('business_admin_order_center_customer_history');
    });

    it('returns the customer contact fields and scoped spend in the customer list', async () => {
        query
            .mockResolvedValueOnce([{ total: 1 }])
            .mockResolvedValueOnce([{
                customer_key: 'linked:8',
                customer_id: 8,
                customer_name: 'Address Customer',
                customer_email: 'address@example.test',
                customer_phone: '09171112222',
                customer_address: '8 Market Road, Iloilo City',
                visit_count: 3,
                total_spend: 900,
                average_order: 300,
                first_purchase_at: '2026-09-01T01:00:00.000Z',
                last_purchase_at: '2026-09-21T01:00:00.000Z',
                purchase_frequency_days: 10
            }]);

        const result = await businessAdminCustomerRepository.listCustomers({
            dateFrom: '2026-09-01',
            dateTo: '2026-09-21',
            branchId: 9,
            allowedLocationIds: [9]
        });

        expect(result.rows).toEqual([expect.objectContaining({
            name: 'Address Customer',
            address_line: '8 Market Road, Iloilo City',
            phone: '09171112222',
            total_spend: 900
        })]);
        expect(result.pagination.total).toBe(1);
        expect(query.mock.calls[0][0]).toContain('customer_addresses');
        expect(query.mock.calls[1][0]).toContain('delivery_address');
    });
});
