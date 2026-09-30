import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildStockHealthWhere, STOCK_HEALTH_STATUS } from '../../inventory/services/inventoryHealthService.js';
import { buildStockBearingItemWhere } from '../../shared/utils/stockBearingPolicy.js';
import { businessAdminFinancialReportRepository } from './businessAdminFinancialReportRepository.js';
import { businessAdminShiftActivityRepository } from './businessAdminShiftActivityRepository.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const OVERDUE_SHIFT_MS = 12 * 60 * 60 * 1000;
const TERMINAL_HEARTBEAT_ONLINE_MS = 2 * 60 * 1000;
const MANILA_UTC_OFFSET = '+08:00';

const auditDateBoundary = (dateValue, endOfDay = false) => new Date(
    `${dateValue}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}${MANILA_UTC_OFFSET}`
);

const parseJsonLoosely = (value) => {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const parseTerminalRegistry = (setting) => {
    const raw = setting?.data_type === 'json'
        ? parseJsonLoosely(setting?.setting_value)
        : setting?.setting_value;
    const parsed = parseJsonLoosely(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    return parsed
        .map((entry) => {
            const terminalId = String(entry?.terminal_id || '').trim().toUpperCase();
            if (!terminalId || seen.has(terminalId)) return null;
            seen.add(terminalId);
            return {
                terminal_id: terminalId,
                label: String(entry?.label || terminalId).trim(),
                location_id: Number.parseInt(entry?.location_id, 10) || null,
                is_active: entry?.is_active !== false,
                is_default: entry?.is_default === true
            };
        })
        .filter(Boolean);
};

const isMissingTerminalHeartbeatSchemaError = (error) => {
    const code = error?.original?.code || error?.parent?.code || error?.code;
    const message = String(error?.original?.sqlMessage || error?.parent?.sqlMessage || error?.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('pos_terminal_heartbeats');
};

export const buildScopedLocationWhere = ({ branchId = null, allowedLocationIds = null } = {}) => {
    if (branchId) {
        if (Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(branchId)) {
            return { [Op.in]: [] };
        }
        return branchId;
    }
    if (Array.isArray(allowedLocationIds)) return { [Op.in]: allowedLocationIds };
    return undefined;
};

const buildLocationWhere = ({ branchId = null, allowedLocationIds = null, includeInactive = false } = {}) => {
    const where = {};
    if (!includeInactive) where.is_active = true;
    const locationIdWhere = buildScopedLocationWhere({ branchId, allowedLocationIds });
    if (locationIdWhere !== undefined) where.location_id = locationIdWhere;
    return where;
};

const buildTransactionWhere = ({ startAt, endAt, branchId = null, registerId = '', allowedLocationIds = null } = {}) => {
    const where = {
        status: 'completed',
        created_at: {
            [Op.between]: [startAt, endAt]
        }
    };
    const locationIdWhere = buildScopedLocationWhere({ branchId, allowedLocationIds });
    if (locationIdWhere !== undefined) where.location_id = locationIdWhere;
    if (registerId) where.terminal_id = registerId;
    return where;
};

const buildBranchMap = (locations = []) => new Map(
    locations.map((location) => [
        Number(location.location_id),
        {
            branch_id: Number(location.location_id),
            name: location.name || `Branch ${location.location_id}`,
            sales: 0,
            transaction_count: 0,
            active_cashiers: 0,
            active_registers: 0
        }
    ])
);

export const businessAdminOverviewRepository = {
    async listActiveLocations({ branchId = null, allowedLocationIds = null } = {}) {
        const TenantLocation = dbStore.get('TenantLocation');
        const rows = await TenantLocation.findAll({
            where: buildLocationWhere({ branchId, allowedLocationIds }),
            attributes: ['location_id', 'name'],
            order: [['name', 'ASC'], ['location_id', 'ASC']],
            raw: true
        });
        return rows.map(toPlain);
    },

    async listApprovalRequests({ status = '', limit = 100 } = {}) {
        const BusinessAdminApprovalRequest = dbStore.get('BusinessAdminApprovalRequest');
        const User = dbStore.get('User');
        if (!BusinessAdminApprovalRequest) return [];
        const where = {};
        if (status) where.status = status;
        const rows = await BusinessAdminApprovalRequest.findAll({
            where,
            include: [
                { model: User, as: 'requestedByUser', attributes: ['user_id', 'username', 'email'], required: false },
                { model: User, as: 'approvedByUser', attributes: ['user_id', 'username', 'email'], required: false },
                { model: User, as: 'rejectedByUser', attributes: ['user_id', 'username', 'email'], required: false }
            ],
            order: [['created_at', 'DESC'], ['business_admin_approval_request_id', 'DESC']],
            limit: Math.min(Math.max(Number(limit) || 100, 1), 200)
        });
        return rows.map(toPlain).map((row) => ({
            approval_request_id: row.business_admin_approval_request_id,
            action_type: row.action_type,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            payload: row.payload || {},
            status: row.status,
            reason: row.reason,
            requested_at: row.created_at,
            requested_by_user_id: row.requested_by,
            requested_by: row.requestedByUser?.username || row.requestedByUser?.email || 'Unknown',
            approved_at: row.approved_at || null,
            approved_by: row.approvedByUser?.username || row.approvedByUser?.email || null,
            rejected_at: row.rejected_at || null,
            rejected_by: row.rejectedByUser?.username || row.rejectedByUser?.email || null,
            executed_at: row.executed_at || null,
            expires_at: row.expires_at || null,
            branch_id: row.payload?.location_id || null,
            terminal_id: row.payload?.terminal_id || null,
            related_transaction_id: row.payload?.transaction_id || null,
            before_value: row.payload?.cash_snapshot?.expected_cash_amount ?? null,
            requested_value: row.payload?.amount ?? row.payload?.closing_cash_amount ?? null,
            approval_note: row.approval_note || null
        }));
    },

    async listAuditLogs({ limit = 100 } = {}) {
        const result = await this.listAuditLogPage({ limit, page: 1 });
        return result.logs;
    },

    async listAuditLogPage({ limit = 100, page = 1, entityType = '', action = '', dateFrom = '', dateTo = '' } = {}) {
        const AuditLog = dbStore.get('AuditLog');
        const User = dbStore.get('User');
        if (!AuditLog) return { logs: [], pagination: { page: 1, limit: 1, total: 0, total_pages: 0 } };
        const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
        const boundedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
        const where = {};
        if (entityType) where.entity_type = entityType;
        if (action) where.action = action;
        if (dateFrom || dateTo) where.timestamp = {
            ...(dateFrom ? { [Op.gte]: auditDateBoundary(dateFrom) } : {}),
            ...(dateTo ? { [Op.lte]: auditDateBoundary(dateTo, true) } : {})
        };
        const { rows, count } = await AuditLog.findAndCountAll({
            where,
            include: [{ model: User, as: 'user', attributes: ['user_id', 'username', 'email'], required: false }],
            order: [['timestamp', 'DESC'], ['log_id', 'DESC']],
            limit: boundedLimit,
            offset: (boundedPage - 1) * boundedLimit
        });
        const redact = (value, key = '') => {
            const sensitive = /(?:password|pin|token|secret|credential|authorization|cvv|card_number)/i.test(key);
            if (sensitive) return '[REDACTED]';
            if (Array.isArray(value)) return value.map((entry) => redact(entry));
            if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
            return value;
        };
        const logs = rows.map(toPlain).map((row) => ({
            audit_log_id: row.log_id,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            action: row.action,
            changes: redact(row.changes || null),
            timestamp: row.timestamp,
            actor_name: row.user?.username || row.user?.email || 'System',
            effective_role: row.effective_role || null,
            request_id: row.request_id || null,
            outcome: row.outcome || 'success',
            location_id: row.location_id || null,
            terminal_id: row.terminal_id || null,
            reason: redact(row.reason || null, 'reason')
        }));
        return { logs, pagination: { page: boundedPage, limit: boundedLimit, total: count, total_pages: Math.ceil(count / boundedLimit) } };
    },
    async listUserLocationGrantIds(userId) {
        const UserLocationGrant = dbStore.get('UserLocationGrant');
        if (!UserLocationGrant || !userId) return [];
        const rows = await UserLocationGrant.findAll({
            where: { user_id: userId },
            attributes: ['location_id'],
            raw: true
        });
        return rows
            .map((row) => Number.parseInt(row.location_id, 10))
            .filter((locationId) => Number.isInteger(locationId) && locationId > 0);
    },

    async getOverview({
        tenant = null,
        dateFrom,
        dateTo,
        startAt,
        endAt,
        branchId = null,
        registerId = '',
        allowedLocationIds = null
    } = {}) {
        const store = dbStore.getStore?.() || {};
        const TenantLocation = dbStore.get('TenantLocation');
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTerminalShift = dbStore.get('PosTerminalShift');
        const Item = dbStore.get('Item');
        const BusinessAdminApprovalRequest = dbStore.get('BusinessAdminApprovalRequest');
        const User = dbStore.get('User');
        const SystemSetting = dbStore.get('SystemSetting');
        // Heartbeat telemetry is optional in the current tenant schema. The
        // dashboard must remain usable when that optional table/model is not
        // installed yet.
        let PosTerminalHeartbeat = null;
        try {
            PosTerminalHeartbeat = dbStore.get('PosTerminalHeartbeat');
        } catch (error) {
            if (!String(error?.message || '').includes('PosTerminalHeartbeat')) throw error;
        }
        const sequelize = store.sequelize || dbStore.get('sequelize');

        const locations = (await TenantLocation.findAll({
            where: buildLocationWhere({ branchId, allowedLocationIds }),
            order: [
                ['is_primary_storefront', 'DESC'],
                ['name', 'ASC'],
                ['location_id', 'ASC']
            ],
            raw: true
        })).map(toPlain);

        const allowedLocationSet = new Set(locations.map((location) => Number(location.location_id)));
        const registrySetting = SystemSetting
            ? await SystemSetting.findOne({
                where: { setting_key: 'pos_terminal_registry' },
                attributes: ['setting_value', 'data_type'],
                raw: true
            })
            : null;
        const registry = parseTerminalRegistry(registrySetting)
            .filter((terminal) => {
                if (branchId && terminal.location_id !== branchId) return false;
                if (allowedLocationSet.size > 0 && terminal.location_id && !allowedLocationSet.has(terminal.location_id)) return false;
                if (registerId && terminal.terminal_id !== registerId) return false;
                return true;
            });

        // Heartbeats are operational telemetry. A missing deployment migration must
        // not prevent owners from viewing existing financial and shift data.
        let terminalHeartbeats = [];
        if (PosTerminalHeartbeat && registry.length > 0) {
            try {
                terminalHeartbeats = await PosTerminalHeartbeat.findAll({
                    where: { terminal_id: { [Op.in]: registry.map((terminal) => terminal.terminal_id) } },
                    attributes: [
                        'terminal_id',
                        'location_id',
                        'reported_by',
                        'application_version',
                        'sync_state',
                        'offline_queue_count',
                        'printer_status',
                        'printer_name',
                        'last_activity_at'
                    ],
                    raw: true
                });
            } catch (error) {
                if (!isMissingTerminalHeartbeatSchemaError(error)) throw error;
            }
        }
        const heartbeatByTerminal = new Map(terminalHeartbeats.map((heartbeat) => [
            String(heartbeat.terminal_id || '').trim().toUpperCase(),
            heartbeat
        ]));

        const transactionWhere = buildTransactionWhere({
            startAt,
            endAt,
            branchId,
            registerId,
            allowedLocationIds: Array.isArray(allowedLocationIds) ? allowedLocationIds : null
        });
        const orderHistoryWhere = {
            created_at: { [Op.between]: [startAt, endAt] },
            status: { [Op.in]: ['completed', 'voided'] }
        };
        const locationIdWhere = buildScopedLocationWhere({ branchId, allowedLocationIds });
        if (locationIdWhere !== undefined) orderHistoryWhere.location_id = locationIdWhere;
        if (registerId) orderHistoryWhere.terminal_id = registerId;

        const [summaryRow] = await PosTransaction.findAll({
            where: transactionWhere,
            attributes: [
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'total_sales']
            ],
            raw: true
        });

        const closedShiftWhere = {
            status: 'closed',
            closed_at: { [Op.between]: [startAt, endAt] }
        };
        if (locationIdWhere !== undefined) closedShiftWhere.location_id = locationIdWhere;
        if (registerId) closedShiftWhere.terminal_id = registerId;

        const tenantWideMetrics = !Array.isArray(allowedLocationIds);
        const [salesTrendReport, paymentSummaryRows, recentTransactions, closedShiftSummaryRows, lowStockCount, pendingApprovals] = await Promise.all([
            businessAdminFinancialReportRepository.getDataset({
                reportKey: 'sales_trend',
                dateFrom,
                dateTo,
                branchId,
                registerId,
                allowedLocationIds: Array.isArray(allowedLocationIds) ? allowedLocationIds : null,
                page: 1,
                limit: 5000,
                sortBy: 'period',
                sortDirection: 'asc'
            }),
            PosTransaction.findAll({
                where: transactionWhere,
                attributes: [
                    'payment_type',
                    'payment_status',
                    [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'amount']
                ],
                group: ['payment_type', 'payment_status'],
                raw: true
            }),
            PosTransaction.findAll({
                where: orderHistoryWhere,
                attributes: [
                    'pos_transaction_id',
                    'invoice_number',
                    'status',
                    'location_id',
                    'order_source',
                    'order_method',
                    'fulfillment_status',
                    'payment_type',
                    'payment_status',
                    'payment_session_reference',
                    'total_amount',
                    'created_at'
                ],
                include: [
                    { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false },
                    { model: User, as: 'cashier', attributes: ['user_id', 'username'], required: false }
                ],
                order: [['created_at', 'DESC']],
                limit: 10
            }),
            PosTerminalShift.findAll({
                where: closedShiftWhere,
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('pos_terminal_shift_id')), 'closed_shift_count'],
                    [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('cash_variance_amount')), 0), 'cash_difference_amount']
                ],
                raw: true
            }),
            tenantWideMetrics && Item?.count
                ? Item.count({
                    where: buildStockBearingItemWhere({
                        status: 'active',
                        [Op.and]: [buildStockHealthWhere({
                            status: STOCK_HEALTH_STATUS.LOW_STOCK,
                            sequelize
                        })]
                    })
                })
                : Promise.resolve(null),
            tenantWideMetrics && BusinessAdminApprovalRequest?.count
                ? BusinessAdminApprovalRequest.count({ where: { status: 'pending' } })
                : Promise.resolve(null)
        ]);
        const closedShiftSummary = closedShiftSummaryRows[0] || {};
        const salesTrendRows = Array.isArray(salesTrendReport?.rows) ? salesTrendReport.rows : [];

        const branchSalesRows = await PosTransaction.findAll({
            where: transactionWhere,
            attributes: [
                'location_id',
                [sequelize.fn('COUNT', sequelize.col('pos_transaction_id')), 'transaction_count'],
                [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0), 'sales']
            ],
            group: ['location_id'],
            raw: true
        });

        const openShiftWhere = { status: 'open' };
        if (locationIdWhere !== undefined) openShiftWhere.location_id = locationIdWhere;
        if (registerId) openShiftWhere.terminal_id = registerId;

        const openShifts = (await PosTerminalShift.findAll({
            where: openShiftWhere,
            include: [
                { model: User, as: 'cashier', attributes: ['user_id', 'username', 'email'], required: false },
                { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false }
            ],
            order: [['opened_at', 'DESC']]
        })).map(toPlain);

        const recentShiftWhere = {};
        if (locationIdWhere !== undefined) recentShiftWhere.location_id = locationIdWhere;
        if (registerId) recentShiftWhere.terminal_id = registerId;
        const recentShifts = (await PosTerminalShift.findAll({
            where: recentShiftWhere,
            include: [
                { model: User, as: 'cashier', attributes: ['user_id', 'username'], required: false },
                { model: TenantLocation, as: 'location', attributes: ['location_id', 'name'], required: false },
                // Current POS shifts expose immutable close/reconciliation
                // fields but do not have generic Business Admin approval
                // associations. Keep the read model null-safe until a
                // canonical force-close approval contract exists.
            ],
            order: [['opened_at', 'DESC']],
            limit: 25
        })).map(toPlain);

        // The dashboard reads reconciliation data from the immutable POS records;
        // it never recalculates or writes a shift balance.
        const recentShiftIds = recentShifts
            .map((shift) => Number(shift.pos_terminal_shift_id))
            .filter((shiftId) => Number.isInteger(shiftId) && shiftId > 0);
        const shiftActivity = await businessAdminShiftActivityRepository.getByShiftIds(recentShiftIds);

        const branchesById = buildBranchMap(locations);
        branchSalesRows.forEach((row) => {
            const locationId = Number(row.location_id);
            const branch = branchesById.get(locationId);
            if (!branch) return;
            branch.sales = toNumber(row.sales);
            branch.transaction_count = toNumber(row.transaction_count);
        });

        const openShiftByTerminal = new Map();
        const activeCashierIds = new Set();
        openShifts.forEach((shift) => {
            const locationId = Number(shift.location_id);
            const branch = branchesById.get(locationId);
            if (branch && shift.cashier_id) {
                branch.active_cashiers += 1;
            }
            if (shift.cashier_id) activeCashierIds.add(Number(shift.cashier_id));
            const terminalKey = String(shift.terminal_id || '').trim().toUpperCase();
            if (terminalKey && !openShiftByTerminal.has(terminalKey)) {
                openShiftByTerminal.set(terminalKey, shift);
            }
        });

        const registers = registry.map((terminal) => {
            const shift = openShiftByTerminal.get(terminal.terminal_id) || null;
            const branch = branchesById.get(Number(terminal.location_id));
            const heartbeat = heartbeatByTerminal.get(terminal.terminal_id) || null;
            const lastActivity = heartbeat?.last_activity_at ? new Date(heartbeat.last_activity_at) : null;
            const recentlyReported = lastActivity && !Number.isNaN(lastActivity.getTime())
                && Date.now() - lastActivity.getTime() <= TERMINAL_HEARTBEAT_ONLINE_MS;
            const terminalStatus = !heartbeat
                ? 'not_reported'
                : (recentlyReported && heartbeat.sync_state !== 'offline' ? 'online' : 'offline');
            if (terminal.is_active && branch) branch.active_registers += 1;
            return {
                terminal_id: terminal.terminal_id,
                label: terminal.label || terminal.terminal_id,
                branch_id: terminal.location_id,
                branch_name: branch?.name || null,
                is_active: terminal.is_active,
                is_default: terminal.is_default,
                has_open_shift: Boolean(shift),
                open_shift_id: shift?.pos_terminal_shift_id || null,
                current_cashier: shift?.cashier?.username || shift?.cashier?.email || null,
                terminal_status: terminalStatus,
                last_activity_at: heartbeat?.last_activity_at || null,
                application_version: heartbeat?.application_version || null,
                sync_state: heartbeat?.sync_state || 'unknown',
                offline_queue_count: heartbeat ? toNumber(heartbeat.offline_queue_count) : null,
                printer_status: heartbeat?.printer_status || 'unknown',
                printer_name: heartbeat?.printer_name || null
            };
        });

        const cashiers = openShifts.map((shift) => ({
            user_id: shift.cashier_id,
            name: shift.cashier?.username || 'Cashier',
            email: shift.cashier?.email || null,
            branch_id: shift.location_id || null,
            branch_name: shift.location?.name || branchesById.get(Number(shift.location_id))?.name || null,
            terminal_id: shift.terminal_id || null,
            is_active_now: true,
            open_shift_id: shift.pos_terminal_shift_id
        }));

        const overdueBoundary = new Date(Date.now() - OVERDUE_SHIFT_MS);
        const overdueShifts = openShifts
            .filter((shift) => shift.opened_at && new Date(shift.opened_at) <= overdueBoundary)
            .map((shift) => ({
                shift_id: shift.pos_terminal_shift_id,
                terminal_id: shift.terminal_id,
                opened_at: shift.opened_at,
                branch_id: shift.location_id || null,
                branch_name: shift.location?.name || branchesById.get(Number(shift.location_id))?.name || null,
                cashier_name: shift.cashier?.username || 'Cashier',
                age_minutes: Math.floor((Date.now() - new Date(shift.opened_at).getTime()) / 60000)
            }));

        const normalizedRecentTransactions = recentTransactions.map((transaction) => ({
            transaction_id: transaction.pos_transaction_id,
            invoice_number: transaction.invoice_number,
            transaction_status: transaction.status,
            order_source: transaction.order_source,
            order_method: transaction.order_method,
            fulfillment_status: transaction.fulfillment_status,
            payment_type: transaction.payment_type,
            payment_status: transaction.payment_status,
            provider_refund_eligible: transaction.payment_type !== 'cash' && Boolean(transaction.payment_session_reference),
            total_amount: toNumber(transaction.total_amount),
            created_at: transaction.created_at,
            branch_id: transaction.location_id || transaction.location?.location_id || null,
            branch_name: transaction.location?.name || null,
            cashier_name: transaction.cashier?.username || null
        }));
        const normalizedRecentShifts = recentShifts.map((shift) => {
            const activity = shiftActivity.get(Number(shift.pos_terminal_shift_id)) || {
                orders_processed: 0,
                discounts_amount: 0,
                void_count: 0,
                refunds_amount: 0
            };
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
            expected_cash_amount: toNumber(shift.expected_cash_amount),
            closing_cash_amount: shift.closing_cash_amount == null ? null : toNumber(shift.closing_cash_amount),
            cash_variance_amount: shift.cash_variance_amount == null ? null : toNumber(shift.cash_variance_amount),
            closing_note: shift.closing_note || null,
            shift_duration_minutes: shiftDurationMinutes,
            orders_processed: activity.orders_processed,
            refunds_amount: activity.refunds_amount,
            discounts_amount: activity.discounts_amount,
            void_count: activity.void_count,
            close_method: shift.close_method || 'normal',
            force_close_reason: shift.force_close_reason || null,
            force_close_requested_by: shift.forceCloseRequestedByUser?.username || null,
            force_close_approved_by: shift.forceCloseApprovedByUser?.username || null
            };
        });

        const branches = Array.from(branchesById.values())
            .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));

        return {
            business: {
                tenant_id: tenant?.id || store.tenantId || null,
                name: tenant?.name || store.tenantName || null,
                onboarding_state: tenant?.tenant_onboarding_state || null
            },
            filters: {
                date_from: dateFrom,
                date_to: dateTo,
                branch_id: branchId || null,
                register_id: registerId || null
            },
            summary: {
                total_sales: toNumber(summaryRow?.total_sales),
                today_sales: toNumber(summaryRow?.total_sales),
                today_transactions: toNumber(summaryRow?.transaction_count),
                active_cashiers: activeCashierIds.size,
                active_registers: registers.filter((register) => register.is_active).length,
                branch_count: locations.length,
                open_shifts: openShifts.length,
                overdue_shifts: overdueShifts.length,
                cash_difference_amount: toNumber(closedShiftSummary.cash_difference_amount),
                low_stock_items: lowStockCount == null ? null : toNumber(lowStockCount),
                pending_approvals: pendingApprovals == null ? null : toNumber(pendingApprovals),
                offline_terminals: registers.filter((register) => register.terminal_status === 'offline').length,
                terminal_status_available: terminalHeartbeats.length > 0
            },
            branches,
            registers,
            cashiers,
            top_branches: branches.slice(0, 5),
            payment_summary: paymentSummaryRows.map((row) => ({
                payment_type: row.payment_type,
                payment_status: row.payment_status,
                transaction_count: toNumber(row.transaction_count),
                amount: toNumber(row.amount)
            })),
            sales_trend: salesTrendRows.map((row) => ({
                period: String(row.period || '').slice(0, 16),
                gross_sales: toNumber(row.gross_sales),
                refunds: toNumber(row.refunds_voids),
                discounts: toNumber(row.discounts),
                net_sales: toNumber(row.net_sales),
                gross_profit: toNumber(row.pos_profit_loss),
                vat: toNumber(row.vat),
                transaction_count: toNumber(row.transaction_count)
            })),
            recent_transactions: normalizedRecentTransactions,
            recent_shifts: normalizedRecentShifts,
            overdue_shifts: overdueShifts
        };
    }
};
