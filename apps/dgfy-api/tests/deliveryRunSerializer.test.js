import { describe, expect, it } from '@jest/globals';
import { serializeDeliveryRun, serializeDeliveryRunMember } from '../src/modules/pos/serializers/deliveryRunSerializer.js';

// Phase 264 (#1487): direct unit coverage for the run-level summary (`serializeDeliveryRun`'s
// `summary` block) -- no DB, no fake repository, exercised straight against plain member objects
// shaped like `deliveryRunRepository.getRunDetail`'s hydrated `deliveryJobs[].transaction` rows.

const baseRun = {
    delivery_run_id: 1,
    label: 'Run A',
    status: 'scheduled',
    personnel: []
};

const buildMember = (overrides = {}) => ({
    delivery_job_id: overrides.delivery_job_id ?? 1,
    pos_transaction_id: overrides.pos_transaction_id ?? 101,
    status: overrides.status ?? 'pending_dispatch',
    provider: 'manual',
    transaction: {
        pos_transaction_id: overrides.pos_transaction_id ?? 101,
        invoice_number: `INV-${overrides.pos_transaction_id ?? 101}`,
        customer_name: 'Customer',
        delivery_address: 'Address',
        fulfillment_status: 'preparing',
        total_amount: overrides.total_amount ?? '0.0000',
        amount_paid: overrides.amount_paid ?? '0.0000',
        balance_due: overrides.balance_due ?? '0.0000',
        payment_status: overrides.payment_status ?? 'unpaid'
    }
});

describe('serializeDeliveryRunMember (Phase 264, #1487)', () => {
    it('mirrors total_amount/amount_paid/balance_due/payment_status onto member.order', () => {
        const member = serializeDeliveryRunMember({
            delivery_job_id: 1,
            pos_transaction_id: 101,
            status: 'delivered',
            transaction: {
                pos_transaction_id: 101,
                total_amount: '500.0000',
                amount_paid: '200.0000',
                balance_due: '300.0000',
                payment_status: 'partially_paid'
            }
        });

        expect(member.order).toMatchObject({
            total_amount: '500.0000',
            amount_paid: '200.0000',
            balance_due: '300.0000',
            payment_status: 'partially_paid'
        });
    });
});

describe('serializeDeliveryRun summary (Phase 264, #1487)', () => {
    it('is absent when member orders were never hydrated (list-endpoint shape)', () => {
        const serialized = serializeDeliveryRun(baseRun, { memberCount: 3 });
        expect(serialized.member_count).toBe(3);
        expect(serialized.summary).toBeUndefined();
    });

    it('is all-zero for a run with no members', () => {
        const serialized = serializeDeliveryRun(baseRun, { members: [] });
        expect(serialized.summary).toEqual({
            total_expected_amount: 0,
            total_settled_amount: 0,
            total_outstanding_amount: 0,
            delivered_order_count: 0,
            total_order_count: 0
        });
    });

    // The three payment shapes named explicitly in the phase corrections: fully paid, a
    // partially_paid downpayment split, and an unpaid COD order.
    it('sums total_amount as expected and only actually-collected amount_paid as settled', () => {
        const members = [
            buildMember({ pos_transaction_id: 1, total_amount: '500.0000', amount_paid: '500.0000', balance_due: '0.0000', payment_status: 'paid', status: 'delivered' }),
            buildMember({ pos_transaction_id: 2, total_amount: '300.0000', amount_paid: '100.0000', balance_due: '200.0000', payment_status: 'partially_paid', status: 'picked_up' }),
            buildMember({ pos_transaction_id: 3, total_amount: '200.0000', amount_paid: '0.0000', balance_due: '200.0000', payment_status: 'unpaid', status: 'pending_dispatch' })
        ];
        const run = { ...baseRun, deliveryJobs: members };

        const serialized = serializeDeliveryRun(run);

        expect(serialized.summary).toEqual({
            total_expected_amount: 1000,
            // 500 (paid in full) + 100 (partial downpayment already collected) + 0 (unpaid COD,
            // nothing collected yet) -- the remaining 200 balance_due on the partially_paid order
            // and the full 200 on the unpaid order are NOT counted as settled.
            total_settled_amount: 600,
            total_outstanding_amount: 400,
            // Only the `delivered` job counts -- picked_up/pending_dispatch don't, regardless of
            // how much of their order has been paid.
            delivered_order_count: 1,
            total_order_count: 3
        });
    });

    it('counts delivered_order_count from DeliveryJob.status, independent of the order\'s own fulfillment_status', () => {
        // The job is marked delivered even though the order's own fulfillment_status was never
        // separately advanced past 'preparing' -- the summary must read the job's status, not the
        // order's, since they're two independent state machines (posUseCases.js's own
        // DELIVERY_JOB_STATUS_TRANSITIONS vs. the order's fulfillment_status enum).
        const members = [
            buildMember({ pos_transaction_id: 1, status: 'delivered' }),
            buildMember({ pos_transaction_id: 2, status: 'failed' })
        ];
        const run = { ...baseRun, deliveryJobs: members };

        const serialized = serializeDeliveryRun(run);

        expect(serialized.summary.delivered_order_count).toBe(1);
        expect(serialized.summary.total_order_count).toBe(2);
    });

    it('a freshly created run (members: []) reports an all-zero summary, not an absent one', () => {
        const serialized = serializeDeliveryRun(baseRun, { members: [] });
        expect(serialized.summary).not.toBeUndefined();
        expect(serialized.summary.total_order_count).toBe(0);
    });
});
