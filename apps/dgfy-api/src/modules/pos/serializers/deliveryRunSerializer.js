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

    return {
        delivery_run_id: plain.delivery_run_id,
        label: plain.label,
        status: plain.status,
        scheduled_date: plain.scheduled_date ?? null,
        scheduled_date_end: plain.scheduled_date_end ?? null,
        location_id: plain.location_id ?? null,
        notes: plain.notes ?? null,
        created_by: plain.created_by ?? null,
        updated_by: plain.updated_by ?? null,
        created_at: plain.created_at ?? null,
        updated_at: plain.updated_at ?? null,
        personnel,
        ...(resolvedMembers !== null ? { members: resolvedMembers, member_count: resolvedMembers.length } : {}),
        ...(memberCount !== null ? { member_count: memberCount } : {}),
        ...(summary !== null ? { summary } : {})
    };
};

export default serializeDeliveryRun;
