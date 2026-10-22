import { describe, expect, it } from '@jest/globals';
import {
    buildExpectedPosCashAmount,
    getPosCashPaymentAmountFromTransaction,
    summarizePosCashEvents
} from '../src/modules/pos/domain/posCashReconciliation.js';

describe('POS cash reconciliation helpers', () => {
    it('calculates expected drawer cash from opening cash, sales, and drawer events', () => {
        expect(summarizePosCashEvents([
            { event_type: 'cash_in', amount: 20 },
            { event_type: 'cash_out', amount: 30 },
            { event_type: 'ignored_event', amount: 999 }
        ])).toEqual(expect.objectContaining({
            cash_in_total: 20,
            cash_out_total: 30,
            net_events_total: -10
        }));

        expect(buildExpectedPosCashAmount({
            openingFloatAmount: 1000,
            cashSalesAmount: 250,
            cashEvents: [
                { event_type: 'cash_in', amount: 20 },
                { event_type: 'cash_out', amount: 30 }
            ]
        })).toBe(1240);
    });

    it('counts cash from split tenders and falls back to the legacy payment type', () => {
        expect(getPosCashPaymentAmountFromTransaction({
            payment_type: 'gcash',
            total_amount: 300,
            payment_breakdown: [
                { payment_type: 'gcash', amount: 200 },
                { payment_type: 'cash', amount: 100 }
            ]
        })).toBe(100);

        expect(getPosCashPaymentAmountFromTransaction({
            payment_type: 'cash',
            total_amount: 75,
            payment_breakdown: null
        })).toBe(75);
    });
});
