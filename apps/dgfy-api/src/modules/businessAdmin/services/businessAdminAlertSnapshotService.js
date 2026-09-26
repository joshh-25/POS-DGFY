import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { generateAlerts } from '../../../services/alertService.js';

const OVERDUE_SHIFT_MS = 12 * 60 * 60 * 1000;
const DELAYED_STOREFRONT_ORDER_MS = 45 * 60 * 1000;
const positiveThreshold = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const LARGE_REFUND_THRESHOLD = positiveThreshold(process.env.BUSINESS_ADMIN_LARGE_REFUND_THRESHOLD, 1000);
const HIGH_DISCOUNT_THRESHOLD = positiveThreshold(process.env.BUSINESS_ADMIN_HIGH_DISCOUNT_THRESHOLD, 500);
const CASH_DISCREPANCY_THRESHOLD = positiveThreshold(process.env.BUSINESS_ADMIN_CASH_DISCREPANCY_THRESHOLD, 100);

const severity = (value) => ({ expired: 'critical', high: 'critical', medium: 'warning', low: 'info' }[String(value || '').toLowerCase()] || String(value || 'info').toLowerCase());
const stableKey = (alert) => crypto.createHash('sha256').update(JSON.stringify({
    source_domain: alert.source_domain,
    type: alert.alert_type,
    source_entity_type: alert.source_entity_type || null,
    source_entity_id: alert.source_entity_id || null,
    branch_id: alert.branch_id || null
})).digest('hex');

const makeAlert = ({ alert_type, message, level = 'info', source_domain = 'operations', source_entity_type = null, source_entity_id = null, branch_id = null, target_route = null, payload = {} }) => ({
    alert_type,
    severity: severity(level),
    message,
    source_domain,
    source_entity_type,
    source_entity_id: source_entity_id == null ? null : String(source_entity_id),
    branch_id: Number.isInteger(Number(branch_id)) ? Number(branch_id) : null,
    target_route,
    payload
});

const parseJsonValue = (value) => {
    if (Array.isArray(value) || (value && typeof value === 'object')) return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const parseTerminalRegistry = (setting) => {
    const raw = setting?.data_type === 'json' ? parseJsonValue(setting.setting_value) : setting?.setting_value;
    const parsed = parseJsonValue(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
        terminal_id: String(entry?.terminal_id || '').trim().toUpperCase(),
        label: String(entry?.label || entry?.terminal_id || '').trim(),
        location_id: Number.parseInt(entry?.location_id, 10) || null,
        is_active: entry?.is_active !== false
    })).filter((entry) => entry.terminal_id);
};

const buildReadinessAlerts = async (tenant = null) => {
    const TenantLocation = dbStore.get('TenantLocation');
    const SystemSetting = dbStore.get('SystemSetting');
    const [locations, registrySetting, onboardingSetting] = await Promise.all([
        TenantLocation?.findAll ? TenantLocation.findAll({ where: { is_active: true }, attributes: ['location_id'], raw: true }) : [],
        SystemSetting?.findOne ? SystemSetting.findOne({ where: { setting_key: 'pos_terminal_registry' }, attributes: ['setting_value', 'data_type'], raw: true }) : null,
        SystemSetting?.findOne ? SystemSetting.findOne({ where: { setting_key: 'tenant_onboarding_state' }, attributes: ['setting_value', 'data_type'], raw: true }) : null
    ]);
    const registry = parseTerminalRegistry(registrySetting);
    const activeRegistry = registry.filter((terminal) => terminal.is_active);
    const tenantId = tenant?.id || dbStore.getStore?.()?.tenantId || null;
    const onboardingState = tenant?.tenant_onboarding_state
        || (onboardingSetting?.data_type === 'json' ? parseJsonValue(onboardingSetting.setting_value) : onboardingSetting?.setting_value)
        || null;

    return [
        ...(locations.length === 0 ? [makeAlert({
            alert_type: 'no_active_branches',
            level: 'critical',
            message: 'No active branches are configured.',
            source_domain: 'governance',
            source_entity_type: 'business',
            source_entity_id: tenantId,
            target_route: '/settings/branches',
            payload: { tenant_id: tenantId }
        })] : []),
        ...(activeRegistry.length === 0 ? [makeAlert({
            alert_type: 'no_active_registers',
            level: 'warning',
            message: 'No active POS registers are configured.',
            source_domain: 'governance',
            source_entity_type: 'register_registry',
            source_entity_id: 'pos_terminal_registry',
            target_route: '/settings/registers',
            payload: { registry_count: registry.length }
        })] : []),
        ...activeRegistry
            .filter((terminal) => !terminal.location_id)
            .map((terminal) => makeAlert({
                alert_type: 'register_missing_branch',
                level: 'warning',
                message: `${terminal.label || terminal.terminal_id} is active but not assigned to a branch.`,
                source_domain: 'governance',
                source_entity_type: 'terminal',
                source_entity_id: terminal.terminal_id,
                target_route: '/settings/registers',
                payload: terminal
            })),
        ...(onboardingState && onboardingState !== 'completed' ? [makeAlert({
            alert_type: 'onboarding_incomplete',
            level: 'info',
            message: 'Business onboarding is not completed.',
            source_domain: 'governance',
            source_entity_type: 'onboarding',
            source_entity_id: tenantId,
            target_route: '/onboarding',
            payload: { tenant_id: tenantId, state: onboardingState }
        })] : [])
    ];
};

const buildLegacyInventoryAlerts = async () => {
    const alerts = await generateAlerts();
    return alerts.map((alert) => makeAlert({
        alert_type: alert.type,
        level: alert.severity,
        message: alert.message,
        source_domain: 'inventory',
        source_entity_type: alert.batch_id ? 'fifo_batch' : alert.item_id ? 'item' : alert.supplier_id ? 'supplier' : 'inventory',
        source_entity_id: alert.batch_id || alert.item_id || alert.supplier_id || null,
        target_route: '/inventory',
        payload: alert
    }));
};

const buildOperationalAlerts = async (now) => {
    const PosTerminalHeartbeat = dbStore.get('PosTerminalHeartbeat');
    const PosTerminalShift = dbStore.get('PosTerminalShift');
    const PosTransaction = dbStore.get('PosTransaction');
    const PosTransactionAdjustment = dbStore.get('PosTransactionAdjustment');
    const BusinessAdminApprovalRequest = dbStore.get('BusinessAdminApprovalRequest');
    const Item = dbStore.get('Item');
    const [heartbeats, overdueShifts, failedPayments, delayedOrders, pendingApprovals, negativeItems, largeRefunds, highDiscounts, cashDiscrepancies] = await Promise.all([
        PosTerminalHeartbeat?.findAll ? PosTerminalHeartbeat.findAll({ where: { [Op.or]: [{ sync_state: 'offline' }, { offline_queue_count: { [Op.gt]: 0 } }] }, raw: true }) : [],
        PosTerminalShift?.findAll ? PosTerminalShift.findAll({ where: { status: 'open', opened_at: { [Op.lte]: new Date(now.getTime() - OVERDUE_SHIFT_MS) } }, raw: true }) : [],
        PosTransaction?.findAll ? PosTransaction.findAll({ where: { payment_status: 'failed', created_at: { [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }, raw: true }) : [],
        PosTransaction?.findAll ? PosTransaction.findAll({ where: { order_source: 'online_store', fulfillment_status: { [Op.notIn]: ['completed', 'cancelled'] }, status: { [Op.notIn]: ['voided', 'cancelled'] }, created_at: { [Op.lte]: new Date(now.getTime() - DELAYED_STOREFRONT_ORDER_MS) } }, raw: true }) : [],
        BusinessAdminApprovalRequest?.findAll ? BusinessAdminApprovalRequest.findAll({ where: { status: 'pending' }, raw: true }) : [],
        Item?.findAll ? Item.findAll({ where: { current_stock: { [Op.lt]: 0 } }, attributes: ['item_id', 'name', 'sku_code', 'current_stock'], raw: true }) : [],
        PosTransactionAdjustment?.findAll ? PosTransactionAdjustment.findAll({
            where: {
                status: 'succeeded',
                adjustment_type: { [Op.in]: ['cash_refund', 'external_refund', 'provider_refund'] },
                amount: { [Op.gte]: LARGE_REFUND_THRESHOLD }
            },
            include: PosTransaction ? [{ model: PosTransaction, as: 'transaction', attributes: ['pos_transaction_id', 'location_id', 'invoice_number'] }] : []
        }) : [],
        PosTransaction?.findAll ? PosTransaction.findAll({
            where: { status: 'completed', discount_amount: { [Op.gte]: HIGH_DISCOUNT_THRESHOLD } }, raw: true
        }) : [],
        PosTerminalShift?.findAll ? PosTerminalShift.findAll({
            where: { status: 'closed', cash_variance_amount: { [Op.or]: [{ [Op.gte]: CASH_DISCREPANCY_THRESHOLD }, { [Op.lte]: -CASH_DISCREPANCY_THRESHOLD }] } }, raw: true
        }) : []
    ]);

    return [
        ...heartbeats.map((heartbeat) => makeAlert({
            alert_type: heartbeat.sync_state === 'offline' ? 'terminal_offline' : 'offline_queue_failure',
            level: heartbeat.sync_state === 'offline' ? 'warning' : 'critical',
            message: heartbeat.sync_state === 'offline' ? `${heartbeat.terminal_id} is offline.` : `${heartbeat.terminal_id} has ${heartbeat.offline_queue_count} unsynced offline operation(s).`,
            source_domain: 'pos', source_entity_type: 'terminal', source_entity_id: heartbeat.terminal_id, branch_id: heartbeat.location_id, target_route: '/registers', payload: heartbeat
        })),
        ...overdueShifts.map((shift) => makeAlert({
            alert_type: 'overdue_shift', level: 'warning', message: `${shift.terminal_id} has been open for over 12 hours.`,
            source_domain: 'pos', source_entity_type: 'shift', source_entity_id: shift.pos_terminal_shift_id, branch_id: shift.location_id, target_route: '/shifts', payload: shift
        })),
        ...failedPayments.map((transaction) => makeAlert({
            alert_type: 'failed_payment', level: 'critical', message: `Payment failed for ${transaction.invoice_number || `transaction #${transaction.pos_transaction_id}`}.`,
            source_domain: 'payments', source_entity_type: 'transaction', source_entity_id: transaction.pos_transaction_id, branch_id: transaction.location_id, target_route: '/orders', payload: transaction
        })),
        ...delayedOrders.map((transaction) => makeAlert({
            alert_type: 'delayed_storefront_order', level: 'warning', message: `Storefront order ${transaction.invoice_number || `#${transaction.pos_transaction_id}`} is awaiting fulfillment.`,
            source_domain: 'storefront', source_entity_type: 'transaction', source_entity_id: transaction.pos_transaction_id, branch_id: transaction.location_id, target_route: '/orders', payload: transaction
        })),
        ...pendingApprovals.map((approval) => makeAlert({
            alert_type: 'pending_approval', level: 'warning', message: `${approval.action_type || 'High-risk'} approval is pending.`,
            source_domain: 'governance', source_entity_type: approval.entity_type || 'approval', source_entity_id: approval.business_admin_approval_request_id, branch_id: Number(approval.payload?.location_id) || null, target_route: '/approvals', payload: approval
        })),
        ...negativeItems.map((item) => makeAlert({
            alert_type: 'negative_inventory', level: 'critical', message: `${item.name || item.sku_code || `Item #${item.item_id}`} has negative inventory.`,
            source_domain: 'inventory', source_entity_type: 'item', source_entity_id: item.item_id, target_route: '/inventory', payload: item
        })),
        ...largeRefunds.map((refund) => {
            const row = typeof refund.toJSON === 'function' ? refund.toJSON() : refund;
            const transaction = row.transaction || {};
            return makeAlert({
                alert_type: 'large_refund', level: 'warning', message: `Large refund of PHP ${Number(row.amount || 0).toFixed(2)} was completed.`,
                source_domain: 'payments', source_entity_type: 'refund', source_entity_id: row.pos_transaction_adjustment_id,
                branch_id: transaction.location_id, target_route: '/orders', payload: row
            });
        }),
        ...highDiscounts.map((transaction) => makeAlert({
            alert_type: 'high_discount', level: 'warning', message: `High discount of PHP ${Number(transaction.discount_amount || 0).toFixed(2)} was applied to ${transaction.invoice_number || `transaction #${transaction.pos_transaction_id}`}.`,
            source_domain: 'pos', source_entity_type: 'transaction', source_entity_id: transaction.pos_transaction_id,
            branch_id: transaction.location_id, target_route: '/orders', payload: transaction
        })),
        ...cashDiscrepancies.map((shift) => makeAlert({
            alert_type: 'cash_discrepancy', level: 'critical', message: `${shift.terminal_id} closed with a cash variance of PHP ${Number(shift.cash_variance_amount || 0).toFixed(2)}.`,
            source_domain: 'pos', source_entity_type: 'shift', source_entity_id: shift.pos_terminal_shift_id,
            branch_id: shift.location_id, target_route: '/shifts', payload: shift
        }))
    ];
};

export const reconcileBusinessAdminAlertSnapshots = async ({ repository, tenant = null, now = new Date() }) => {
    const alerts = [
        ...await buildLegacyInventoryAlerts(),
        ...await buildReadinessAlerts(tenant),
        ...await buildOperationalAlerts(now)
    ];
    const snapshots = alerts.map((alert) => ({ ...alert, alert_key: stableKey(alert) }));
    await repository.reconcile(snapshots, now);
    return { evaluated: snapshots.length, evaluated_at: now.toISOString() };
};
