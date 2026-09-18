// Phase 225 (#1273/#1081): response shape for a delivery run + its personnel roster + member jobs.

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

// Phase 264 (#1487): same rounding convention as buildReportShiftMoney (posRepository.js) --
// DECIMAL(14,4) columns come back as strings from Sequelize, Number() + this keeps every summed
// total exact to 4dp instead of drifting on repeated float addition.
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const serializeDeliveryRunPersonnel = (row) => {
    const plain = toPlain(row);
    if (!plain) return null;
    return {
        delivery_run_personnel_id: plain.delivery_run_personnel_id,
        delivery_personnel_id: plain.delivery_personnel_id ?? null,
        delivery_personnel_name: plain.delivery_personnel_name ?? null,
        is_accountable: Boolean(plain.is_accountable),
        created_at: plain.created_at ?? null,
        updated_at: plain.updated_at ?? null
    };
};

export const serializeDeliveryRunMember = (deliveryJob) => {
    const plain = toPlain(deliveryJob);
    if (!plain) return null;
    const order = toPlain(plain.transaction) || {};
    return {
        delivery_job_id: plain.delivery_job_id,
        pos_transaction_id: plain.pos_transaction_id,
        status: plain.status,
        provider: plain.provider,
        delivery_personnel_id: plain.delivery_personnel_id ?? null,
        delivery_personnel_name: plain.delivery_personnel_name ?? null,
        loading_state: plain.loading_state || 'pending',
        loading_exception_reason: plain.loading_exception_reason ?? null,
        loading_marked_by: plain.loading_marked_by ?? null,
        loading_marked_at: plain.loading_marked_at ?? null,
        assigned_by: plain.assigned_by ?? null,
        assigned_shift_id: plain.assigned_shift_id ?? null,
        assigned_at: plain.assigned_at ?? null,
        order: {
            pos_transaction_id: order.pos_transaction_id ?? plain.pos_transaction_id,
            invoice_number: order.invoice_number ?? null,
            customer_name: order.customer_name ?? null,
            delivery_address: order.delivery_address ?? null,
            fulfillment_status: order.fulfillment_status ?? null,
            // Phase 264 (#1487): mirrors the widened attribute list in
            // deliveryRunRepository.js's getRunDetail -- feeds both this per-member display and
            // serializeDeliveryRun's run-level summary below.
            total_amount: order.total_amount ?? null,
            amount_paid: order.amount_paid ?? null,
            balance_due: order.balance_due ?? null,
            payment_status: order.payment_status ?? null
        }
    };
};

export const serializeDeliveryRunRemittanceVariance = (row) => {
    const plain = toPlain(row);
    if (!plain) return null;
    const reversals = Array.isArray(plain.reversals) ? plain.reversals : [];
    const reversal = reversals[0] || null;
    return {
        delivery_run_remittance_variance_id: plain.delivery_run_remittance_variance_id,
        delivery_run_remittance_allocation_id: plain.delivery_run_remittance_allocation_id,
        entry_type: plain.entry_type,
        reversal_of_variance_id: plain.reversal_of_variance_id ?? null,
        direction: plain.direction,
        amount: plain.amount ?? null,
        reason: plain.reason,
        recorded_by: plain.recorded_by ?? null,
        recorded_at: plain.recorded_at ?? null,
        resolved: plain.entry_type === 'original' && Boolean(reversal),
        resolved_by: reversal?.recorded_by ?? null,
        resolved_at: reversal?.recorded_at ?? null,
        resolution_reason: reversal?.reason ?? null
    };
};

export const serializeDeliveryRunRemittanceAllocation = (row) => {
    const plain = toPlain(row);
    if (!plain) return null;
    return {
        delivery_run_remittance_allocation_id: plain.delivery_run_remittance_allocation_id,
        delivery_run_remittance_id: plain.delivery_run_remittance_id,
        pos_transaction_id: plain.pos_transaction_id,
        delivery_personnel_id: plain.delivery_personnel_id ?? null,
        delivery_personnel_name: plain.delivery_personnel_name ?? null,
        expected_amount: plain.expected_amount ?? null,
        remitted_amount: plain.remitted_amount ?? null,
        variance_amount: plain.variance_amount ?? null,
        created_at: plain.created_at ?? null,
        variances: Array.isArray(plain.variances)
            ? plain.variances.map(serializeDeliveryRunRemittanceVariance)
            : []
    };
};

export const serializeDeliveryRunRemittance = (row) => {
    const plain = toPlain(row);
    if (!plain) return null;
    return {
        delivery_run_remittance_id: plain.delivery_run_remittance_id,
        delivery_run_id: plain.delivery_run_id,
        location_id: plain.location_id,
        confirmed_by: plain.confirmed_by,
        confirmed_at: plain.confirmed_at,
        total_expected_amount: plain.total_expected_amount,
        total_remitted_amount: plain.total_remitted_amount,
        total_variance_amount: plain.total_variance_amount,
        created_at: plain.created_at ?? null,
        updated_at: plain.updated_at ?? null,
        allocations: Array.isArray(plain.allocations)
            ? plain.allocations.map(serializeDeliveryRunRemittanceAllocation)
            : []
    };
};

// Phase 264 (#1487). No backend "settled" helper exists anywhere else in this codebase -- every
// other call site (posDeviceUseCases.js, posUseCases.js) inlines `balance_due <= 0` for a single
// order. This is the run-level equivalent, defined from scratch against the issue's own wording
// ("total expected: sum of order totals in the run", "total settled: sum of amounts actually
// collected/paid across the run's orders"):
//   - total_expected_amount: sum of each member's order.total_amount -- the full value of every
//     order assigned to this run, independent of what's been collected so far.
//   - total_settled_amount: sum of each member's order.amount_paid -- what's actually been
//     collected to date. A `partially_paid` downpayment-split order contributes only the partial
//     amount_paid already on record; its remaining balance_due is NOT counted as settled until a
//     later payment actually raises amount_paid. An `unpaid` COD order contributes 0 until the
//     courier's collection is recorded as a payment against the order (COD settlement updates
//     amount_paid/payment_status through the same payment-recording path as any other tender --
//     there is no separate COD money field to special-case here).
//   - total_outstanding_amount: total_expected_amount - total_settled_amount (equivalently, the
//     sum of each member's balance_due) -- not named by #1487's own three numbers, but trivially
//     derivable from the two above and the natural "how much is still owed on this run" answer.
//   - delivered_order_count / total_order_count: counts DeliveryJob.status === 'delivered' (the
//     job's own status -- not the order's separate fulfillment_status) against every member in
//     the run.
const buildDeliveryRunSummary = (members) => {
    const list = Array.isArray(members) ? members : [];
    let totalExpectedAmount = 0;
    let totalSettledAmount = 0;
    let deliveredOrderCount = 0;

    list.forEach((member) => {
        const order = member?.order || {};
        totalExpectedAmount = round4(totalExpectedAmount + (Number(order.total_amount) || 0));
        totalSettledAmount = round4(totalSettledAmount + (Number(order.amount_paid) || 0));
        if (member?.status === 'delivered') deliveredOrderCount += 1;
    });

    return {
        total_expected_amount: totalExpectedAmount,
        total_settled_amount: totalSettledAmount,
        total_outstanding_amount: round4(totalExpectedAmount - totalSettledAmount),
        delivered_order_count: deliveredOrderCount,
        total_order_count: list.length
    };
};

export const buildDeliveryRunLoadingSummary = (members) => {
    const summary = {
        pending_count: 0,
        loaded_count: 0,
        not_loaded_count: 0,
        exception_count: 0,
        total_count: 0
    };

    (Array.isArray(members) ? members : []).forEach((member) => {
        const plain = toPlain(member) || {};
        const loadingState = String(plain.loading_state || 'pending').trim().toLowerCase();
        const key = `${loadingState}_count`;
        if (!Object.prototype.hasOwnProperty.call(summary, key)) {
            summary.pending_count += 1;
        } else {
            summary[key] += 1;
        }
        summary.total_count += 1;
    });

    return summary;
};

export const serializeDeliveryRun = (run, { members = null, memberCount = null } = {}) => {
    const plain = toPlain(run);
    if (!plain) return null;

    const personnel = Array.isArray(plain.personnel)
        ? plain.personnel.map(serializeDeliveryRunPersonnel)
        : [];
    const resolvedMembers = members !== null
        ? members
        : (Array.isArray(plain.deliveryJobs) ? plain.deliveryJobs.map(serializeDeliveryRunMember) : null);
    // Phase 264 (#1487): only computable when member orders are actually hydrated -- the list
    // endpoint (serializeDeliveryRun(run, { memberCount })) never loads per-order money fields, so
    // resolvedMembers stays null there and this stays absent rather than reporting a false zero.
    const summary = resolvedMembers !== null ? buildDeliveryRunSummary(resolvedMembers) : null;
    const loadingSummary = resolvedMembers !== null ? buildDeliveryRunLoadingSummary(resolvedMembers) : null;

    return {
        delivery_run_id: plain.delivery_run_id,
        label: plain.label,
        status: plain.status,
        scheduled_date: plain.scheduled_date ?? null,
        scheduled_date_end: plain.scheduled_date_end ?? null,
        transportation_label: plain.transportation_label ?? null,
        location_id: plain.location_id ?? null,
        notes: plain.notes ?? null,
        created_by: plain.created_by ?? null,
        updated_by: plain.updated_by ?? null,
        created_at: plain.created_at ?? null,
        updated_at: plain.updated_at ?? null,
        loading_confirmed_by: plain.loading_confirmed_by ?? null,
        loading_confirmed_at: plain.loading_confirmed_at ?? null,
        personnel,
        ...(resolvedMembers !== null ? { members: resolvedMembers, member_count: resolvedMembers.length } : {}),
        ...(memberCount !== null ? { member_count: memberCount } : {}),
        ...(summary !== null ? { summary, loading_summary: loadingSummary } : {})
    };
};

export default serializeDeliveryRun;
