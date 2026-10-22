import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { businessAdminShiftActivityRepository } from './businessAdminShiftActivityRepository.js';
import { buildFinanciallyRecognizedSalesWhere } from '../../shared/utils/financialRecognition.js';
import {
    buildExpectedPosCashAmount,
    getPosCashPaymentAmountFromTransaction
} from '../../pos/domain/posCashReconciliation.js';

const OVERDUE_SHIFT_MS = 12 * 60 * 60 * 1000;

const toPlain = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);
const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const shiftIncludes = () => {
    const User = dbStore.get('User');
    const TenantLocation = dbStore.get('TenantLocation');
    return [
        { model: User, as: 'cashier', attributes: ['user_id', 'username'], required: false },
        { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }
    ];
};

const buildWhere = ({ allowedLocationIds = null, filters = {} } = {}) => {
    const where = {};
    if (Array.isArray(allowedLocationIds)) where.location_id = { [Op.in]: allowedLocationIds };
    if (filters.branchId) where.location_id = filters.branchId;
    if (filters.terminalId) where.terminal_id = filters.terminalId;
    if (filters.status) where.status = filters.status;
    if (filters.startAt || filters.endAt) where.opened_at = { [Op.between]: [filters.startAt, filters.endAt] };
    if (filters.search) {
        const term = `%${filters.search}%`;
        where[Op.and] = [
            ...(where[Op.and] || []),
            {
                [Op.or]: [
                    { terminal_id: { [Op.like]: term } },
                    { '$cashier.username$': { [Op.like]: term } },
                    { '$location.name$': { [Op.like]: term } }
                ]
            }
        ];
    }
    return where;
};

const normalizeShifts = async (rows) => {
    const PosCashDrawerEvent = dbStore.get('PosCashDrawerEvent');
    const PosTransaction = dbStore.get('PosTransaction');
    const shifts = rows.map(toPlain);
    const shiftIds = shifts.map((shift) => Number(shift.pos_terminal_shift_id)).filter(Number.isInteger);
    const activityByShift = await businessAdminShiftActivityRepository.getByShiftIds(shiftIds);

    const cashEvents = PosCashDrawerEvent && shiftIds.length > 0
        ? await PosCashDrawerEvent.findAll({
            where: { pos_terminal_shift_id: { [Op.in]: shiftIds } },
            attributes: ['pos_cash_drawer_event_id', 'pos_terminal_shift_id', 'event_type', 'amount', 'reason', 'recorded_by', 'created_at'],
            order: [['created_at', 'ASC'], ['pos_cash_drawer_event_id', 'ASC']],
            raw: true
        })
        : [];
    const recognizedSales = PosTransaction && shiftIds.length > 0
        ? await PosTransaction.findAll({
            where: buildFinanciallyRecognizedSalesWhere({
                shift_id: { [Op.in]: shiftIds }
            }),
            attributes: ['shift_id', 'payment_type', 'total_amount', 'payment_breakdown'],
            raw: true
        })
        : [];
    const cashEventsByShift = new Map(shiftIds.map((shiftId) => [shiftId, []]));
    const cashSalesByShift = new Map(shiftIds.map((shiftId) => [shiftId, 0]));
    cashEvents.forEach((event) => {
        const shiftEvents = cashEventsByShift.get(Number(event.pos_terminal_shift_id));
        if (!shiftEvents) return;
        shiftEvents.push({
            event_id: event.pos_cash_drawer_event_id,
            event_type: event.event_type,
            amount: toNumber(event.amount),
            reason: event.reason || null,
            recorded_by: event.recorded_by || null,
            created_at: event.created_at || null
        });
    });
    recognizedSales.forEach((sale) => {
        const shiftId = Number(sale.shift_id);
        if (!cashSalesByShift.has(shiftId)) return;
        cashSalesByShift.set(
            shiftId,
            round4(cashSalesByShift.get(shiftId) + getPosCashPaymentAmountFromTransaction(sale))
        );
    });

    return shifts.map((shift) => {
        const activity = activityByShift.get(Number(shift.pos_terminal_shift_id)) || {};
        const shiftId = Number(shift.pos_terminal_shift_id);
        const drawerEvents = cashEventsByShift.get(shiftId) || [];
        const cashSalesAmount = cashSalesByShift.get(shiftId) || 0;
        const cashInAmount = drawerEvents
            .filter((event) => ['cash_in', 'opening_adjustment'].includes(event.event_type))
            .reduce((total, event) => total + event.amount, 0);
        const cashOutAmount = drawerEvents
            .filter((event) => ['cash_out', 'closing_adjustment'].includes(event.event_type))
            .reduce((total, event) => total + event.amount, 0);
        const openedAt = shift.opened_at ? new Date(shift.opened_at) : null;
        const closedAt = shift.closed_at ? new Date(shift.closed_at) : null;
        const durationEnd = closedAt || new Date();
        const shiftDurationMinutes = openedAt && !Number.isNaN(openedAt.getTime())
            ? Math.max(0, Math.floor((durationEnd.getTime() - openedAt.getTime()) / 60000))
            : null;
        return {
            shift_id: shift.pos_terminal_shift_id,
            terminal_id: shift.terminal_id,
            branch_id: shift.location_id || shift.location?.location_id || null,
            branch_name: shift.location?.name || null,
            cashier_name: shift.cashier?.username || 'Cashier',
            status: shift.status,
            opened_at: shift.opened_at,
            closed_at: shift.closed_at || null,
            opening_cash_amount: toNumber(shift.opening_float_amount),
            cash_sales_amount: cashSalesAmount,
            cash_in_amount: cashInAmount,
            cash_out_amount: cashOutAmount,
            cash_drawer_event_count: drawerEvents.length,
            cash_drawer_events: drawerEvents,
            expected_cash_amount: buildExpectedPosCashAmount({
                openingFloatAmount: shift.opening_float_amount,
                cashSalesAmount,
                cashEvents: drawerEvents
            }),
            closing_cash_amount: shift.closing_cash_amount == null ? null : toNumber(shift.closing_cash_amount),
            cash_variance_amount: shift.cash_variance_amount == null ? null : toNumber(shift.cash_variance_amount),
            closing_note: shift.closing_note || null,
            shift_duration_minutes: shiftDurationMinutes,
            orders_processed: activity.orders_processed || 0,
            refunds_amount: activity.refunds_amount || 0,
            discounts_amount: activity.discounts_amount || 0,
            void_count: activity.void_count || 0,
            close_method: shift.close_method || 'normal',
            force_close_reason: shift.force_close_reason || null,
            force_close_requested_by: null,
            force_close_approved_by: null
        };
    });
};

export const businessAdminShiftHistoryRepository = {
    async listShifts({ allowedLocationIds = null, filters = {} } = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const where = buildWhere({ allowedLocationIds, filters });
        const { rows, count } = await PosTerminalShift.findAndCountAll({
            where,
            include: shiftIncludes(),
            distinct: true,
            order: [['opened_at', 'DESC'], ['pos_terminal_shift_id', 'DESC']],
            limit: filters.limit,
            offset: (filters.page - 1) * filters.limit
        });
        return {
            shifts: await normalizeShifts(rows),
            pagination: {
                page: filters.page,
                limit: filters.limit,
                total: count,
                total_pages: Math.ceil(count / filters.limit)
            }
        };
    },

    async getSummary({ allowedLocationIds = null, filters = {} } = {}) {
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const baseWhere = buildWhere({ allowedLocationIds, filters: { ...filters, search: '' } });
        const overdueWhere = {
            [Op.and]: [
                baseWhere,
                { status: 'open', opened_at: { [Op.lte]: new Date(Date.now() - OVERDUE_SHIFT_MS) } }
            ]
        };
        const [total, closed, open, overdue, forceCloseRequests] = await Promise.all([
            PosTerminalShift.count({ where: baseWhere }),
            PosTerminalShift.count({ where: { ...baseWhere, status: 'closed' } }),
            PosTerminalShift.count({ where: { ...baseWhere, status: 'open' } }),
            PosTerminalShift.count({ where: overdueWhere }),
            // Generic force-close approval is not a field on the canonical POS
            // shift model.  Do not issue a query against a non-existent column;
            // the command remains owned by POS until an approved contract lands.
            Promise.resolve(0)
        ]);
        return { total_shifts: total, closed_shifts: closed, open_shifts: open, overdue_shifts: overdue, force_close_requests: forceCloseRequests };
    }
};
