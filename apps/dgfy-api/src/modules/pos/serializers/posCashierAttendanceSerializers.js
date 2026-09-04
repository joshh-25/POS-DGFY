const toPlainObject = (value) => {
    if (value && typeof value.toJSON === 'function') return value.toJSON();
    if (value && typeof value.get === 'function') return value.get({ plain: true });
    return value || null;
};

const pick = (value, fields) => {
    const plain = toPlainObject(value);
    if (!plain) return null;
    return fields.reduce((result, field) => {
        if (Object.prototype.hasOwnProperty.call(plain, field)) result[field] = plain[field];
        return result;
    }, {});
};

export const serializeEmployeeAttendanceSession = (value) => pick(value, [
    'employee_attendance_session_id',
    'employee_id',
    'user_id',
    'location_id',
    'duty_type',
    'status',
    'started_at',
    'ended_at',
    'closed_by',
    'start_idempotency_key',
    'end_idempotency_key',
    'created_at',
    'updated_at'
]);

export const serializeEmployeeBreakSegment = (value) => pick(value, [
    'employee_break_segment_id',
    'employee_attendance_session_id',
    'status',
    'started_at',
    'ended_at',
    'ended_by',
    'start_idempotency_key',
    'end_idempotency_key',
    'created_at',
    'updated_at'
]);

export const serializePosTerminalOperatorSession = (value) => pick(value, [
    'pos_terminal_operator_session_id',
    'pos_terminal_shift_id',
    'terminal_id',
    'location_id',
    'user_id',
    'employee_attendance_session_id',
    'status',
    'started_at',
    'ended_at',
    'ended_reason',
    'authority_expires_at',
    'revoked_at',
    'revoked_reason',
    'idempotency_key',
    'protected_operation_key',
    'protected_operation_type',
    'protected_operation_started_at',
    'created_at',
    'updated_at'
]);

export const serializePosDrawerHandoffEvent = (value) => pick(value, [
    'pos_drawer_handoff_event_id',
    'pos_terminal_shift_id',
    'terminal_id',
    'location_id',
    'event_type',
    'custody_mode',
    'outgoing_operator_user_id',
    'incoming_operator_user_id',
    'expected_cash_amount',
    'counted_cash_amount',
    'variance_amount',
    'outgoing_acknowledged_by',
    'outgoing_acknowledged_at',
    'incoming_acknowledged_by',
    'incoming_acknowledged_at',
    'recorded_by',
    'event_at',
    'idempotency_key',
    'note',
    'created_at',
    'updated_at'
]);

export const serializePosTransactionOperatorAttribution = (value) => pick(value, [
    'pos_transaction_id',
    'cashier_id',
    'shift_id',
    'operator_session_id',
    'terminal_id',
    'location_id'
]);
