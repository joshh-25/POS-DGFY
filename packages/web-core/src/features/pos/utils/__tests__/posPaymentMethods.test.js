import { describe, expect, it } from 'vitest';
import {
    formatPosTransactionPaymentMethods,
    matchesPosTransactionPaymentMethod,
    resolvePosTransactionPaymentMethods
} from '../posPaymentMethods.js';

describe('POS transaction payment methods', () => {
    const splitSale = {
        payment_type: 'cash',
        payment_breakdown: [
            { payment_type: 'gcash', amount: 365 },
            { payment_type: 'cash', amount: 100 }
        ]
    };

    it('matches every positive tender in a split sale regardless of the primary method', () => {
        expect(resolvePosTransactionPaymentMethods(splitSale)).toEqual(['gcash', 'cash']);
        expect(matchesPosTransactionPaymentMethod(splitSale, 'gcash')).toBe(true);
        expect(matchesPosTransactionPaymentMethod(splitSale, 'cash')).toBe(true);
        expect(matchesPosTransactionPaymentMethod(splitSale, 'card')).toBe(false);
        expect(formatPosTransactionPaymentMethods(splitSale)).toBe('GCash + Cash');

        const reversed = { ...splitSale, payment_breakdown: [...splitSale.payment_breakdown].reverse() };
        expect(matchesPosTransactionPaymentMethod(reversed, 'gcash')).toBe(true);
        expect(matchesPosTransactionPaymentMethod(reversed, 'cash')).toBe(true);

        const gcashAndCard = {
            payment_type: 'gcash',
            payment_breakdown: [
                { payment_type: 'gcash', amount: 250 },
                { payment_type: 'card', amount: 50 }
            ]
        };
        expect(matchesPosTransactionPaymentMethod(gcashAndCard, 'gcash')).toBe(true);
        expect(matchesPosTransactionPaymentMethod(gcashAndCard, 'card')).toBe(true);
        expect(formatPosTransactionPaymentMethods(gcashAndCard)).toBe('GCash + Card');
    });

    it('accepts serialized breakdowns, ignores zero entries, and preserves legacy rows', () => {
        expect(resolvePosTransactionPaymentMethods({
            payment_type: 'gcash',
            payment_breakdown: JSON.stringify([
                { payment_type: 'card', amount: 50 },
                { payment_type: 'gcash', amount: 0 }
            ])
        })).toEqual(['card']);
        expect(formatPosTransactionPaymentMethods({ payment_type: 'bank_transfer' })).toBe('Bank Transfer');
        expect(matchesPosTransactionPaymentMethod({ payment_type: 'gcash' }, 'gcash')).toBe(true);
    });
});
