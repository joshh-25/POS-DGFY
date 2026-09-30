import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';

const findAndCountAll = jest.fn();
const literal = jest.fn((value) => ({ literal: value }));
const where = jest.fn((left, right) => ({ left, right }));
const sequelize = { literal, where };
const models = new Map([
    ['PosTransaction', { findAndCountAll }],
    ['TenantLocation', { modelName: 'TenantLocation' }],
    ['User', { modelName: 'User' }],
    ['PosTerminalShift', { modelName: 'PosTerminalShift' }],
    ['DeliveryJob', { modelName: 'DeliveryJob' }],
    ['StoreCustomer', { modelName: 'StoreCustomer' }]
]);

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((name) => name === 'sequelize' ? sequelize : models.get(name) || null),
        getStore: jest.fn(() => ({ sequelize }))
    }
}));

let businessAdminOrderCenterRepository;

beforeAll(async () => {
    ({ businessAdminOrderCenterRepository } = await import('../src/modules/businessAdmin/repositories/businessAdminOrderCenterRepository.js'));
});

beforeEach(() => {
    findAndCountAll.mockReset();
    literal.mockClear();
    where.mockClear();
});

describe('Business Admin Order Center customer-history source', () => {
    it('filters customer history through the canonical Order Center and preserves linked customer identity', async () => {
        findAndCountAll.mockResolvedValue({
            rows: [{
                pos_transaction_id: 42,
                invoice_number: 'INV-42',
                created_at: '2026-09-21T01:00:00.000Z',
                order_source: 'in_store',
                status: 'completed',
                payment_type: 'cash',
                payment_status: 'paid',
                total_amount: 125,
                location_id: 9,
                storeCustomer: { name: 'Canonical Customer', email: 'customer@example.test', phone: '09170000000' }
            }],
            count: 1
        });

        const result = await businessAdminOrderCenterRepository.listOrders({
            filters: {
                page: 1,
                limit: 50,
                transactionStatus: 'completed',
                customerHistoryOnly: true,
                customerProfileRef: 'linked:7',
                startAt: '2026-09-21 00:00:00',
                endAt: '2026-09-21 23:59:59'
            }
        });

        const options = findAndCountAll.mock.calls[0][0];
        expect(options.where[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ left: expect.any(Object), right: 'linked:7' }),
            expect.objectContaining({ literal: expect.stringContaining("order_source = 'in_store'") })
        ]));
        expect(options.include).toEqual(expect.arrayContaining([
            expect.objectContaining({ as: 'storeCustomer', required: false })
        ]));
        expect(result.orders[0]).toMatchObject({
            transaction_id: 42,
            customer_name: 'Canonical Customer',
            customer_email: 'customer@example.test',
            customer_phone: '09170000000'
        });
        expect(result.pagination).toMatchObject({ page: 1, limit: 50, total: 1 });
    });

    it('applies an exact item filter in the canonical Order Center list query', async () => {
        findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

        await businessAdminOrderCenterRepository.listOrders({
            filters: { page: 1, limit: 25, itemId: 14 }
        });

        const options = findAndCountAll.mock.calls[0][0];
        expect(options.include).toEqual(expect.arrayContaining([
            expect.objectContaining({
                as: 'lines',
                required: true,
                where: { item_id: 14 }
            })
        ]));
    });

    it('keeps sales, finalized refunds, and voided receipts mutually distinguishable', async () => {
        findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

        const runFilter = async (receiptType) => {
            await businessAdminOrderCenterRepository.listOrders({
                filters: { page: 1, limit: 20, receiptType }
            });
            return findAndCountAll.mock.calls.at(-1)[0].where;
        };

        const salesWhere = await runFilter('sales');
        expect(salesWhere[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: 'completed' }),
            expect.objectContaining({
                payment_status: { [Op.notIn]: ['refund_pending', 'partial_refunded', 'refunded'] }
            })
        ]));

        const refundWhere = await runFilter('refund');
        expect(refundWhere[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: 'completed' }),
            expect.objectContaining({
                payment_status: { [Op.in]: ['partial_refunded', 'refunded'] }
            })
        ]));

        const voidedWhere = await runFilter('voided');
        expect(voidedWhere[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ status: 'voided' })
        ]));
    });
});
