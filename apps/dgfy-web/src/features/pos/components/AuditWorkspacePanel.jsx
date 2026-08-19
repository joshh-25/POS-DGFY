import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, RefreshCcw, Search, ShieldAlert } from 'lucide-react';
import { fetchAuditLogs } from '../services/auditService.js';

const HUMAN_EVENT_LABELS = Object.freeze({
    shift_opened: 'Shift opened',
    pos_terminal_shift_opened: 'Shift opened',
    shift_closed: 'Shift closed',
    pos_terminal_shift_closed: 'Shift closed',
    terminal_login: 'Signed in to POS terminal',
    terminal_logout: 'Signed out of POS terminal',
    pos_terminal_shift_location_switched: 'POS location changed',
    pos_terminal_stale_shift_force_closed: 'Stale shift force-closed',
    pos_cash_drawer_event_recorded: 'Cash drawer activity recorded',
    cash_in: 'Cash added to drawer',
    cash_out: 'Cash removed from drawer',
    pos_checkout_completed: 'Sale completed',
    checkout_issued: 'Sale completed',
    pos_parked_sale_created: 'Parked sale created',
    pos_parked_sale_reparked: 'Parked sale saved again',
    pos_parked_sale_resumed: 'Parked sale resumed',
    pos_parked_sale_completed: 'Parked sale completed',
    pos_parked_sale_cancelled: 'Parked sale cancelled',
    pos_transaction_voided: 'Transaction voided',
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
    pos_reset_counter_incremented: 'POS counter reset',
    governed_reset_counter_increment: 'POS counter reset',
    esales_export: 'eSales data exported',
    terminal_registration: 'POS terminal registered',
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
    delivery_job: 'delivery',
    pos_day_close_pin: 'day-close PIN',
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
    'pos_transaction.pickup_cash_collected': 'Pickup payment collected',
    'pos_day_close_pin.self_service_configure': 'Day-close PIN configured',
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

const parseAuditChanges = (changes) => {
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
    return Number.isFinite(amount) ? `PHP ${amount.toFixed(2)}` : formatAuditValue(value);
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

const AUDIT_MONEY_KEY_PATTERN = /(amount|price|fee|cash|subtotal|total|discount|balance|variance|sales|tax)/i;
const AUDIT_RATE_KEY_PATTERN = /(^|_)rate$/i;
const AUDIT_IDENTIFIER_KEY_PATTERN = /(^|_)id$/i;
const AUDIT_CASHIER_ID_PATTERN = /^(origin_|previous_)?cashier_id$/i;
const AUDIT_SENSITIVE_KEY_PATTERN = /(password|passwd|pin|token|secret|authorization|access[_-]?token|refresh[_-]?token)/i;

const formatAuditDetailKey = (key) => AUDIT_DETAIL_KEY_LABELS[key] || humanizeToken(key);

const formatAuditDetailValue = (key, value, locationNames = new Map(), cashierNames = {}) => {
    if (value === null || value === undefined || String(value).trim() === '') return 'None';
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
    if (Array.isArray(value)) return value.map((entry) => formatAuditDetailValue(key, entry)).join(', ');
    if (key === 'park_reference' || key === 'terminal_id') return String(value);
    return humanizeToken(value);
};

export const formatAuditDetailLines = (entry = {}, locations = []) => {
    const changes = parseAuditChanges(entry.changes);
    const cashierNames = entry?.cashier_names && typeof entry.cashier_names === 'object' && !Array.isArray(entry.cashier_names)
        ? entry.cashier_names
        : {};
    const locationNames = new Map(
        (Array.isArray(locations) ? locations : [])
            .map((location) => [Number(location?.location_id), String(location?.name || '').trim()])
            .filter(([locationId, name]) => Number.isInteger(locationId) && locationId > 0 && name)
    );
    return Object.entries(changes)
        .filter(([key, value]) => key !== 'event' && !AUDIT_SENSITIVE_KEY_PATTERN.test(key) && value !== undefined && value !== null)
        .filter(([, value]) => typeof value !== 'object' || Array.isArray(value))
        .map(([key, value]) => `${formatAuditDetailKey(key)}: ${formatAuditDetailValue(key, value, locationNames, cashierNames)}`);
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
    entry.event_type
    || changes.event
    || changes.event_type
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
    if (eventType === 'pos_parked_sale_completed' || eventType === 'completed') return ['Completed parked sale'];
    return [];
};

const resolveTransactionLabels = (entry, eventType, changes) => {
    const orderReference = formatAuditOrderReference(entry, changes);
    if (eventType === 'pickup_cash_collected') {
        const amount = changes.cash_received === undefined ? '' : ` ${formatAuditMoney(changes.cash_received)}`;
        return [`Collected${amount} cash for pickup ${orderReference}`];
    }
    if (eventType === 'pos_transaction_voided' || eventType === 'void') {
        const reason = changes.void_reason || changes.reason || entry.reason;
        return [`Voided ${orderReference}${reason ? ` because ${reason}` : ''}`];
    }
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
    if (entityType === 'delivery_job') return resolveDeliveryLabels(entry, eventType, changes);
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
    if (eventType) return [`Audit event: ${humanizeToken(eventType)}`];
    if (entityLabel) return [`${actionLabel || 'Changed'} ${entityLabel}`];
    return ['Audit event details unavailable'];
};

export const formatAuditEventLabel = (entry = {}) => formatAuditEventLabels(entry).join(' · ');

const formatDate = (value) => {
    if (!value) return 'Unknown time';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
};

const formatDetails = (changes) => {
    if (!changes || typeof changes !== 'object') return '';
    try {
        return JSON.stringify(changes, null, 2);
    } catch {
        return '';
    }
};

export default function AuditWorkspacePanel({ locked = false, isOnline = true, canViewAudit = false, locations = [] }) {
    const [filters, setFilters] = useState({ search: '' });
    const [appliedFilters, setAppliedFilters] = useState(filters);
    const [data, setData] = useState({ logs: [], pagination: { page: 1, limit: 25, total: 0, total_pages: 1 } });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadAudit = useCallback(async () => {
        if (!canViewAudit || locked || !isOnline) return;
        setLoading(true);
        setErrorMessage('');
        try {
            const result = await fetchAuditLogs({
                page,
                limit: 25,
                ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => String(value || '').trim()))
            });
            setData(result);
        } catch (error) {
            setErrorMessage(error?.response?.data?.message || error?.message || 'Unable to load audit history.');
        } finally {
            setLoading(false);
        }
    }, [appliedFilters, canViewAudit, isOnline, locked, page]);

    useEffect(() => {
        loadAudit();
    }, [loadAudit]);

    const pagination = data?.pagination || {};
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    const canGoPrevious = page > 1;
    const canGoNext = page < Number(pagination.total_pages || 1);
    const rangeLabel = useMemo(() => {
        if (!pagination.total) return 'No audit entries';
        const start = ((page - 1) * Number(pagination.limit || 25)) + 1;
        const end = Math.min(Number(pagination.total), page * Number(pagination.limit || 25));
        return `${start}-${end} of ${pagination.total} entries`;
    }, [page, pagination.limit, pagination.total]);

    if (!canViewAudit) {
        return (
            <section data-testid="pos-audit-workspace" className="mx-auto max-w-5xl p-4 sm:p-6">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-semibold text-rose-800">
                    Audit history is available to tenant admins only.
                </div>
            </section>
        );
    }

    return (
        <section data-testid="pos-audit-workspace" aria-label="POS audit log" className="mx-auto max-w-6xl p-4 sm:p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[#0F172A]">
                            <ClipboardCheck className="h-5 w-5 text-[#1A4E8D]" />
                            <h2 className="text-lg font-black">Audit</h2>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">Admin-only record of POS and account activity.</p>
                    </div>
                    <button type="button" onClick={loadAudit} disabled={loading || locked || !isOnline} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>

                <form
                    className="mt-5 flex flex-col gap-3 sm:flex-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setPage(1);
                        setAppliedFilters(filters);
                    }}
                >
                    <label className="relative block">
                        <span className="sr-only">Search audit history</span>
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search all audit events, orders, images, users..." className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs outline-none focus:border-[#1A4E8D]" />
                    </label>
                    <button type="submit" className="h-9 shrink-0 rounded-lg bg-[#1A4E8D] px-4 text-xs font-extrabold text-white hover:bg-[#143F73]">Search</button>
                </form>

                {!isOnline ? <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Reconnect to load the latest audit history.</div> : null}
                {errorMessage ? <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage}</div> : null}
                <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                        <span>{loading ? 'Loading audit history...' : rangeLabel}</span>
                        <span>Newest first</span>
                    </div>
                    {logs.length === 0 && !loading ? <div className="p-8 text-center text-sm text-slate-500">No audit entries match these filters.</div> : null}
                    <div className="divide-y divide-slate-100">
                        {logs.map((entry) => {
                            const readableDetails = formatAuditDetailLines(entry, locations);
                            const detailGroups = groupAuditDetailLines(readableDetails);
                            return (
                            <article key={entry.log_id} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {formatAuditEventLabels(entry).map((label) => (
                                            <span key={label} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-[#1A4E8D]">{label}</span>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">{entry.actor?.username || 'System'}{entry.terminal_id ? ` · ${entry.terminal_id}` : ''}{entry.shift_id ? ` · Shift ${entry.shift_id}` : ''}</p>
                                    {entry.reason ? <p className="mt-1 text-xs text-rose-700">Reason: {entry.reason}</p> : null}
                                    {entry.changes && Object.keys(entry.changes).length > 0 ? (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-[11px] font-bold text-slate-500">View readable details</summary>
                                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                                {detailGroups.length > 0 ? (
                                                    <div className="space-y-3">
                                                        {detailGroups.map((group, groupIndex) => (
                                                            <div key={`audit-detail-group-${groupIndex}`} className={group.right.length > 0 ? 'grid gap-x-6 gap-y-1 sm:grid-cols-2' : undefined}>
                                                                <ul className="space-y-1">
                                                                    {group.left.map((line, lineIndex) => <li key={`audit-detail-${groupIndex}-left-${lineIndex}`}>{line}</li>)}
                                                                </ul>
                                                                {group.right.length > 0 ? (
                                                                    <ul className="space-y-1">
                                                                        {group.right.map((line, lineIndex) => <li key={`audit-detail-${groupIndex}-right-${lineIndex}`}>{line}</li>)}
                                                                    </ul>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <p>No readable details available.</p>}
                                            </div>
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-[10px] font-bold text-slate-400">View technical JSON</summary>
                                                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-4 text-slate-100">{formatDetails(entry.changes)}</pre>
                                            </details>
                                        </details>
                                    ) : null}
                                </div>
                                <time className="text-xs font-semibold text-slate-500 sm:text-right">{formatDate(entry.timestamp)}</time>
                            </article>
                            );
                        })}
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                    <button type="button" disabled={!canGoPrevious || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Previous</button>
                    <span className="text-xs font-bold text-slate-500">Page {page} of {pagination.total_pages || 1}</span>
                    <button type="button" disabled={!canGoNext || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">Next</button>
                </div>
            </div>
        </section>
    );
}
