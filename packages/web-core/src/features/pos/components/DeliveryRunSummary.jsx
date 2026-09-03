import React from 'react';

// Phase 264 (#1487). Renders the run-level money/delivery summary produced by
// serializeDeliveryRun's `summary` field (deliveryRunSerializer.js): total expected (sum of every
// member order's total_amount), total settled (sum of amount_paid -- a partially_paid downpayment
// order counts only what's actually been collected so far, an unpaid COD order counts 0 until its
// collection is recorded), outstanding (expected - settled), and delivered-order count vs.
// total-order count (DeliveryJob.status === 'delivered', not the order's own fulfillment_status).
// `summary` is entirely absent on responses that never hydrated member orders (the list endpoint) --
// this renders nothing rather than a misleading all-zero block in that case.

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export default function DeliveryRunSummary({ summary = null }) {
  if (!summary) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-600">Run summary</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Total expected" value={money(summary.total_expected_amount)} />
        <SummaryStat label="Total settled" value={money(summary.total_settled_amount)} />
        <SummaryStat label="Outstanding" value={money(summary.total_outstanding_amount)} />
        <SummaryStat
          label="Delivered"
          value={`${summary.delivered_order_count} / ${summary.total_order_count}`}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="text-sm font-black tabular-nums text-slate-950">{value}</p>
    </div>
  );
}
