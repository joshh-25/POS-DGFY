import { useRef } from 'react';
import {
    CalendarDays,
    ClipboardCheck,
    FileText,
    KeyRound,
    LogIn,
    LogOut,
    Mail,
    Monitor,
    Package,
    Receipt,
    RefreshCcw,
    Settings2,
    ShieldAlert,
    Truck,
    UsersRound
} from 'lucide-react';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import PosAppliedFilterChips from './PosAppliedFilterChips.jsx';
import PosSearchField from './PosSearchField.jsx';
import AuditDateFilterDialog from './AuditDateFilterDialog.jsx';
import AuditWorkspaceResults from './AuditWorkspaceResults.jsx';
import useAuditWorkspace, { AUDIT_PAGE_SIZE_OPTIONS } from './useAuditWorkspace.js';

const HUMAN_EVENT_LABELS = Object.freeze({
    shift_opened: 'Shift opened',
    pos_terminal_shift_opened: 'Shift opened',
    shift_closed: 'Shift closed',
    pos_terminal_shift_closed: 'Shift closed',
    shift_location_switched: 'POS location changed',
    terminal_login: 'Signed in to POS terminal',
    terminal_logout: 'Signed out of POS terminal',
    pos_terminal_shift_location_switched: 'POS location changed',
    stale_shift_force_closed: 'Stale shift force-closed',
    pos_terminal_stale_shift_force_closed: 'Stale shift force-closed',
    cash_drawer_event_recorded: 'Cash drawer activity recorded',
    pos_cash_drawer_event_recorded: 'Cash drawer activity recorded',
    cash_in: 'Cash added to drawer',
    cash_out: 'Cash removed from drawer',
    counted_custody_transfer: 'Custody transfer counted',
    pos_checkout_completed: 'Sale completed',
    checkout_issued: 'Sale completed',
    pos_parked_sale_created: 'Parked sale created',
    pos_parked_sale_reparked: 'Parked sale saved again',
    pos_parked_sale_resumed: 'Parked sale resumed',
    pos_parked_sale_completed: 'Parked sale completed',
    pos_parked_sale_cancelled: 'Parked sale cancelled',
    pos_transaction_voided: 'Transaction voided',
    pos_transaction_item_voided: 'Item voided',
    pos_transaction_void_requested: 'Transaction void requested',
    pos_transaction_void_rejected: 'Transaction void rejected',
    pos_transaction_returned: 'Transaction returned',
    pos_cash_refund_completed: 'Cash refund completed',
    pos_item_cash_refund_completed: 'Item cash refund completed',
    pos_provider_refund_pending: 'Provider refund pending',
    pos_provider_refund_completed: 'Provider refund completed',
    pos_provider_refund_failed: 'Provider refund failed',
    pos_provider_refund_retryable_failure: 'Provider refund retryable failure',
    void: 'Transaction voided',
    pos_discount_applied: 'Discount applied',
    pos_item_discount_applied: 'Item discount applied',
    print_receipt: 'Receipt printed',
    print_original: 'Receipt printed',
    print_reprint: 'Receipt reprinted',
    print_shift_summary: 'Shift summary printed',
    print_z_reading: 'Z-reading printed',
    open_drawer: 'Cash drawer opened',
    pos_transactions_viewed: 'Transaction history viewed',
    pos_transaction_viewed: 'Transaction viewed',
    pos_z_reading_generated: 'Z-reading generated',
    pos_merchant_tender_reconciliation_reviewed: 'Payment reconciliation reviewed',
    reversal: 'Transaction reversal recorded',
    delivery_cash_collected: 'Delivery cash collected',
    pickup_cash_collected: 'Pickup cash collected',
    dine_in_payment_collected: 'Dine-in payment collected',
    order_balance_settled: 'Order balance settled',
    order_balance_payment_proof_attached: 'Payment proof attached',
    order_packing_evidence_attached: 'Packing evidence attached',
    delivery_completion_evidence_attached: 'Delivery completion evidence attached',
    pos_delivery_fee_overridden: 'Delivery fee updated',
    delivery_run_personnel_set: 'Delivery run personnel updated',
    delivery_run_members_added: 'Orders added to delivery run',
    delivery_run_member_removed: 'Order removed from delivery run',
    delivery_run_member_loading_marked: 'Delivery order loading updated',
    delivery_run_loading_confirmed: 'Delivery run loading confirmed',
    delivery_run_dispatched: 'Delivery run dispatched',
    delivery_run_member_dispatched: 'Delivery order dispatched',
    delivery_run_remittance_confirmed: 'Delivery remittance confirmed',
    delivery_run_remittance_variance_resolved: 'Delivery remittance variance resolved',
    delivered: 'Delivery marked delivered',
    'terminal.cash_event': 'Cash drawer activity recorded',
    pos_discount_rule_configuration: 'Discount rule updated',
    pos_drawer_authorization_failed: 'Cash drawer authorization failed',
    pos_parked_sale_snapshot_settlement: 'Parked sale settlement completed',
    pos_parked_sale_cancellation_requested: 'Parked sale cancellation requested',
    pos_parked_sale_cancellation_rejected: 'Parked sale cancellation rejected',
    pos_attendance_manager_correction: 'Attendance record corrected',
    pos_attendance_started: 'Attendance started',
    pos_attendance_relief_started: 'Relief attendance started',
    pos_attendance_ended: 'Attendance ended',
    pos_attendance_relief_ended: 'Relief attendance ended',
    pos_attendance_break_started: 'Attendance break started',
    pos_attendance_break_ended: 'Attendance break ended',
    pos_attendance_started_with_takeover: 'Attendance started with takeover',
    pos_attendance_started_with_shift: 'Attendance started with shift',
    pos_attendance_break_ended_with_resume: 'Attendance break ended and shift resumed',
    pos_attendance_ended_with_shift: 'Attendance ended with shift',
    pos_cashier_attendance_config_changed: 'Cashier attendance settings changed',
    pos_cashier_shift_operator_started: 'Shift operator started',
    pos_cashier_pin_verification_failed: 'Cashier PIN verification failed',
    pos_operator_session_started: 'Operator session started',
    pos_operator_session_ended: 'Operator session ended',
    shared_relief_start: 'Shared relief started',
    shared_relief_end: 'Shared relief ended',
    pos_cashier_pin_enrolled: 'Cashier PIN enrolled',
    pos_cashier_pin_reset: 'Cashier PIN reset',
    pos_reset_counter_incremented: 'POS counter reset',
    governed_reset_counter_increment: 'POS counter reset',
    esales_export: 'eSales data exported',
    terminal_registration: 'POS terminal registered',
    pos_device_activation_issued: 'POS device activation issued',
    pos_device_activated: 'POS device activated',
    pos_device_replaced: 'POS device replaced',
    pos_device_revoked: 'POS device revoked',
    pos_device_challenge_issued: 'POS device challenge issued',
    pos_catalog_override_updated: 'POS item updated',
    pos_catalog_image_uploaded: 'Item image uploaded',
    pos_catalog_image_deleted: 'Item image deleted',
    z_reading: 'Z-reading generated',
    security_signal: 'Security event recorded',
    pos_catalog_image_cleanup_failed: 'POS image cleanup failed',
    'barcode.created': 'Item barcode created',
    'barcode.primary_changed': 'Primary item barcode changed',
    'barcode.deactivated': 'Item barcode deactivated',
    'barcode.conflict_resolved': 'Barcode conflict resolved',
    'barcode.label_print_intent': 'Barcode label printed',
    status: 'POS hardware checked',
    'pos_device_bridge.view': 'POS hardware checked'
});

const HUMAN_LEGACY_EVENT_LABELS = Object.freeze({
    'pos_terminal_shift.create': 'Shift opened',
    'pos_terminal_shift.update': 'Shift event details unavailable',
    'delivery_job.update': 'Delivery event details unavailable',
    'pos_transaction.update': 'Transaction event details unavailable',
    'pos_parked_sale.update': 'Parked sale event details unavailable'
});

const HUMAN_ENTITY_LABELS = Object.freeze({
    pos_device_bridge: 'POS hardware',
    pos_device_receipt: 'receipt',
    pos_device_shift_summary: 'shift summary',
    pos_device_z_reading: 'Z-reading',
    pos_device_drawer: 'cash drawer',
    pos_terminal_session: 'POS terminal session',
    pos_terminal_shift: 'shift',
    delivery_run: 'delivery run',
    delivery_run_remittance: 'delivery remittance',
    delivery_run_remittance_variance: 'remittance variance',
    pos_transaction: 'transaction',
    pos_parked_sale: 'parked sale',
    pos_discount: 'discount',
    pos_item_discount: 'item discount',
    pos_z_reading: 'Z-reading',
    pos_cash_drawer_event: 'cash drawer activity',
    terminal_registration: 'POS terminal',
    system_setting: 'system setting',
    item_storefront_catalog_override: 'storefront item',
    pos_catalog_override: 'POS item',
    item_catalog_image: 'item image',
    item: 'item',
    pos_sale_session: 'parked sale',
    delivery_job: 'delivery order',
    pos_day_close_pin: 'global POS PIN',
    item_barcode: 'item barcode',
    item_category: 'item category',
    employee: 'employee',
    employee_credit: 'employee credit account',
    user_pos_actions: 'POS permissions'
});

const HUMAN_ACTION_LABELS = Object.freeze({
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    VIEW: 'Viewed'
});

const HUMAN_SETTING_LABELS = Object.freeze({
    storefront_hours: 'Changed storefront hours',
    storefront_review_summary: 'Changed storefront review summary',
    storefront_review_highlights: 'Changed storefront review highlights',
    pos_best_seller_settings: 'Changed POS best-seller settings',
    customer_access_mode: 'Changed customer access mode',
    inventory_display_mode: 'Changed inventory display mode',
    inventory_low_stock_display_threshold: 'Changed low-stock display threshold',
    store_delivery_fee: 'Changed store delivery fee'
});

const HUMAN_CATALOG_FIELD_LABELS = Object.freeze({
    storefront_visible: 'Changed storefront item visibility',
    location_availability: 'Changed item location availability'
});

const HUMAN_ENTITY_EVENT_LABELS = Object.freeze({
    'pos_sale_session.created': 'Parked sale created',
    'pos_sale_session.retrieved': 'Parked sale resumed',
    'pos_sale_session.reparked': 'Parked sale re-saved',
    'pos_sale_session.cancelled': 'Parked sale cancelled',
    'pos_sale_session.completed': 'Parked sale completed',
    'pos_sale_session.parked_on_shift_close': 'Sale parked at shift close',
    'delivery_job.delivery_job_status_changed': 'Delivery status changed',
    'delivery_job.delivery_personnel_assigned': 'Delivery personnel assigned',
    'delivery_run.delivery_run_personnel_set': 'Delivery run personnel updated',
    'delivery_run.delivery_run_members_added': 'Orders added to delivery run',
    'delivery_run.delivery_run_loading_confirmed': 'Delivery run loading confirmed',
    'delivery_run.delivery_run_dispatched': 'Delivery run dispatched',
    'pos_transaction.pickup_cash_collected': 'Pickup payment collected',
    'pos_day_close_pin.self_service_configure': 'Global POS PIN configured',
    'pos_z_reading.close_day_z_reading': 'Business day closed',
    'pos_z_reading.reprint_close_day_z_reading': 'Z-reading reprinted',
    'user_pos_actions.user_pos_actions_updated': 'POS permissions changed',
    'item_category.CREATE': 'Item category created',
    'employee.CREATE': 'Employee created'
});

const HUMAN_EMPLOYEE_CREDIT_ACTION_LABELS = Object.freeze({
    charge: 'Employee credit charged',
    repayment: 'Employee credit repayment recorded',
    employee_account_configuration: 'Employee credit account configured'
});

export const parseAuditChanges = (changes) => {
    if (changes && typeof changes === 'object' && !Array.isArray(changes)) return changes;
    if (typeof changes !== 'string' || !changes.trim()) return {};
    try {
        const parsed = JSON.parse(changes);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const humanizeToken = (value) => String(value || '')
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const humanizeDiscountType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'manual' ? 'Other' : humanizeToken(value);
};

const uniqueLabels = (labels) => Array.from(new Set(labels.filter(Boolean)));

const formatAuditValue = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return 'none';
    if (typeof value === 'boolean') return value ? 'enabled' : 'disabled';
    return humanizeToken(value);
};

const formatAuditMoney = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatAuditValue(value);
};

const formatAuditOrderReference = (entry, changes) => {
    const orderId = changes.pos_transaction_id
        || changes.transaction_id
        || changes.order_id
        || (entry.entity_type === 'pos_transaction' ? entry.entity_id : null);
    return orderId ? `order #${orderId}` : 'order';
};

const formatAuditItemReference = (entry, changes) => {
    const itemId = changes.item_id || entry.entity_id;
    return itemId ? `item #${itemId}` : 'item';
};

const AUDIT_DETAIL_KEY_LABELS = Object.freeze({
    park_reference: 'Park reference',
    line_count: 'Items',
    total_amount: 'Total',
    subtotal_amount: 'Subtotal',
    discount_amount: 'Discount',
    discount_rate: 'Discount rate',
    rate: 'Rate',
    terminal_id: 'Terminal',
    claimed_terminal_id: 'Claimed terminal',
    shift_id: 'Shift',
    origin_shift_id: 'Original shift',
    previous_shift_id: 'Previous shift',
    request_id: 'Request ID',
    actor_email: 'Actor Email',
    delivery_run_id: 'Delivery Run',
    pos_transaction_ids: 'Orders',
    accountable_delivery_personnel_id: 'Accountable Personnel ID',
    accountable_delivery_personnel_name: 'Accountable Personnel',
    delivery_personnel_id: 'Delivery Personnel ID',
    delivery_personnel_name: 'Delivery Personnel',
    previous_delivery_personnel_id: 'Previous Delivery Personnel ID',
    previous_delivery_personnel_name: 'Previous Delivery Personnel',
    personnel: 'Personnel',
    previous_state: 'Previous State',
    current_state: 'Current State',
    loading_state: 'Loading State',
    loading_summary: 'Loading Summary',
    previous_status: 'Previous Status',
    current_status: 'Current Status',
    provider: 'Provider',
    payment_type: 'Payment Type',
    payment_method: 'Payment Method',
    payment_timing: 'Payment Timing',
    payment_status: 'Payment Status',
    cash_received: 'Cash Received',
    change_amount: 'Change Amount',
    collected_at: 'Collected At',
    settled_at: 'Settled At',
    applied_at: 'Applied At',
    assigned_at: 'Assigned At',
    attached_at: 'Attached At',
    allocation_count: 'Allocations',
    total_expected_amount: 'Expected Total',
    total_remitted_amount: 'Remitted Total',
    total_variance_amount: 'Variance Total',
    reversal_variance_id: 'Reversal Variance ID',
    image_count: 'Images',
    has_signature: 'Signature',
    location_id: 'Location',
    cashier_id: 'Current cashier',
    origin_cashier_id: 'Original cashier',
    previous_cashier_id: 'Previous cashier',
    user_id: 'User',
    pos_transaction_id: 'Order',
    transaction_id: 'Order',
    order_id: 'Order',
    revision: 'Revision',
    status: 'Status',
    reason: 'Reason',
    cancel_reason: 'Cancellation reason'
});

const AUDIT_MONEY_KEY_PATTERN = /(amount|price|fee|cash|subtotal|discount|balance|variance|sales|tax)/i;
const AUDIT_RATE_KEY_PATTERN = /(^|_)rate$/i;
const AUDIT_IDENTIFIER_KEY_PATTERN = /(^|_)id$/i;
const AUDIT_CASHIER_ID_PATTERN = /^(origin_|previous_)?cashier_id$/i;
const AUDIT_SENSITIVE_KEY_PATTERN = /(password|passwd|pin|token|secret|authorization|access[_-]?token|refresh[_-]?token)/i;
const AUDIT_METADATA_KEY_SET = new Set(['event', 'event_type', 'operation']);
const AUDIT_TIMESTAMP_KEY_PATTERN = /(^|_)(at|timestamp|time)$/i;
const AUDIT_PRESERVE_TEXT_KEY_PATTERN = /(^|_)(email|name|reference|reason|note)$/i;
const AUDIT_INLINE_VALUE_DIVIDER = ' · ';

const formatAuditDetailKey = (key) => AUDIT_DETAIL_KEY_LABELS[key]
    || humanizeToken(key).replace(/\bId\b/g, 'ID').replace(/\bJson\b/g, 'JSON');

const formatAuditPreservedText = (value) => {
    const text = String(value ?? '');
    return /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(text.trim()) ? humanizeToken(text) : text;
};

const hasAuditReadableValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '' && value !== '—';
    if (Array.isArray(value)) return value.some((item) => hasAuditReadableValue(item));
    if (typeof value === 'object') {
        return Object.entries(value).some(([key, childValue]) => (
            !AUDIT_SENSITIVE_KEY_PATTERN.test(key) && hasAuditReadableValue(childValue)
        ));
    }
    return true;
};

const getAuditDisplayContext = (entry = {}, locations = []) => ({
    cashierNames: entry?.cashier_names && typeof entry.cashier_names === 'object' && !Array.isArray(entry.cashier_names)
        ? entry.cashier_names
        : {},
    locationNames: new Map(
        (Array.isArray(locations) ? locations : [])
            .map((location) => [Number(location?.location_id), String(location?.name || '').trim()])
            .filter(([locationId, name]) => Number.isInteger(locationId) && locationId > 0 && name)
    )
});

const getAuditObjectDisplayName = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    return [
        value.display_name,
        value.delivery_personnel_name,
        value.full_name,
        value.item_name,
        value.employee_name,
        value.name,
        value.username,
        value.email,
        value.label,
        value.title
    ].map((candidate) => String(candidate || '').trim()).find(Boolean) || '';
};

const formatAuditObjectSummary = (value, locationNames, cashierNames, depth) => {
    const displayName = getAuditObjectDisplayName(value);
    if (displayName) return displayName;
    if (depth >= 2) return 'Details available';
    const summary = Object.entries(value)
        .filter(([childKey, childValue]) => (
            childValue !== undefined
            && childValue !== null
            && !AUDIT_SENSITIVE_KEY_PATTERN.test(childKey)
            && hasAuditReadableValue(childValue)
        ))
        .slice(0, 5)
        .map(([childKey, childValue]) => `${formatAuditDetailKey(childKey)}: ${formatAuditDetailValue(childKey, childValue, locationNames, cashierNames, depth + 1)}`);
    return summary.length > 0 ? summary.join(AUDIT_INLINE_VALUE_DIVIDER) : 'Details available';
};

const formatAuditDetailValue = (key, value, locationNames = new Map(), cashierNames = {}, depth = 0) => {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return 'None';
    if (key === 'pos_transaction_ids' && Array.isArray(value)) return formatAuditOrderList(value) || 'None';
    if (Array.isArray(value)) {
        if (value.length === 0) return 'None';
        return value
            .map((item) => item && typeof item === 'object' && !Array.isArray(item)
                ? formatAuditObjectSummary(item, locationNames, cashierNames, depth + 1)
                : formatAuditDetailValue(key, item, locationNames, cashierNames, depth + 1))
            .filter((item) => item && item !== 'None')
            .join(', ') || 'None';
    }
    if (value && typeof value === 'object') {
        return formatAuditObjectSummary(value, locationNames, cashierNames, depth);
    }
    if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
    if (key === 'location_id') {
        const locationId = Number(value);
        return locationNames.get(locationId) || `Location ID ${String(value)}`;
    }
    if (key === 'discount_type') return humanizeDiscountType(value);
    if (AUDIT_CASHIER_ID_PATTERN.test(key)) {
        const cashierId = String(value);
        const cashierName = String(cashierNames?.[key] || '').trim();
        return cashierName ? `${cashierName} (User ID: ${cashierId})` : `User ID ${cashierId}`;
    }
    if (AUDIT_IDENTIFIER_KEY_PATTERN.test(key)) return String(value);
    if (AUDIT_RATE_KEY_PATTERN.test(key) && Number.isFinite(Number(value))) return `${Number(value).toFixed(2)}%`;
    if (AUDIT_MONEY_KEY_PATTERN.test(key) && Number.isFinite(Number(value))) return formatAuditMoney(value);
    if (typeof value === 'number') return String(value);
    if (AUDIT_TIMESTAMP_KEY_PATTERN.test(key)) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return formatAuditDate(value);
    }
    if (key === 'park_reference' || key === 'terminal_id') return String(value);
    if (AUDIT_PRESERVE_TEXT_KEY_PATTERN.test(key)) return formatAuditPreservedText(value);
    return humanizeToken(value);
};

export const formatAuditDetailLines = (entry = {}, locations = []) => {
    const changes = parseAuditChanges(entry.changes);
    const { locationNames, cashierNames } = getAuditDisplayContext(entry, locations);
    return Object.entries(changes)
        .filter(([key, value]) => !AUDIT_METADATA_KEY_SET.has(key) && !AUDIT_SENSITIVE_KEY_PATTERN.test(key) && value !== undefined && value !== null)
        .filter(([, value]) => hasAuditReadableValue(value))
        .map(([key, value]) => `${formatAuditDetailKey(key)}: ${formatAuditDetailValue(key, value, locationNames, cashierNames)}`)
        .filter((line) => !line.endsWith(': None'));
};

export const groupAuditDetailLines = (lines = []) => {
    const groups = [];
    for (let index = 0; index < lines.length; index += 10) {
        const group = lines.slice(index, index + 10);
        groups.push({
            left: group.slice(0, 5),
            right: group.slice(5, 10)
        });
    }
    return groups;
};

const resolveSettingLabels = (changes) => {
    const keys = Array.isArray(changes.setting_keys)
        ? changes.setting_keys
        : [changes.setting_keys].filter(Boolean);
    return uniqueLabels(keys.map((key) => {
        const normalizedKey = String(key || '').trim().toLowerCase();
        return HUMAN_SETTING_LABELS[normalizedKey] || `Changed ${humanizeToken(normalizedKey).toLowerCase()}`;
    }));
};

const resolveCatalogLabels = (changes, entry) => {
    const labels = [];
    const itemReference = formatAuditItemReference(entry, changes);
    if (Object.prototype.hasOwnProperty.call(changes, 'storefront_visible')) {
        labels.push(`${changes.storefront_visible ? 'Made' : 'Removed'} ${itemReference} ${changes.storefront_visible ? 'visible' : 'hidden'} on storefront`);
    }
    if (Array.isArray(changes.location_availability)) {
        const availability = changes.location_availability
            .map((location) => {
                const locationId = location?.location_id || 'unknown location';
                return `location #${locationId} ${location?.storefront_available ? 'available' : 'unavailable'}`;
            })
            .join(', ');
        labels.push(`Set ${itemReference} availability: ${availability}`);
    }
    return uniqueLabels(labels.length > 0
        ? labels
        : Object.keys(changes)
            .filter((key) => HUMAN_CATALOG_FIELD_LABELS[key])
            .map((key) => HUMAN_CATALOG_FIELD_LABELS[key]));
};

const resolveEventType = (entry, changes) => String(
    changes.event
    || changes.event_type
    || entry.event_type
    || changes.operation
    || ''
).trim().toLowerCase();

const resolveEntityEventLabel = ({ entityType, eventType, action: entryAction, changes }) => {
    const employeeCreditAction = String(changes.action || '').trim().toLowerCase();
    if (entityType === 'employee_credit' && HUMAN_EMPLOYEE_CREDIT_ACTION_LABELS[employeeCreditAction]) {
        return HUMAN_EMPLOYEE_CREDIT_ACTION_LABELS[employeeCreditAction];
    }

    const action = String(changes.action || entryAction || '').trim().toUpperCase();
    return HUMAN_ENTITY_EVENT_LABELS[`${entityType}.${eventType}`]
        || HUMAN_ENTITY_EVENT_LABELS[`${entityType}.${action}`]
        || null;
};

const formatAuditOrderList = (value) => {
    if (!Array.isArray(value) || value.length === 0) return '';
    return value
        .map((orderId) => String(orderId || '').trim())
        .filter(Boolean)
        .map((orderId) => `#${orderId}`)
        .join(', ');
};

const formatAuditPersonnelSummary = (changes) => {
    const directName = String(
        changes.accountable_delivery_personnel_name
        || changes.delivery_personnel_name
        || ''
    ).trim();
    if (directName) return directName;
    return formatAuditDetailValue('personnel', changes.personnel);
};

const resolveDeliveryLabels = (entry, eventType, changes) => {
    const orderReference = formatAuditOrderReference(entry, changes);
    const labels = [];
    const hasStatusChange = changes.previous_status !== undefined
        && changes.status !== undefined
        && String(changes.previous_status) !== String(changes.status);
    if (eventType === 'delivery_job_status_changed' || hasStatusChange) {
        labels.push(hasStatusChange
            ? `Changed delivery status for ${orderReference} from ${formatAuditValue(changes.previous_status)} to ${formatAuditValue(changes.status)}`
            : `Changed delivery status for ${orderReference}`);
    }
    if (eventType === 'delivery_personnel_assigned') {
        const previousName = String(changes.previous_delivery_personnel_name || '').trim();
        const nextName = String(changes.delivery_personnel_name || '').trim();
        const nextId = changes.delivery_personnel_id || null;
        if (previousName && nextName && previousName !== nextName) {
            labels.push(`Changed delivery person for ${orderReference} from ${previousName} to ${nextName}`);
        } else if (nextName) {
            labels.push(`Assigned ${nextName} to ${orderReference}`);
        } else if (nextId) {
            labels.push(`Assigned delivery personnel #${nextId} to ${orderReference}`);
        } else {
            labels.push(`Changed delivery assignment for ${orderReference}`);
        }
    }
    if (eventType === 'delivery_run_personnel_set') {
        const personnel = formatAuditPersonnelSummary(changes);
        labels.push(personnel && personnel !== 'None'
            ? `Updated delivery run personnel: ${personnel}`
            : 'Updated delivery run personnel');
    }
    if (eventType === 'delivery_run_members_added') {
        const orders = formatAuditOrderList(changes.pos_transaction_ids);
        labels.push(orders ? `Added orders ${orders} to delivery run` : 'Added orders to delivery run');
    }
    if (eventType === 'delivery_run_member_removed') {
        labels.push(`Removed ${orderReference} from delivery run`);
    }
    if (eventType === 'delivery_run_member_loading_marked') {
        const state = changes.current_state || changes.loading_state;
        labels.push(state
            ? `Marked ${orderReference} as ${formatAuditValue(state)}`
            : `Updated loading status for ${orderReference}`);
    }
    if (eventType === 'delivery_run_loading_confirmed') labels.push('Confirmed delivery run loading');
    if (eventType === 'delivery_run_dispatched') {
        const status = changes.current_status || changes.status;
        labels.push(status ? `Dispatched delivery run as ${formatAuditValue(status)}` : 'Dispatched delivery run');
    }
    if (eventType === 'delivery_run_member_dispatched') labels.push(`Dispatched ${orderReference}`);
    if (eventType === 'delivery_run_remittance_confirmed') labels.push('Confirmed delivery remittance');
    if (eventType === 'delivery_run_remittance_variance_resolved') labels.push('Resolved delivery remittance variance');
    if (eventType === 'delivery_completion_evidence_attached') labels.push(`Attached delivery completion evidence for ${orderReference}`);
    return uniqueLabels(labels);
};

const resolveShiftLabels = (entry, eventType, changes) => {
    const terminal = changes.terminal_id || entry.terminal_id;
    const terminalSuffix = terminal ? ` on ${terminal}` : '';
    if (eventType === 'shift_opened') {
        const openingFloat = changes.opening_float_amount === undefined
            ? ''
            : ` with ${formatAuditMoney(changes.opening_float_amount)} opening cash`;
        return [`Opened shift${terminalSuffix}${openingFloat}`];
    }
    if (eventType === 'shift_closed') {
        const closingCash = changes.closing_cash_amount === undefined
            ? ''
            : ` with ${formatAuditMoney(changes.closing_cash_amount)} cash`;
        const expectedCash = changes.expected_cash_amount === undefined
            ? ''
            : ` (expected ${formatAuditMoney(changes.expected_cash_amount)})`;
        return [`Closed shift${terminalSuffix}${closingCash}${expectedCash}`];
    }
    if (eventType === 'cash_drawer_event_recorded') {
        const amount = changes.amount === undefined ? '' : ` ${formatAuditMoney(changes.amount)}`;
        const eventLabel = String(changes.event_type || '').trim().toLowerCase() === 'cash_out'
            ? 'Removed'
            : 'Added';
        return [`${eventLabel}${amount} ${eventLabel === 'Added' ? 'to' : 'from'} the cash drawer`];
    }
    return [];
};

const resolveParkedSaleLabels = (entry, eventType, changes) => {
    const reference = changes.park_reference ? ` ${changes.park_reference}` : '';
    const amount = changes.total_amount === undefined ? '' : ` for ${formatAuditMoney(changes.total_amount)}`;
    if (eventType === 'pos_parked_sale_created' || eventType === 'created') return [`Created parked sale${reference}${amount}`];
    if (eventType === 'pos_parked_sale_reparked' || eventType === 'reparked') {
        const revision = changes.revision ? ` revision ${changes.revision}` : '';
        return [`Saved parked sale${revision}${amount}`];
    }
    if (eventType === 'pos_parked_sale_resumed' || eventType === 'retrieved') {
        const previousCashier = changes.previous_cashier_id ? ` from cashier #${changes.previous_cashier_id}` : '';
        const currentCashier = changes.cashier_id && changes.previous_cashier_id
            ? ` to cashier #${changes.cashier_id}`
            : '';
        return [`Resumed parked sale${reference}${previousCashier}${currentCashier}`];
    }
    if (eventType === 'pos_parked_sale_cancelled' || eventType === 'cancelled') {
        return [`Cancelled parked sale${changes.cancel_reason ? `: ${changes.cancel_reason}` : ''}`];
    }
    if (eventType === 'pos_parked_sale_cancellation_requested') return ['Parked sale cancellation requested'];
    if (eventType === 'pos_parked_sale_cancellation_rejected') return ['Parked sale cancellation rejected'];
    if (eventType === 'pos_parked_sale_snapshot_settlement') return ['Settled parked sale'];
    if (eventType === 'pos_parked_sale_completed' || eventType === 'completed') return ['Completed parked sale'];
    return [];
};

const resolveTransactionLabels = (entry, eventType, changes) => {
    const orderReference = formatAuditOrderReference(entry, changes);
    if (eventType === 'pickup_cash_collected' || eventType === 'delivery_cash_collected') {
        const amount = changes.cash_received === undefined ? '' : ` ${formatAuditMoney(changes.cash_received)}`;
        const channel = eventType === 'delivery_cash_collected' ? 'delivery' : 'pickup';
        return [`Collected${amount} cash for ${channel} ${orderReference}`];
    }
    if (eventType === 'dine_in_payment_collected') {
        const amount = changes.amount === undefined ? '' : ` ${formatAuditMoney(changes.amount)}`;
        return [`Collected${amount} dine-in payment for ${orderReference}`];
    }
    if (eventType === 'order_balance_settled') {
        const amount = changes.balance_settled === undefined ? '' : ` ${formatAuditMoney(changes.balance_settled)}`;
        return [`Settled${amount} balance for ${orderReference}`];
    }
    if (eventType === 'order_balance_payment_proof_attached') return [`Attached payment proof for ${orderReference}`];
    if (eventType === 'order_packing_evidence_attached') {
        const count = changes.count === undefined ? '' : ` (${changes.count} ${Number(changes.count) === 1 ? 'image' : 'images'})`;
        return [`Attached packing evidence${count} for ${orderReference}`];
    }
    if (eventType === 'pos_delivery_fee_overridden') return [`Updated delivery fee for ${orderReference}`];
    if (eventType === 'pos_transaction_voided' || eventType === 'void') {
        const reason = changes.void_reason || changes.reason || entry.reason;
        return [`Voided ${orderReference}${reason ? ` because ${reason}` : ''}`];
    }
    if (eventType === 'pos_transaction_item_voided') {
        const item = changes.item_name || formatAuditItemReference(entry, changes);
        return [`Voided ${item} on ${orderReference}`];
    }
    if (eventType === 'pos_transaction_void_rejected') return [`Transaction void rejected for ${orderReference}`];
    if (eventType === 'pos_transaction_returned') return [`Returned ${orderReference}`];
    if (eventType === 'pos_cash_refund_completed' || eventType === 'pos_item_cash_refund_completed') {
        const amount = changes.amount === undefined ? '' : ` ${formatAuditMoney(changes.amount)}`;
        return [`Refunded${amount} ${orderReference}`];
    }
    if (eventType === 'pos_provider_refund_pending') return [`Provider refund pending for ${orderReference}`];
    if (eventType === 'pos_provider_refund_completed') return [`Provider refund completed for ${orderReference}`];
    if (eventType === 'pos_provider_refund_failed') return [`Provider refund failed for ${orderReference}`];
    if (eventType === 'pos_provider_refund_retryable_failure') return [`Provider refund can be retried for ${orderReference}`];
    if (eventType === 'checkout_issued' || eventType === 'pos_checkout_completed') return [`Completed checkout for ${orderReference}`];
    return [];
};

const resolveDiscountLabels = (entry, eventType, changes) => {
    const entityType = String(entry.entity_type || '').trim().toLowerCase();
    if (entityType !== 'pos_discount' && entityType !== 'pos_item_discount'
        && eventType !== 'pos_discount_applied' && eventType !== 'pos_item_discount_applied') return [];
    const hasDiscountEvidence = eventType === 'pos_discount_applied'
        || eventType === 'pos_item_discount_applied'
        || changes.discount_type
        || changes.discount_amount !== undefined
        || changes.authorized_by_user_id
        || changes.approved_by_user_id;
    if (!hasDiscountEvidence) return [];
    const orderReference = formatAuditOrderReference(entry, changes);
    const type = humanizeDiscountType(changes.discount_type || 'discount');
    const amount = changes.discount_amount === undefined ? '' : ` ${formatAuditMoney(changes.discount_amount)}`;
    const authorizedBy = String(
        changes.authorized_by_name
        || changes.approved_by_name
        || (changes.authorized_by_user_id ? `employee #${changes.authorized_by_user_id}` : '')
    ).trim();
    const cashier = String(changes.cashier_name || changes.applied_by_name || '').trim();
    const itemReference = entityType === 'pos_item_discount'
        ? ` for ${String(changes.item_name || '').trim() || formatAuditItemReference(entry, changes)}`
        : '';
    const labels = [`Applied ${type} discount${amount}${itemReference} to ${orderReference}`];
    if (authorizedBy) labels.push(`Authorized by ${authorizedBy}`);
    if (cashier && cashier !== authorizedBy) labels.push(`Cashier: ${cashier}`);
    return labels;
};

const resolveEmployeeCreditLabels = (changes) => {
    const amount = changes.amount === undefined ? '' : ` ${formatAuditMoney(changes.amount)}`;
    const employee = changes.employee_name_snapshot ? ` for ${changes.employee_name_snapshot}` : '';
    if (changes.action === 'charge') return [`Charged${amount} to employee credit${employee}`];
    if (changes.action === 'repayment') return [`Recorded${amount} employee credit repayment${employee}`];
    if (changes.action === 'employee_account_configuration') return ['Configured employee credit account'];
    return [];
};

const resolveItemLabels = (entry, eventType, changes) => {
    const itemReference = formatAuditItemReference(entry, changes);
    const itemName = String(changes.item_name || '').trim();
    if (eventType === 'item_created') return [`Created ${itemName || itemReference}`];
    if (eventType === 'item_finalized') return [`Activated ${itemName || itemReference}`];
    if (eventType === 'item_deleted') return [`Deleted ${itemName || itemReference}`];

    const changedFields = changes.changed_fields && typeof changes.changed_fields === 'object'
        ? changes.changed_fields
        : {};
    const labels = Object.entries(changedFields).map(([field, value]) => {
        const previous = value?.from;
        const next = value?.to;
        if (field === 'cost_per_unit') {
            return `Changed cost for ${itemName || itemReference} from ${formatAuditMoney(previous)} to ${formatAuditMoney(next)}`;
        }
        if (field === 'default_sale_price') {
            return `Changed sale price for ${itemName || itemReference} from ${formatAuditMoney(previous)} to ${formatAuditMoney(next)}`;
        }
        if (field === 'name') {
            return `Renamed ${itemReference} from ${previous || 'unnamed'} to ${next || 'unnamed'}`;
        }
        return `Changed ${humanizeToken(field).toLowerCase()} for ${itemName || itemReference} from ${formatAuditValue(previous)} to ${formatAuditValue(next)}`;
    });
    if (labels.length > 0) return uniqueLabels(labels);
    if (eventType === 'item_updated') return [`Edited ${itemName || itemReference}`];
    return [];
};

const resolveCatalogImageLabels = (entry, eventType, changes) => {
    const itemReference = changes.item_name || formatAuditItemReference(entry, changes);
    if (eventType === 'item_catalog_image_uploaded' || eventType === 'pos_catalog_image_uploaded') {
        return [`${changes.replaced_existing_image ? 'Replaced' : 'Uploaded'} image for ${itemReference}`];
    }
    if (eventType === 'item_catalog_images_uploaded') {
        return [`Uploaded ${changes.uploaded_count || 'multiple'} images for ${itemReference}`];
    }
    if (eventType === 'item_catalog_image_deleted' || eventType === 'pos_catalog_image_deleted') {
        return [`Deleted image from ${itemReference}`];
    }
    if (eventType === 'item_catalog_images_deleted') {
        return [`Deleted ${changes.deleted_count || 'all'} images from ${itemReference}`];
    }
    if (eventType === 'item_catalog_gallery_updated') {
        const labels = [`Updated image order for ${itemReference}`];
        if (changes.primary_image_changed) labels.push(`Changed the primary image for ${itemReference}`);
        return labels;
    }
    return [];
};

const resolvePosCatalogLabels = (entry, changes) => {
    const itemReference = changes.item_name || formatAuditItemReference(entry, changes);
    const labels = [];
    if (Object.prototype.hasOwnProperty.call(changes, 'pos_visible')) {
        labels.push(`${changes.pos_visible ? 'Made' : 'Removed'} ${itemReference} ${changes.pos_visible ? 'visible' : 'hidden'} in POS`);
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'pos_always_available')) {
        labels.push(`${changes.pos_always_available ? 'Enabled' : 'Disabled'} always available for ${itemReference}`);
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'pos_best_seller_mode')) {
        labels.push(`Changed best-seller mode for ${itemReference} to ${formatAuditValue(changes.pos_best_seller_mode)}`);
    }
    return uniqueLabels(labels);
};

const resolveDetailedLabels = (entry, eventType, changes) => {
    const entityType = String(entry.entity_type || '').trim().toLowerCase();
    if (entityType === 'item') return resolveItemLabels(entry, eventType, changes);
    if (entityType === 'item_catalog_image') return resolveCatalogImageLabels(entry, eventType, changes);
    if (entityType === 'pos_catalog_override') return resolvePosCatalogLabels(entry, changes);
    if (entityType === 'delivery_job'
        || entityType === 'delivery_run'
        || entityType === 'delivery_run_remittance'
        || entityType === 'delivery_run_remittance_variance') return resolveDeliveryLabels(entry, eventType, changes);
    if (entityType === 'pos_terminal_shift') return resolveShiftLabels(entry, eventType, changes);
    if (entityType === 'pos_transaction') return resolveTransactionLabels(entry, eventType, changes);
    if (entityType === 'pos_parked_sale' || entityType === 'pos_sale_session') return resolveParkedSaleLabels(entry, eventType, changes);
    if (entityType === 'employee_credit') return resolveEmployeeCreditLabels(changes);
    if (entityType === 'item_barcode' && eventType) {
        const itemReference = formatAuditItemReference(entry, changes);
        if (eventType === 'barcode.created') return [`Created barcode for ${itemReference}`];
        if (eventType === 'barcode.primary_changed') return [`Changed primary barcode for ${itemReference}`];
        if (eventType === 'barcode.deactivated') return [`Deactivated barcode for ${itemReference}`];
    }
    if (entityType === 'item_category' && String(entry.action || '').toUpperCase() === 'CREATE') {
        return [`Created item category${changes.name ? ` ${changes.name}` : ''}`];
    }
    if (entityType === 'employee' && String(entry.action || '').toUpperCase() === 'CREATE') {
        return [`Created employee${changes.full_name ? ` ${changes.full_name}` : ''}`];
    }
    return [];
};

export const formatAuditEventLabels = (entry = {}) => {
    const changes = parseAuditChanges(entry.changes);
    const eventType = resolveEventType(entry, changes);
    const entityType = String(entry.entity_type || '').trim().toLowerCase();
    const specificSettingLabels = entityType === 'system_setting' ? resolveSettingLabels(changes) : [];
    if (specificSettingLabels.length > 0) return specificSettingLabels;

    const specificCatalogLabels = entityType === 'item_storefront_catalog_override'
        ? resolveCatalogLabels(changes, entry)
        : [];
    if (specificCatalogLabels.length > 0) return specificCatalogLabels;

    const discountLabels = resolveDiscountLabels(entry, eventType, changes);
    if (discountLabels.length > 0) return discountLabels;

    const detailedLabels = resolveDetailedLabels(entry, eventType, changes);
    if (detailedLabels.length > 0) return detailedLabels;

    const entityEventLabel = resolveEntityEventLabel({
        entityType,
        eventType,
        action: entry.action,
        changes
    });
    if (entityEventLabel) return [entityEventLabel];
    if (HUMAN_EVENT_LABELS[eventType]) return [HUMAN_EVENT_LABELS[eventType]];

    if (HUMAN_LEGACY_EVENT_LABELS[eventType]) return [HUMAN_LEGACY_EVENT_LABELS[eventType]];

    const entityLabel = HUMAN_ENTITY_LABELS[entityType];
    const actionLabel = HUMAN_ACTION_LABELS[String(entry.action || '').trim().toUpperCase()];
    if (entityLabel && actionLabel) return [`${actionLabel} ${entityLabel}`];
    if (eventType) return [humanizeToken(eventType)];
    if (entityLabel) return [`${actionLabel || 'Changed'} ${entityLabel}`];
    return ['Audit event details unavailable'];
};

export const formatAuditEventLabel = (entry = {}) => formatAuditEventLabels(entry).join(' · ');

export const formatAuditDateParts = (value) => {
    if (!value) return { date: 'Unknown time', time: '' };
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return { date: String(value), time: '' };
    return {
        date: parsed.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }),
        time: parsed.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit'
        })
    };
};

export const formatAuditDate = (value) => {
    const { date, time } = formatAuditDateParts(value);
    return time ? `${date} · ${time}` : date;
};

const toAuditPayloadToken = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const getAuditPayloadFileName = (entry = {}) => {
    const changes = parseAuditChanges(entry?.changes);
    const source = changes.event
        || changes.event_type
        || entry?.event_type
        || entry?.entity_type
        || changes.entity_type
        || 'audit_event';

    return `${toAuditPayloadToken(source) || 'audit_event'}.json`;
};

export const getAuditActor = (entry) => entry?.actor?.username || entry?.actor?.email || 'System';

export const getAuditContext = (entry) => [
    entry?.terminal_id ? String(entry.terminal_id) : '',
    entry?.shift_id ? `Shift ${entry.shift_id}` : ''
].filter(Boolean);

export const getAuditEventIcon = (entry) => {
    const changes = parseAuditChanges(entry?.changes);
    const eventType = resolveEventType(entry, changes);
    const entityType = String(entry?.entity_type || '').trim().toLowerCase();
    const eventKey = `${eventType} ${entityType}`;
    if (eventKey.includes('logout') || eventKey.includes('signed out')) return LogOut;
    if (eventKey.includes('login') || eventKey.includes('signed in')) return LogIn;
    if (['delivery_job', 'delivery_run', 'delivery_run_remittance', 'delivery_run_remittance_variance'].includes(entityType)) return Truck;
    if (entityType === 'pos_transaction' || entityType === 'pos_parked_sale' || entityType === 'pos_sale_session') return Receipt;
    if (entityType.includes('item') || entityType.includes('catalog') || entityType.includes('barcode')) return Package;
    if (entityType.includes('employee') || entityType.includes('personnel') || entityType.includes('permission') || entityType === 'user_pos_actions') return UsersRound;
    if (entityType.includes('terminal') || entityType.includes('shift') || entityType.includes('setting') || entityType.includes('drawer')) return Settings2;
    if (eventKey.includes('delivery') || eventKey.includes('dispatch') || eventKey.includes('picked_up') || eventKey.includes('delivered')) return Truck;
    if (eventKey.includes('item') || eventKey.includes('catalog') || eventKey.includes('barcode')) return Package;
    if (eventKey.includes('receipt') || eventKey.includes('transaction') || eventKey.includes('sale') || eventKey.includes('discount') || eventKey.includes('payment') || eventKey.includes('refund')) return Receipt;
    if (eventKey.includes('setting') || eventKey.includes('terminal') || eventKey.includes('shift') || eventKey.includes('cash_drawer')) return Settings2;
    return ClipboardCheck;
};

export const getAuditEventTone = (entry) => {
    const label = formatAuditEventLabel(entry).toLowerCase();
    if (label.includes('delivered') || label.includes('completed')) return 'text-emerald-700';
    if (label.includes('failed') || label.includes('rejected') || label.includes('cancelled') || label.includes('voided')) return 'text-rose-700';
    return 'text-[#334155]';
};

const AUDIT_SUMMARY_PRESERVE_TEXT_KEYS = new Set(['actor', 'actor-email', 'item', 'personnel', 'request', 'request-id', 'terminal']);

const getAuditReadableFieldValue = (key, value, displayContext = {}) => {
    if (!hasAuditReadableValue(value)) return '';
    if (typeof value === 'string' && AUDIT_SUMMARY_PRESERVE_TEXT_KEYS.has(key)) return formatAuditPreservedText(value);
    return formatAuditDetailValue(key, value, displayContext.locationNames, displayContext.cashierNames);
};

const getAuditFieldIcon = (key) => {
    const normalized = String(key || '').trim().toLowerCase();
    if (normalized.includes('email')) return Mail;
    if (normalized.includes('request') || normalized.includes('idempotency')) return KeyRound;
    if (normalized.includes('terminal') || normalized.includes('device')) return Monitor;
    if (normalized.includes('order') || normalized.includes('transaction') || normalized.includes('payment') || normalized.includes('amount')) return Receipt;
    if (normalized.includes('delivery') || normalized.includes('dispatch') || normalized.includes('loading') || normalized.includes('status')) return Truck;
    if (normalized.includes('personnel') || normalized.includes('employee') || normalized.includes('user') || normalized.includes('cashier')) return UsersRound;
    if (normalized.includes('shift') || normalized.includes('drawer') || normalized.includes('setting') || normalized.includes('attendance')) return Settings2;
    if (normalized.includes('item') || normalized.includes('catalog') || normalized.includes('barcode')) return Package;
    if (normalized.includes('reason') || normalized.includes('note') || normalized.includes('evidence') || normalized.includes('proof')) return FileText;
    return ClipboardCheck;
};

const normalizeAuditSourceKeys = (keys = []) => Array.from(new Set(
    (Array.isArray(keys) ? keys : [keys])
        .map((key) => String(key || '').trim())
        .filter(Boolean)
));

const getAuditFieldSourceKeys = (field) => Array.isArray(field?.sourceKeys)
    ? field.sourceKeys
    : [field?.detailKey];

const getAuditDetailKeyIdentity = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const aliases = {
        terminal: 'terminal',
        terminalid: 'terminal',
        claimedterminal: 'terminal',
        requestid: 'request',
        actoremail: 'actor',
        email: 'actor',
        deliveryrun: 'deliveryrun',
        deliveryrunid: 'deliveryrun',
        order: 'order',
        orderid: 'order',
        transactionid: 'order',
        postransactionid: 'order',
        orders: 'orders',
        orderids: 'orders',
        postransactionids: 'orders',
        personnel: 'personnel',
        personnelname: 'personnel',
        deliverypersonnel: 'personnel',
        deliverypersonnelname: 'personnel',
        accountabledeliverypersonnel: 'personnel',
        accountabledeliverypersonnelname: 'personnel',
        accountablepersonnel: 'personnel',
        accountablepersonnelid: 'personnel',
        previousdeliverypersonnel: 'personnel',
        previousdeliverypersonnelid: 'personnel',
        status: 'status',
        currentstatus: 'status',
        currentstate: 'status',
        shift: 'shift',
        shiftid: 'shift',
        reason: 'reason',
        reasoncode: 'reason',
        voidreason: 'reason',
        cancelreason: 'reason'
    };
    return aliases[normalized] || normalized;
};

const getAuditReadableLineParts = (line) => {
    const separatorIndex = String(line || '').indexOf(':');
    if (separatorIndex < 0) return null;
    return {
        key: getAuditDetailKeyIdentity(line.slice(0, separatorIndex)),
        value: line.slice(separatorIndex + 1).trim()
    };
};

const normalizeAuditComparable = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const isAuditReadableLineDuplicate = (line, fields) => {
    const parts = getAuditReadableLineParts(line);
    if (!parts) return false;
    return fields.some((field) => getAuditFieldSourceKeys(field)
        .some((sourceKey) => getAuditDetailKeyIdentity(sourceKey) === parts.key));
};

export const getAuditReadableFields = (entry, locations = []) => {
    const changes = parseAuditChanges(entry?.changes);
    const eventType = resolveEventType(entry, changes);
    const entityType = String(entry?.entity_type || '').trim().toLowerCase();
    const displayContext = getAuditDisplayContext(entry, locations);
    const fields = [];
    const addField = (key, label, value, Icon = getAuditFieldIcon(key), detailKey = key, sourceKeys = [key]) => {
        const displayValue = getAuditReadableFieldValue(key, value, displayContext);
        if (!displayValue || displayValue === 'None' || displayValue === '—') return;
        fields.push({
            key,
            label,
            value: displayValue,
            Icon,
            detailKey,
            sourceKeys: normalizeAuditSourceKeys(sourceKeys)
        });
    };

    addField(
        'terminal',
        'Terminal',
        entry?.terminal_id || changes.terminal_id || changes.claimed_terminal_id,
        Monitor,
        'terminal',
        changes.terminal_id ? ['terminal_id'] : (changes.claimed_terminal_id ? ['claimed_terminal_id'] : [])
    );
    addField(
        'request-id',
        'Request ID',
        entry?.request_id || changes.request_id,
        KeyRound,
        'request',
        changes.request_id ? ['request_id'] : []
    );
    addField(
        'actor-email',
        'Actor Email',
        entry?.actor?.email || changes.actor_email || changes.email,
        Mail,
        'actor',
        changes.actor_email ? ['actor_email'] : (changes.email ? ['email'] : [])
    );

    const orderId = changes.pos_transaction_id || changes.transaction_id || changes.order_id || (entityType === 'pos_transaction' ? entry.entity_id : null);
    const orderIds = changes.pos_transaction_ids;
    const orderDisplay = orderId ? `#${orderId}` : null;
    const deliveryRunId = changes.delivery_run_id || (entityType === 'delivery_run' ? entry.entity_id : null);
    const status = changes.previous_status && changes.status && String(changes.previous_status) !== String(changes.status)
        ? `${formatAuditValue(changes.previous_status)} → ${formatAuditValue(changes.status)}`
        : changes.status || changes.current_state || changes.loading_state;

    if (entityType === 'delivery_run') {
        addField('delivery-run', 'Delivery Run', deliveryRunId, Truck, 'deliveryrun', changes.delivery_run_id ? ['delivery_run_id'] : []);
        addField('orders', 'Orders', formatAuditOrderList(orderIds) || orderIds, Receipt, 'orders', ['pos_transaction_ids']);
        const personnelSourceKeys = changes.accountable_delivery_personnel_name
            ? ['accountable_delivery_personnel_name']
            : (changes.delivery_personnel_name
                ? ['delivery_personnel_name']
                : (hasAuditReadableValue(changes.personnel) ? ['personnel'] : []));
        addField(
            'personnel',
            'Personnel',
            formatAuditPersonnelSummary(changes),
            UsersRound,
            'personnel',
            personnelSourceKeys
        );
    } else if (entityType === 'delivery_run_remittance' || entityType === 'delivery_run_remittance_variance') {
        addField('delivery-run', 'Delivery Run', deliveryRunId, Truck, 'deliveryrun', changes.delivery_run_id ? ['delivery_run_id'] : []);
        const remittanceSourceKeys = changes.delivery_run_remittance_id
            ? ['delivery_run_remittance_id']
            : (changes.remittance_id ? ['remittance_id'] : []);
        const varianceValue = entityType === 'delivery_run_remittance_variance'
            ? (changes.total_variance_amount ?? changes.amount ?? entry.entity_id)
            : (changes.total_variance_amount ?? changes.amount);
        const varianceSourceKeys = changes.total_variance_amount !== undefined
            ? ['total_variance_amount']
            : (changes.amount !== undefined ? ['amount'] : []);
        addField(
            'remittance',
            'Remittance',
            entityType === 'delivery_run_remittance' ? (entry.entity_id || changes.delivery_run_remittance_id) : changes.delivery_run_remittance_id,
            Receipt,
            'remittance',
            remittanceSourceKeys
        );
        addField(
            'variance',
            'Variance',
            varianceValue,
            Receipt,
            'variance',
            varianceSourceKeys
        );
        addField(
            'reason',
            'Reason',
            changes.reason || changes.reason_code,
            FileText,
            'reason',
            changes.reason ? ['reason'] : (changes.reason_code ? ['reason_code'] : [])
        );
    } else if (entityType === 'delivery_job' || (
        eventType.startsWith('delivery_')
        && !['pos_transaction', 'pos_parked_sale', 'pos_sale_session'].includes(entityType)
    )) {
        const orderSourceKey = changes.pos_transaction_id !== undefined
            ? ['pos_transaction_id']
            : (changes.transaction_id !== undefined ? ['transaction_id'] : (changes.order_id !== undefined ? ['order_id'] : []));
        addField('order', 'Order', orderDisplay, Receipt, 'order', orderSourceKey);
        addField('delivery-run', 'Delivery Run', deliveryRunId, Truck, 'deliveryrun', changes.delivery_run_id ? ['delivery_run_id'] : []);
        const statusSourceKeys = changes.previous_status !== undefined && changes.status !== undefined
            ? ['previous_status', 'status']
            : (changes.previous_state !== undefined && changes.current_state !== undefined
                ? ['previous_state', 'current_state']
                : (changes.status !== undefined
                    ? ['status']
                    : (changes.current_status !== undefined
                        ? ['current_status']
                        : (changes.current_state !== undefined ? ['current_state'] : (changes.loading_state !== undefined ? ['loading_state'] : [])))));
        addField(
            'status',
            'Status',
            changes.previous_state !== undefined && changes.current_state !== undefined
                ? `${formatAuditValue(changes.previous_state)} → ${formatAuditValue(changes.current_state)}`
                : status,
            Truck,
            'status',
            statusSourceKeys
        );
    } else if (entityType === 'pos_transaction' || entityType === 'pos_parked_sale' || entityType === 'pos_sale_session') {
        const orderSourceKey = changes.pos_transaction_id !== undefined
            ? ['pos_transaction_id']
            : (changes.transaction_id !== undefined ? ['transaction_id'] : (changes.order_id !== undefined ? ['order_id'] : []));
        addField('order', 'Order', orderDisplay, Receipt, 'order', orderSourceKey);
        const paymentSourceKey = changes.payment_status !== undefined
            ? ['payment_status']
            : (changes.payment_method !== undefined ? ['payment_method'] : (changes.payment_type !== undefined ? ['payment_type'] : []));
        addField(
            'payment',
            'Payment',
            changes.payment_status || changes.payment_method || changes.payment_type,
            Receipt,
            'payment',
            paymentSourceKey
        );
        addField('shift', 'Shift', changes.shift_id || entry.shift_id, Settings2, 'shift', changes.shift_id !== undefined ? ['shift_id'] : []);
    } else if (entityType === 'pos_terminal_shift') {
        addField('shift', 'Shift', changes.shift_id || entry.entity_id || entry.shift_id, Settings2, 'shift', changes.shift_id !== undefined ? ['shift_id'] : []);
    } else if (entityType === 'item' || entityType === 'item_catalog_image' || entityType === 'pos_catalog_override') {
        addField('item', 'Item', changes.item_name || changes.item_id || entry.entity_id, Package, 'item', changes.item_name ? ['item_name'] : (changes.item_id !== undefined ? ['item_id'] : []));
    } else if (entityType === 'system_setting') {
        addField('settings', 'Settings', changes.setting_keys, Settings2, 'settings', ['setting_keys']);
    }

    const representedKeys = new Set(fields.flatMap((field) => getAuditFieldSourceKeys(field)
        .map((sourceKey) => getAuditDetailKeyIdentity(sourceKey))));
    Object.entries(changes)
        .filter(([key, value]) => (
            !AUDIT_METADATA_KEY_SET.has(key)
            && !AUDIT_SENSITIVE_KEY_PATTERN.test(key)
            && hasAuditReadableValue(value)
            && !representedKeys.has(getAuditDetailKeyIdentity(key))
        ))
        .slice(0, fields.length === 0 ? 3 : 0)
        .forEach(([key, value]) => addField(key, formatAuditDetailKey(key), value, getAuditFieldIcon(key), key, [key]));

    return fields;
};

const getAuditReasonDisplay = (entry = {}, locations = []) => {
    if (!hasAuditReadableValue(entry?.reason)) return '';
    const { locationNames, cashierNames } = getAuditDisplayContext(entry, locations);
    return formatAuditDetailValue('reason', entry.reason, locationNames, cashierNames);
};

export const getAuditAdditionalLines = (entry = {}, locations = [], readableFields) => {
    const readableLines = formatAuditDetailLines(entry, locations);
    const fields = readableFields || getAuditReadableFields(entry, locations);
    const reason = getAuditReasonDisplay(entry, locations);
    return readableLines.filter((line) => {
        if (isAuditReadableLineDuplicate(line, fields)) return false;
        const parts = getAuditReadableLineParts(line);
        return !(parts
            && parts.key === 'reason'
            && reason
            && normalizeAuditComparable(parts.value) === normalizeAuditComparable(reason));
    });
};

export const getAuditReadableDetailFields = (entry = {}, locations = [], readableFields) => {
    const summaryFields = readableFields || getAuditReadableFields(entry, locations);
    const detailFields = [...summaryFields];
    const reason = getAuditReasonDisplay(entry, locations);
    const hasReasonField = summaryFields.some((field) => getAuditFieldSourceKeys(field)
        .some((sourceKey) => getAuditDetailKeyIdentity(sourceKey) === 'reason'));

    if (reason && !hasReasonField) {
        detailFields.push({
            key: 'entry-reason',
            label: 'Reason',
            value: reason,
            Icon: FileText,
            detailKey: 'reason',
            sourceKeys: []
        });
    }

    getAuditAdditionalLines(entry, locations, summaryFields).forEach((line, index) => {
        const separatorIndex = String(line || '').indexOf(':');
        const label = separatorIndex >= 0 ? String(line).slice(0, separatorIndex).trim() : 'Details';
        const value = separatorIndex >= 0 ? String(line).slice(separatorIndex + 1).trim() : String(line).trim();
        if (!value) return;
        const identity = getAuditDetailKeyIdentity(label) || `detail-${index}`;
        detailFields.push({
            key: `payload-${index}-${identity}`,
            label,
            value,
            Icon: getAuditFieldIcon(label),
            detailKey: identity,
            sourceKeys: []
        });
    });

    return detailFields;
};

const AUDIT_READABLE_DETAIL_GRID_CLASSES = {
    1: 'grid-cols-1 sm:grid-cols-1 lg:grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
};

export const getAuditReadableDetailGridClassName = (fieldCount) => {
    const numericCount = Number(fieldCount);
    const normalizedCount = Number.isFinite(numericCount) ? Math.floor(numericCount) : 1;
    const columnCount = Math.min(4, Math.max(1, normalizedCount));
    return AUDIT_READABLE_DETAIL_GRID_CLASSES[columnCount];
};

const AUDIT_PRESENTATION = Object.freeze({
    formatAuditEventLabel,
    formatAuditDate,
    formatAuditDateParts,
    getAuditActor,
    getAuditContext,
    getAuditEventIcon,
    getAuditEventTone,
    getAuditPayloadFileName,
    getAuditReadableDetailFields,
    getAuditReadableDetailGridClassName,
    parseAuditChanges
});

export default function AuditWorkspacePanel({ locked = false, isOnline = true, canViewAudit = false, locations = [] }) {
    const dateFilterButtonRef = useRef(null);
    const auditScrollRegionRef = useRef(null);
    const workspace = useAuditWorkspace({ locked, isOnline, canViewAudit, auditScrollRegionRef });

    if (!canViewAudit) {
        return (
            <section data-testid="pos-audit-workspace" className="mx-auto w-full max-w-6xl p-3 sm:p-4">
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-800">
                    Audit history is available to tenant admins only.
                </div>
            </section>
        );
    }

    return (
        <section data-testid="pos-audit-workspace" aria-label="POS audit log" className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col p-3 sm:p-4">
            <div ref={auditScrollRegionRef} data-testid="pos-audit-scroll-region" className="dgfy-pos-scrollbar-hidden min-h-0 min-w-0 max-w-full flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y">
                <form className="flex w-full min-w-0 items-center gap-2 min-[768px]:gap-3" onSubmit={workspace.submitSearch}>
                    <PosSearchField
                        ariaLabel="Search audit history"
                        value={workspace.filters.search}
                        onChange={workspace.handleSearchChange}
                        onClear={workspace.clearSearch}
                        placeholder="Search all transaction fields..."
                        className="min-w-0 flex-1"
                        inputClassName="h-10 text-[13px]"
                    />
                    <button
                        type="button"
                        onClick={workspace.loadAudit}
                        disabled={workspace.loading || locked || !isOnline}
                        aria-label="Refresh audit history"
                        title="Refresh audit history"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1A4E8D] px-0 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 min-[768px]:w-auto min-[768px]:px-4"
                    >
                        <RefreshCcw className={`h-4 w-4 ${workspace.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <span className="sr-only min-[768px]:not-sr-only">Refresh</span>
                    </button>
                    <button
                        ref={dateFilterButtonRef}
                        type="button"
                        onClick={() => workspace.setDateFilterOpen(true)}
                        disabled={locked || !isOnline}
                        aria-controls="pos-audit-calendar-dialog"
                        aria-expanded={workspace.dateFilterOpen}
                        aria-pressed={Boolean(workspace.activeDateFilter)}
                        aria-label="Filter audit history by date"
                        title="Filter audit history by date"
                        data-testid="pos-audit-calendar-button"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#A9C5EA] bg-white px-0 text-[13px] font-extrabold text-[#475569] shadow-sm hover:border-[#1A4E8D] hover:bg-[#F5F9FF] hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 min-[768px]:w-auto min-[768px]:px-4"
                    >
                        <CalendarDays className="h-4 w-4 text-[#64748B]" aria-hidden="true" />
                        <span className="sr-only min-[768px]:not-sr-only">Filter by Date</span>
                    </button>
                </form>

                <PosAppliedFilterChips
                    activeFilters={workspace.activeFilters}
                    onRemoveFilter={(filterKey) => {
                        if (filterKey === 'date') workspace.removeDateFilter();
                    }}
                    groupLabel="Applied audit filters"
                    showClearAll={false}
                    fillAvailable
                    className="flex-nowrap py-0"
                />

                {!isOnline ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Reconnect to load the latest audit history.</div> : null}
                {workspace.errorMessage ? <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{workspace.errorMessage}</div> : null}

                <AuditWorkspaceResults
                    logs={workspace.logs}
                    loading={workspace.loading}
                    totalItems={workspace.totalItems}
                    expandedRowKey={workspace.expandedRowKey}
                    locations={locations}
                    copiedLogId={workspace.copiedLogId}
                    onCopy={workspace.copyAuditPayload}
                    onToggle={workspace.toggleAuditRow}
                    presentation={AUDIT_PRESENTATION}
                />
            </div>

            <GlobalPagination
                testId="pos-audit-pagination"
                ariaLabel="POS audit pagination"
                currentPage={workspace.page}
                totalPages={workspace.totalPages}
                totalItems={workspace.totalItems}
                pageSize={workspace.pageSize}
                pageSizeOptions={AUDIT_PAGE_SIZE_OPTIONS}
                itemLabel="entries"
                loading={workspace.loading}
                disabled={locked || !isOnline}
                onPageChange={workspace.setPage}
                onPageSizeChange={(nextPageSize) => {
                    workspace.setPageSize(nextPageSize);
                    workspace.setPage(1);
                }}
                accentColor="#1A4E8D"
                className={POS_PAGINATION_FOOTER_CLASS}
            />

            <AuditDateFilterDialog
                key={workspace.dateFilterOpen ? 'pos-audit-date-open' : 'pos-audit-date-closed'}
                open={workspace.dateFilterOpen}
                onClose={() => workspace.setDateFilterOpen(false)}
                onApply={workspace.applyDateFilter}
                dateRange={{ dateFrom: workspace.appliedFilters.dateFrom, dateTo: workspace.appliedFilters.dateTo }}
                anchorRef={dateFilterButtonRef}
                actionDisabled={locked || !isOnline}
            />
        </section>
    );
}
