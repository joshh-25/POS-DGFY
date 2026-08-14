import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    formatIminOrderTicketText,
    printOrderWithIminBridge,
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

    it('sends the configured tenant business icon in the same print command as the receipt text', () => {
        const printReceiptWithLogo = vi.fn(() => ({ success: true }));
        const printReceipt = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printReceiptWithLogo,
                printReceipt
            }
        };

        const outcome = printReceiptWithIminBridge({
            transaction: { pos_transaction_id: 1, lines: [] },
            businessSettings: {
                storefront_profile_image_url: 'https://cdn.dgfy.ph/uploads/storefront-assets/t1/business-icon.png'
            },
            openDrawerAfterPrint: false
        });

        expect(outcome.handled).toBe(true);
        expect(outcome.result.success).toBe(true);
        expect(printReceiptWithLogo).toHaveBeenCalledTimes(1);
        expect(printReceiptWithLogo.mock.calls[0][1]).toBe(false);
        expect(printReceiptWithLogo.mock.calls[0][2]).toBe(
            'https://cdn.dgfy.ph/uploads/storefront-assets/t1/business-icon.png'
        );
        expect(printReceipt).not.toHaveBeenCalled();
    });

    it('sends an empty logo source when no company icon is configured', () => {
        const printReceiptWithLogo = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printReceiptWithLogo,
                printReceipt: vi.fn(() => ({ success: true }))
            }
        };

        printReceiptWithIminBridge({
            transaction: { pos_transaction_id: 1, lines: [] },
            businessSettings: {},
            openDrawerAfterPrint: false
        });

        expect(printReceiptWithLogo.mock.calls[0][2]).toBe('');
    });

    it('does not forward a logo path native cannot resolve on its own', () => {
        // No asset origin is configured in this test environment, so a root-relative
        // upload path stays root-relative -- native can only fetch an absolute
        // http(s) URL or decode a data: URI (see isNativeFetchableLogoSource).
        const printReceiptWithLogo = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printReceiptWithLogo,
                printReceipt: vi.fn(() => ({ success: true }))
            }
        };

        printReceiptWithIminBridge({
            transaction: { pos_transaction_id: 1, lines: [] },
            businessSettings: {
                storefront_profile_image_url: '/uploads/storefront-assets/t1/business-icon.png'
            },
            openDrawerAfterPrint: false
        });

        expect(printReceiptWithLogo.mock.calls[0][2]).toBe('');
    });

    it('falls back to the plain two-arg printReceipt on a bridge without printReceiptWithLogo', () => {
        const printReceipt = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printReceipt
            }
        };

        const outcome = printReceiptWithIminBridge({
            transaction: { pos_transaction_id: 1, lines: [] },
            businessSettings: {
                storefront_profile_image_url: 'https://cdn.dgfy.ph/uploads/storefront-assets/t1/business-icon.png'
            },
            openDrawerAfterPrint: true
        });

        expect(outcome.handled).toBe(true);
        expect(outcome.result.success).toBe(true);
        expect(printReceipt).toHaveBeenCalledTimes(1);
        expect(printReceipt.mock.calls[0][1]).toBe(true);
    });

    it('prints order tickets without a logo, via the plain printReceipt call', () => {
        const printReceiptWithLogo = vi.fn(() => ({ success: true }));
        const printReceipt = vi.fn(() => ({ success: true }));
        globalThis.window = {
            iMinBridge: {
                isIminWrapper: () => true,
                printReceiptWithLogo,
                printReceipt
            }
        };

        printOrderWithIminBridge({
            cart: [{ item_id: 1, item_name: 'Iced Tea', quantity: 1 }],
            terminalId: 'COUNTER-01'
        });

        expect(printReceiptWithLogo).not.toHaveBeenCalled();
        expect(printReceipt).toHaveBeenCalledTimes(1);
        expect(printReceipt.mock.calls[0][1]).toBe(false);
    });
});
