// Phase 225 (#1273/#1081): response shape for a delivery run + its personnel roster + member jobs.

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

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
            fulfillment_status: order.fulfillment_status ?? null
        }
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
        ...(memberCount !== null ? { member_count: memberCount } : {})
    };
};

export default serializeDeliveryRun;
