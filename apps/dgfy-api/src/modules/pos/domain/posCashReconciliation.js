import { getPosCashPaymentAmount } from '../utils/paymentBreakdown.js';

export const POS_CASH_EVENT_EFFECT = Object.freeze({
    cash_in: 1,
    opening_adjustment: 1,
    cash_out: -1,
    closing_adjustment: -1
});

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const parseJsonLoosely = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'string') {
            try {
                return JSON.parse(parsed);
            } catch {
                return parsed;
            }
        }
        return parsed;
    } catch {
        return null;
    }
};

export const summarizePosCashEvents = (events = []) => {
    const summary = {
        cash_in_total: 0,
        cash_out_total: 0,
        opening_adjustment_total: 0,
        closing_adjustment_total: 0,
        net_events_total: 0
    };

    (Array.isArray(events) ? events : []).forEach((event) => {
        const eventType = String(event?.event_type || '').trim();
        const effect = POS_CASH_EVENT_EFFECT[eventType];
        if (!effect) return;

        const amount = round4(event?.amount);
        const summaryKey = `${eventType}_total`;
        if (Object.prototype.hasOwnProperty.call(summary, summaryKey)) {
            summary[summaryKey] = round4(summary[summaryKey] + amount);
        }
        summary.net_events_total = round4(summary.net_events_total + (amount * effect));
    });

    return summary;
};

export const buildExpectedPosCashAmount = ({
    openingFloatAmount = 0,
    cashSalesAmount = 0,
    cashEvents = []
} = {}) => {
    const eventSummary = summarizePosCashEvents(cashEvents);
    return round4(
        round4(openingFloatAmount)
        + eventSummary.net_events_total
        + round4(cashSalesAmount)
    );
};

export const getPosCashPaymentAmountFromTransaction = (transaction = {}) => {
    const parsedBreakdown = parseJsonLoosely(transaction.payment_breakdown);
    const entries = Array.isArray(parsedBreakdown) && parsedBreakdown.length > 0
        ? parsedBreakdown
        : [{
            payment_type: transaction.payment_type,
            amount: transaction.total_amount
        }];
    return getPosCashPaymentAmount(entries);
};
