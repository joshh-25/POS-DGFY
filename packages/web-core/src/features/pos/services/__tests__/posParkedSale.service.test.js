import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import { cancelPosParkedSale, claimPosParkedSale, createPosParkedSale, fetchPosParkedSales, reparkPosParkedSale } from '../posService.js';

describe('POS parked-sale service', () => {
    beforeEach(() => {
        apiMock.get.mockReset();
        apiMock.post.mockReset();
    });

    it('posts the tenant-scoped parked-sale payload with the registered terminal header', async () => {
        apiMock.post.mockResolvedValue({
            data: {
                data: {
                    pos_parked_sale_id: 17,
                    park_reference: 'PARK-ABC123'
                }
            }
        });

        const payload = {
            idempotency_key: 'park-request-001',
            shift_id: 41,
            terminal_id: 'counter-01',
            location_id: 3,
            snapshot: { lines: [{ item_id: 7, quantity: 1, sale_price: 125 }] },
            subtotal_amount: 125,
            total_amount: 125
        };

        const result = await createPosParkedSale(payload);

        expect(result).toEqual({ pos_parked_sale_id: 17, park_reference: 'PARK-ABC123' });
        expect(apiMock.post).toHaveBeenCalledWith(
            '/pos/parked-sales',
            payload,
            { headers: { 'x-pos-terminal-id': 'COUNTER-01' } }
        );
    });

    it('preserves API failures so the checkout surface can keep the cart open', async () => {
        const error = new Error('network unavailable');
        apiMock.post.mockRejectedValue(error);

        await expect(createPosParkedSale({ terminal_id: 'COUNTER-01' })).rejects.toBe(error);
    });

    it('lists only the active shift scope requested by the cashier', async () => {
        apiMock.get.mockResolvedValue({
            data: {
                data: {
                    parked_sales: [{ pos_parked_sale_id: 17, status: 'parked' }],
                    count: 1,
                    shift_id: 41,
                    location_id: 3
                }
            }
        });

        const result = await fetchPosParkedSales({ shift_id: 41, location_id: 3, limit: 100 });

        expect(result.parked_sales).toHaveLength(1);
        expect(apiMock.get).toHaveBeenCalledWith('/pos/parked-sales', {
            params: { shift_id: 41, location_id: 3, limit: 100 }
        });
    });

    it('claims a parked sale with the registered terminal header', async () => {
        apiMock.post.mockResolvedValue({
            data: {
                data: {
                    pos_parked_sale_id: 17,
                    park_reference: 'PARK-ABC123',
                    status: 'claimed',
                    snapshot: { lines: [{ item_id: 7, quantity: 1, sale_price: 125 }] }
                }
            }
        });

        const result = await claimPosParkedSale(17, {
            shift_id: 41,
            terminal_id: 'counter-01',
            location_id: 3
        });

        expect(result.status).toBe('claimed');
        expect(apiMock.post).toHaveBeenCalledWith(
            '/pos/parked-sales/17/claim',
            { shift_id: 41, terminal_id: 'counter-01', location_id: 3 },
            { headers: { 'x-pos-terminal-id': 'COUNTER-01' } }
        );
    });

    it('cancels a parked sale with the scoped terminal header and reason', async () => {
        apiMock.post.mockResolvedValue({
            data: {
                data: {
                    pos_parked_sale_id: 17,
                    status: 'cancelled'
                }
            }
        });

        const result = await cancelPosParkedSale(17, {
            shift_id: 41,
            terminal_id: 'counter-01',
            location_id: 3,
            reason: 'Customer left'
        });

        expect(result.status).toBe('cancelled');
        expect(apiMock.post).toHaveBeenCalledWith(
            '/pos/parked-sales/17/cancel',
            { shift_id: 41, terminal_id: 'counter-01', location_id: 3, reason: 'Customer left' },
            { headers: { 'x-pos-terminal-id': 'COUNTER-01' } }
        );
    });

    it('updates the same parked-sale record with its expected revision', async () => {
        apiMock.post.mockResolvedValue({
            data: { data: { pos_parked_sale_id: 17, status: 'parked', revision: 3 } }
        });
        const payload = {
            shift_id: 41,
            terminal_id: 'counter-01',
            location_id: 3,
            expected_revision: 2,
            snapshot: { lines: [{ item_id: 7, quantity: 2, sale_price: 125 }] },
            subtotal_amount: 250,
            total_amount: 250
        };

        const result = await reparkPosParkedSale(17, payload);

        expect(result.revision).toBe(3);
        expect(apiMock.post).toHaveBeenCalledWith(
            '/pos/parked-sales/17/repark',
            payload,
            { headers: { 'x-pos-terminal-id': 'COUNTER-01' } }
        );
    });
});
