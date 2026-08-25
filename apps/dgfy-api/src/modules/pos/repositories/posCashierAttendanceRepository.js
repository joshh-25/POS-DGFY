import dbStore from '../../../utils/dbStore.js';
import {
    serializeEmployeeAttendanceSession,
    serializeEmployeeBreakSegment,
    serializePosDrawerHandoffEvent,
    serializePosTerminalOperatorSession,
    serializePosTransactionOperatorAttribution
} from '../serializers/posCashierAttendanceSerializers.js';

const resolveModel = (models, name) => {
    if (models && Object.prototype.hasOwnProperty.call(models, name)) return models[name];
    return dbStore.get(name);
};

const requireModel = (models, name) => {
    const model = resolveModel(models, name);
    if (!model) throw new Error(`POS cashier attendance repository requires model: ${name}`);
    return model;
};

const optionalModel = (models, name) => {
    try {
        return resolveModel(models, name) || null;
    } catch {
        return null;
    }
};

const transactionOptions = ({ transaction, lock = false } = {}) => {
    if (!transaction) return {};
    return {
        transaction,
        lock: lock ? transaction.LOCK.UPDATE : undefined
    };
};

const idempotencyWhere = ({ userId, action, key, attendanceSessionId = null } = {}) => {
    if (!key) return null;
    if (action === 'start_attendance') return { user_id: userId, start_idempotency_key: key };
    if (action === 'end_attendance') return { user_id: userId, end_idempotency_key: key };
    if (action === 'start_break') return { employee_attendance_session_id: attendanceSessionId, start_idempotency_key: key };
    if (action === 'end_break') return { employee_attendance_session_id: attendanceSessionId, end_idempotency_key: key };
    return null;
};

/**
 * Phase 157/158 persistence adapter. Lifecycle policy belongs in use cases;
 * model lookup stays lazy so tenant requests never use the landlord model.
 */
export const createPosCashierAttendanceRepository = (models = null) => Object.freeze({
    async findOpenAttendanceByUser({ userId, locationId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const where = { user_id: userId, status: 'open' };
        if (locationId != null) where.location_id = locationId;
        const row = await Model.findOne({
            where,
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializeEmployeeAttendanceSession(row);
    },

    async listEligibleOperators({ locationId, transaction } = {}) {
        const Attendance = requireModel(models, 'EmployeeAttendanceSession');
        const User = requireModel(models, 'User');
        const attendanceRows = await Attendance.findAll({
            where: { location_id: locationId, status: 'open' },
            order: [['started_at', 'ASC']],
            ...transactionOptions({ transaction })
        });
        const results = [];
        for (const attendanceRow of attendanceRows) {
            const attendance = serializeEmployeeAttendanceSession(attendanceRow);
            const user = await User.findByPk(attendance?.user_id, transactionOptions({ transaction }));
            const plain = user?.toJSON ? user.toJSON() : user;
            if (!plain || plain.is_active !== true || plain.deleted_at) continue;
            results.push({
                user_id: Number(plain.user_id),
                username: String(plain.username || '').trim() || null,
                email: String(plain.email || '').trim().toLowerCase() || null,
                role: String(plain.role || '').trim().toLowerCase() || null,
                duty_type: attendance.duty_type,
                attendance_started_at: attendance.started_at
            });
        }
        return results;
    },

    async findAttendanceById({ attendanceSessionId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const row = await Model.findByPk(attendanceSessionId, transactionOptions({ transaction, lock }));
        return serializeEmployeeAttendanceSession(row);
    },

    async findAttendanceByIdempotency({ userId, action, key, transaction, lock = false } = {}) {
        const where = idempotencyWhere({ userId, action, key });
        if (!where) return null;
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const row = await Model.findOne({
            where,
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializeEmployeeAttendanceSession(row);
    },

    async listAttendanceByUser({ userId, locationId, limit = 30, transaction } = {}) {
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const where = { user_id: userId };
        if (locationId != null) where.location_id = locationId;
        const rows = await Model.findAll({
            where,
            order: [['started_at', 'DESC'], ['employee_attendance_session_id', 'DESC']],
            limit: Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 30)),
            ...transactionOptions({ transaction })
        });
        return rows.map(serializeEmployeeAttendanceSession);
    },

    async createAttendanceSession(payload, { transaction } = {}) {
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const row = await Model.create(payload, transactionOptions({ transaction }));
        return serializeEmployeeAttendanceSession(row);
    },

    async updateAttendanceSession({ attendanceSessionId, payload, transaction } = {}) {
        const Model = requireModel(models, 'EmployeeAttendanceSession');
        const row = await Model.findByPk(attendanceSessionId, transactionOptions({ transaction, lock: true }));
        if (!row) return null;
        await row.update(payload, transactionOptions({ transaction }));
        return serializeEmployeeAttendanceSession(row);
    },

    async findOpenBreak({ attendanceSessionId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'EmployeeBreakSegment');
        const row = await Model.findOne({
            where: { employee_attendance_session_id: attendanceSessionId, status: 'open' },
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializeEmployeeBreakSegment(row);
    },

    async findBreakByIdempotency({ attendanceSessionId, action, key, transaction, lock = false } = {}) {
        const where = idempotencyWhere({ attendanceSessionId, action, key });
        if (!where) return null;
        const Model = requireModel(models, 'EmployeeBreakSegment');
        const row = await Model.findOne({
            where,
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializeEmployeeBreakSegment(row);
    },

    async createBreakSegment(payload, { transaction } = {}) {
        const Model = requireModel(models, 'EmployeeBreakSegment');
        const row = await Model.create(payload, transactionOptions({ transaction }));
        return serializeEmployeeBreakSegment(row);
    },

    async updateBreakSegment({ breakSegmentId, payload, transaction } = {}) {
        const Model = requireModel(models, 'EmployeeBreakSegment');
        const row = await Model.findByPk(breakSegmentId, transactionOptions({ transaction, lock: true }));
        if (!row) return null;
        await row.update(payload, transactionOptions({ transaction }));
        return serializeEmployeeBreakSegment(row);
    },

    async findEmployeeById({ employeeId, transaction, lock = false } = {}) {
        const Model = optionalModel(models, 'Employee');
        if (!Model) return null;
        return Model.findOne({
            where: { employee_id: employeeId, is_active: true },
            ...transactionOptions({ transaction, lock })
        });
    },

    async findEmployeeByEmail({ email, transaction, lock = false } = {}) {
        const Model = optionalModel(models, 'Employee');
        if (!Model || !email) return null;
        return Model.findOne({
            where: { email, is_active: true },
            ...transactionOptions({ transaction, lock })
        });
    },

    async findUserById({ userId, transaction, lock = false } = {}) {
        const Model = optionalModel(models, 'User');
        if (!Model) return null;
        return Model.findByPk(userId, transactionOptions({ transaction, lock }));
    },

    async createAuditLog(payload, { transaction } = {}) {
        const Model = optionalModel(models, 'AuditLog');
        if (!Model) throw new Error('AuditLog model is unavailable');
        return Model.create(payload, transactionOptions({ transaction }));
    },

    // Phase 157 dormant primitives retained below; Phase 159 owns their policy.
    async findActiveOperator({ terminalId, userId, locationId, shiftId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const where = { status: 'active' };
        if (terminalId != null) where.terminal_id = String(terminalId).trim().toUpperCase();
        if (userId != null) where.user_id = userId;
        if (locationId != null) where.location_id = locationId;
        if (shiftId != null) where.pos_terminal_shift_id = shiftId;
        const row = await Model.findOne({
            where,
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializePosTerminalOperatorSession(row);
    },

    async createOperatorSession(payload, { transaction } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        try {
            const row = await Model.create(payload, transactionOptions({ transaction }));
            return serializePosTerminalOperatorSession(row);
        } catch (error) {
            if (error?.name !== 'SequelizeUniqueConstraintError' || !payload?.idempotency_key) throw error;
            const replay = await Model.findOne({
                where: {
                    pos_terminal_shift_id: payload.pos_terminal_shift_id,
                    idempotency_key: payload.idempotency_key
                },
                ...transactionOptions({ transaction, lock: true })
            });
            if (!replay) throw error;
            return serializePosTerminalOperatorSession(replay);
        }
    },

    async findOperatorById({ operatorSessionId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const row = await Model.findByPk(operatorSessionId, transactionOptions({ transaction, lock }));
        return serializePosTerminalOperatorSession(row);
    },

    async findOperatorByAuthorityTokenHash({ authorityTokenHash, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const normalizedHash = String(authorityTokenHash || '').trim();
        if (!normalizedHash) return null;
        const row = await Model.findOne({
            where: { authority_token_hash: normalizedHash },
            ...transactionOptions({ transaction, lock })
        });
        return serializePosTerminalOperatorSession(row);
    },

    async findOperatorByIdempotency({ shiftId, key, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const normalizedKey = String(key || '').trim();
        if (!shiftId || !normalizedKey) return null;
        const row = await Model.findOne({
            where: { pos_terminal_shift_id: shiftId, idempotency_key: normalizedKey },
            order: [['started_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return serializePosTerminalOperatorSession(row);
    },

    async updateOperatorSession({ operatorSessionId, payload, transaction } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const row = await Model.findByPk(operatorSessionId, transactionOptions({ transaction, lock: true }));
        if (!row) return null;
        await row.update(payload, transactionOptions({ transaction }));
        return serializePosTerminalOperatorSession(row);
    },

    async releaseOperatorMutation({ operatorSessionId, operationKey, transaction } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const normalizedKey = String(operationKey || '').trim();
        if (!operatorSessionId || !normalizedKey) return false;
        const [count] = await Model.update({
            protected_operation_key: null,
            protected_operation_type: null,
            protected_operation_started_at: null
        }, {
            where: {
                pos_terminal_operator_session_id: operatorSessionId,
                protected_operation_key: normalizedKey
            },
            ...transactionOptions({ transaction })
        });
        return count > 0;
    },

    async findOpenTerminalShift({ terminalId, shiftId, locationId, transaction, lock = false } = {}) {
        const Model = requireModel(models, 'PosTerminalShift');
        const where = { status: 'open' };
        if (shiftId != null) where.pos_terminal_shift_id = shiftId;
        if (terminalId != null) where.terminal_id = String(terminalId).trim().toUpperCase();
        if (locationId != null) where.location_id = locationId;
        const row = await Model.findOne({
            where,
            order: [['opened_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return row?.toJSON ? row.toJSON() : row || null;
    },

    async findInFlightPaymentSession({ shiftId, transaction, lock = false } = {}) {
        const Model = optionalModel(models, 'PosPaymentSession');
        if (!Model || !shiftId) return null;
        const row = await Model.findOne({
            where: {
                shift_id: shiftId,
                status: ['open', 'partially_paid', 'ready_to_complete']
            },
            order: [['created_at', 'DESC']],
            ...transactionOptions({ transaction, lock })
        });
        return row?.toJSON ? row.toJSON() : row || null;
    },

    async findUserLocationGrant({ userId, locationId, transaction, lock = false } = {}) {
        const Model = optionalModel(models, 'UserLocationGrant');
        if (!Model || !userId || !locationId) return null;
        return Model.findOne({
            where: { user_id: userId, location_id: locationId },
            ...transactionOptions({ transaction, lock })
        });
    },

    async updateUserPinState({ userId, payload, transaction } = {}) {
        const Model = requireModel(models, 'User');
        const row = await Model.findByPk(userId, transactionOptions({ transaction, lock: true }));
        if (!row) return null;
        await row.update(payload, transactionOptions({ transaction }));
        return row;
    },

    async getExpectedCashForShift({ shift, transaction } = {}) {
        const Event = optionalModel(models, 'PosCashDrawerEvent');
        const Transaction = optionalModel(models, 'PosTransaction');
        const shiftId = Number(shift?.pos_terminal_shift_id);
        if (!shiftId) return 0;
        const options = transactionOptions({ transaction });
        const events = Event ? await Event.findAll({ where: { pos_terminal_shift_id: shiftId }, ...options }) : [];
        const transactions = Transaction
            ? await Transaction.findAll({ where: { shift_id: shiftId }, attributes: ['payment_type', 'total_amount', 'payment_breakdown'], ...options })
            : [];
        const cashSales = transactions.reduce((total, row) => {
            let breakdown = row?.payment_breakdown;
            if (typeof breakdown === 'string') {
                try { breakdown = JSON.parse(breakdown); } catch { breakdown = null; }
            }
            if (Array.isArray(breakdown) && breakdown.length > 0) {
                return total + breakdown.reduce((sum, entry) => (
                    String(entry?.payment_type || entry?.method || '').toLowerCase() === 'cash'
                        ? sum + Number(entry?.amount || 0)
                        : sum
                ), 0);
            }
            return String(row?.payment_type || '').toLowerCase() === 'cash'
                ? total + Number(row?.total_amount || 0)
                : total;
        }, 0);
        const eventTotal = events.reduce((total, row) => {
            const amount = Number(row?.amount || 0);
            return total + (['cash_in', 'opening_adjustment'].includes(row?.event_type)
                ? amount
                : ['cash_out', 'closing_adjustment'].includes(row?.event_type) ? -amount : 0);
        }, 0);
        return Number((Number(shift?.opening_float_amount || 0) + eventTotal + cashSales).toFixed(4));
    },

    async revokeOperatorSessionsForUser({ userId, reason, transaction, at = new Date() } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const [count] = await Model.update(
            {
                status: 'ended',
                ended_at: at,
                ended_reason: reason,
                revoked_at: at,
                revoked_reason: reason,
                authority_token_hash: null,
                protected_operation_key: null,
                protected_operation_type: null,
                protected_operation_started_at: null
            },
            { where: { user_id: userId, status: 'active' }, ...transactionOptions({ transaction }) }
        );
        return count;
    },

    async revokeOperatorSessionsForTerminal({ terminalId, reason, transaction, at = new Date() } = {}) {
        const Model = requireModel(models, 'PosTerminalOperatorSession');
        const [count] = await Model.update(
            {
                status: 'ended',
                ended_at: at,
                ended_reason: reason,
                revoked_at: at,
                revoked_reason: reason,
                authority_token_hash: null,
                protected_operation_key: null,
                protected_operation_type: null,
                protected_operation_started_at: null
            },
            { where: { terminal_id: String(terminalId || '').trim().toUpperCase(), status: 'active' }, ...transactionOptions({ transaction }) }
        );
        return count;
    },

    async createDrawerHandoffEvent(payload, { transaction } = {}) {
        const Model = requireModel(models, 'PosDrawerHandoffEvent');
        const options = transactionOptions({ transaction });
        const row = payload.idempotency_key == null
            ? await Model.create(payload, options)
            : (await Model.findOrCreate({
                where: {
                    pos_terminal_shift_id: payload.pos_terminal_shift_id,
                    idempotency_key: payload.idempotency_key
                },
                defaults: payload,
                ...options
            }))[0];
        return serializePosDrawerHandoffEvent(row);
    },

    async attachOperatorSessionToTransaction({ transactionId, operatorSessionId, transaction } = {}) {
        const Model = requireModel(models, 'PosTransaction');
        const [updatedCount] = await Model.update(
            { operator_session_id: operatorSessionId },
            {
                where: {
                    pos_transaction_id: transactionId,
                    operator_session_id: null
                },
                ...transactionOptions({ transaction })
            }
        );
        if (updatedCount === 0) return null;
        const row = await Model.findByPk(transactionId, transactionOptions({ transaction }));
        return serializePosTransactionOperatorAttribution(row);
    }
});
