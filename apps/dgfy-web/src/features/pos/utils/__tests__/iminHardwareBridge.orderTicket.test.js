import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    formatIminOrderTicketText,
    printReceiptWithIminBridge
} from '../iminHardwareBridge.js';

afterEach(() => {
    delete globalThis.window;
});

describe('iMin order-ticket and receipt identity formatting', () => {
    it('prints supported item-name payloads and order notes before using an item-number fallback', () => {
        const output = formatIminOrderTicketText({
            cart: [
                { item_id: 91, item_name: 'Classic Burger', quantity: 1 },
                { item_id: 92, item: { name: 'Iced Tea' }, quantity: 2 },
                { item_id: 93, item_snapshot: { name: 'French Fries' }, quantity: 1 },
                { item_id: 94, name: 'Chocolate Cake', quantity: 1 },
                { item_id: 95, itemName: 'Hot Coffee', quantity: 1 },
                { item_id: 96, quantity: 1 }
            ],
            terminalId: 'COUNTER-01',
            orderMethod: 'pickup',
            orderNotes: 'Pack sauces separately'
        });

        expect(output).toContain('1 x Classic Burger');
        expect(output).toContain('2 x Iced Tea');
        expect(output).toContain('1 x French Fries');
        expect(output).toContain('1 x Chocolate Cake');
        expect(output).toContain('1 x Hot Coffee');
        expect(output).toContain('1 x Item #96');
        expect(output).toContain('Order notes: Pack sauces separately');
    });

    it('sends the configured tenant business icon before printing receipt text', () => {
        const printBitmap = vi.fn(() => ({ success: true }));
        const printReceipt = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printBitmap,
                printReceipt
            }
        };

        const outcome = printReceiptWithIminBridge({
            transaction: { pos_transaction_id: 1, lines: [] },
            businessSettings: {
                storefront_profile_image_url: '/uploads/storefront-assets/t1/business-icon.png'
            },
            openDrawerAfterPrint: false
        });

        expect(outcome.handled).toBe(true);
        expect(outcome.result.success).toBe(true);
        expect(printBitmap).toHaveBeenCalledTimes(1);
        expect(printBitmap.mock.calls[0][0]).toContain('/uploads/storefront-assets/t1/business-icon.png');
        expect(printBitmap.mock.calls[0][1]).toMatchObject({ align: 'center', dither: true });
        expect(printReceipt).toHaveBeenCalledTimes(1);
    });
});
