import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { POS_CASHIER_ATTENDANCE_FEATURE_KEY } from '../services/posCashierAttendanceFeature.js';

const model = (models, name) => models?.[name] || dbStore.get(name);
const plain = (value) => value?.get ? value.get({ plain: true }) : value;

export const createPosCashierAttendanceConfigRepository = (models = null) => Object.freeze({
    async getSetting({ transaction, lock = false } = {}) {
        const SystemSetting = model(models, 'SystemSetting');
        return SystemSetting.findOne({
            where: { setting_key: POS_CASHIER_ATTENDANCE_FEATURE_KEY },
            transaction,
            ...(transaction && lock ? { lock: transaction.LOCK.UPDATE } : {})
        });
    },

    async ensureSetting({ transaction } = {}) {
        const SystemSetting = model(models, 'SystemSetting');
        const [setting, created] = await SystemSetting.findOrCreate({
            where: { setting_key: POS_CASHIER_ATTENDANCE_FEATURE_KEY },
            defaults: {
                setting_value: JSON.stringify({ enabled: false, location_ids: [] }),
                data_type: 'json',
                description: 'Tenant/location rollout for POS cashier attendance and breaks'
            },
            transaction
        });
        return { setting, created };
    },

    async listActiveLocations({ transaction } = {}) {
        const TenantLocation = model(models, 'TenantLocation');
        const rows = await TenantLocation.findAll({
            where: { is_active: true },
            attributes: ['location_id', 'name', 'is_active'],
            order: [['name', 'ASC'], ['location_id', 'ASC']],
            transaction
        });
        return rows.map(plain);
    },

    async listLocationsByIds({ locationIds, transaction } = {}) {
        if (!locationIds.length) return [];
        const TenantLocation = model(models, 'TenantLocation');
        const rows = await TenantLocation.findAll({
            where: { location_id: { [Op.in]: locationIds } },
            attributes: ['location_id', 'name', 'is_active'],
            transaction,
            ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
        });
        return rows.map(plain);
    },

    async findActiveWorkflowBlockers({ locationIds, transaction } = {}) {
        if (!locationIds.length) return [];
        const Shift = model(models, 'PosTerminalShift');
        const Attendance = model(models, 'EmployeeAttendanceSession');
        const Break = model(models, 'EmployeeBreakSegment');
        const Operator = model(models, 'PosTerminalOperatorSession');
        const lock = transaction ? transaction.LOCK.UPDATE : undefined;

        const [shifts, attendance, operators] = await Promise.all([
            Shift.findAll({
                where: { location_id: { [Op.in]: locationIds }, status: 'open' },
                attributes: ['pos_terminal_shift_id', 'location_id', 'terminal_id'],
                transaction,
                ...(lock ? { lock } : {})
            }),
            Attendance.findAll({
                where: { location_id: { [Op.in]: locationIds }, status: 'open' },
                attributes: ['employee_attendance_session_id', 'location_id', 'user_id'],
                transaction,
                ...(lock ? { lock } : {})
            }),
            Operator.findAll({
                where: { location_id: { [Op.in]: locationIds }, status: 'active' },
                attributes: [
                    'pos_terminal_operator_session_id',
                    'location_id',
                    'terminal_id',
                    'user_id',
                    'protected_operation_key',
                    'protected_operation_type',
                    'protected_operation_started_at'
                ],
                transaction,
                ...(lock ? { lock } : {})
            })
        ]);

        const attendanceRows = attendance.map(plain);
        const attendanceIds = attendanceRows.map((row) => row.employee_attendance_session_id);
        const breaks = attendanceIds.length
            ? await Break.findAll({
                where: {
                    employee_attendance_session_id: { [Op.in]: attendanceIds },
                    status: 'open'
                },
                attributes: ['employee_break_segment_id', 'employee_attendance_session_id'],
                transaction,
                ...(lock ? { lock } : {})
            })
            : [];
        const attendanceById = new Map(attendanceRows.map((row) => [
            Number(row.employee_attendance_session_id),
            row
        ]));

        return [
            ...shifts.map((row) => {
                const value = plain(row);
                return {
                    type: 'open_register_shift',
                    location_id: Number(value.location_id),
                    terminal_id: value.terminal_id,
                    record_id: Number(value.pos_terminal_shift_id)
                };
            }),
            ...attendanceRows.map((value) => ({
                type: 'open_attendance',
                location_id: Number(value.location_id),
                user_id: Number(value.user_id),
                record_id: Number(value.employee_attendance_session_id)
            })),
            ...breaks.map((row) => {
                const value = plain(row);
                const attendanceRow = attendanceById.get(Number(value.employee_attendance_session_id));
                return {
                    type: 'open_break',
                    location_id: Number(attendanceRow?.location_id),
                    user_id: Number(attendanceRow?.user_id),
                    record_id: Number(value.employee_break_segment_id)
                };
            }),
            ...operators.map((row) => {
                const value = plain(row);
                return {
                    type: value.protected_operation_started_at ? 'protected_operation' : 'active_operator_session',
                    location_id: Number(value.location_id),
                    terminal_id: value.terminal_id,
                    user_id: Number(value.user_id),
                    record_id: Number(value.pos_terminal_operator_session_id),
                    operation_type: value.protected_operation_type || null,
                    operation_key: value.protected_operation_key || null
                };
            })
        ];
    },

    async saveSetting({ setting, config, transaction } = {}) {
        await setting.update({
            setting_value: JSON.stringify(config),
            data_type: 'json',
            description: 'Tenant/location rollout for POS cashier attendance and breaks'
        }, { transaction });
        return setting;
    },

    async createAudit({ payload, transaction } = {}) {
        const AuditLog = model(models, 'AuditLog');
        return AuditLog.create(payload, { transaction });
    },

    async transaction(callback) {
        const SystemSetting = model(models, 'SystemSetting');
        return SystemSetting.sequelize.transaction(callback);
    }
});
