import crypto from 'crypto';
import fs from 'fs/promises';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import { getAllSettingsUseCase } from '../../settings/index.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../../compliance/index.js';
import dbStore from '../../../utils/dbStore.js';

const VAT_RATE = 0.12;
const INVOICE_COUNTER_KEY = 'POS_OR';
const NON_FISCAL_COUNTER_KEY = 'POS_NFS';
const ORDER_METHODS = ['dine_in', 'takeout', 'pickup', 'delivery'];
const ORDER_METHOD_FEE_KEYS = [...ORDER_METHODS, 'online'];
const ONLINE_ORDER_SOURCE = 'online_store';
const ONLINE_FULFILLMENT_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'ready_for_pickup',
    'out_for_delivery',
    'completed',
    'cancelled',
    'rejected'
];
const ONLINE_FULFILLMENT_TRANSITIONS = Object.freeze({
    placed: ['confirmed', 'rejected'],
    confirmed: ['preparing'],
    preparing: ['ready_for_pickup', 'out_for_delivery'],
    ready_for_pickup: ['completed'],
    out_for_delivery: ['completed'],
    completed: [],
    cancelled: [],
    rejected: []
});
const ORDER_METHOD_FEE_LABELS = {
    dine_in: 'Dine In Fee',
    takeout: 'Takeout Fee',
    pickup: 'Pickup Fee',
    delivery: 'Delivery Fee',
    online: 'Online Fee'
};
const createDefaultOrderMethodFeeMatrix = () => ORDER_METHOD_FEE_KEYS.reduce((acc, method) => {
    acc[method] = {
        enabled: false,
        amount: 0,
        label: ORDER_METHOD_FEE_LABELS[method]
    };
    return acc;
}, {});
const CASH_EVENT_EFFECT = Object.freeze({
    cash_in: 1,
    opening_adjustment: 1,
    cash_out: -1,
    closing_adjustment: -1
});
const PERMISSION_PRICE_OVERRIDE = 'pos:price_override';
const PERMISSION_EDIT_POS_CATALOG = 'items:edit';

const getTenantComplianceSnapshot = () => {
    const store = dbStore.getStore() || {};
    const tenantId = store.tenantId;
    if (!tenantId || tenantId === 'default') return null;

    return {
        id: tenantId,
        compliance_mode_state: store.tenantComplianceModeState || null,
        compliance_mode_choice_required: store.tenantComplianceModeChoiceRequired === true,
        compliance_profile: store.tenantComplianceProfile || null,
        compliance_policy_version: store.tenantCompliancePolicyVersion || null
    };
};

const assertPosComplianceAllowed = async ({ operation, context = {}, settings = {}, user = null }) => {
    const tenant = getTenantComplianceSnapshot();
    if (!tenant?.id) {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'Tenant compliance context is required',
            { statusCode: 400 }
        );
    }

    const hasSettings = settings && typeof settings === 'object' && Object.keys(settings).length > 0;
    const result = await assertComplianceOperationAllowed({
        tenantId: tenant.id,
        tenant,
        operation,
        context: hasSettings ? { ...context, settings } : { ...context },
        actorUser: user
    });

    if (!result.success) {
        throw result.error;
    }

    return result.data.decision;
};

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    if (!Number.isInteger(normalized) || normalized <= 0) return null;
    return normalized;
};

const nowInManilaBusinessDate = () => (
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date())
);

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stableStringify = (value) => {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const hashPayload = (payload) => crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const buildBusinessDateRange = (dateInput) => {
    const dateString = dateInput instanceof Date
        ? dateInput.toISOString().slice(0, 10)
        : String(dateInput).slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'business date must be in YYYY-MM-DD format',
            { statusCode: 400 }
        );
    }

    const startAt = new Date(`${dateString}T00:00:00+08:00`);
    const endAt = new Date(startAt.getTime() + (24 * 60 * 60 * 1000));

    return {
        businessDate: dateString,
        startAt,
        endAt
    };
};

const toSerializable = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const parseBooleanSetting = (value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
    }
    return false;
};

const parseUserPermissions = (user) => {
    if (!user) return [];
    if (Array.isArray(user.permissions)) return user.permissions;
    if (typeof user.permissions === 'string') {
        try {
            const parsed = JSON.parse(user.permissions);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const hasPermission = (user, permission) => {
    if (!user) return false;
    if (user.is_master_admin) return true;
    return parseUserPermissions(user).includes(permission);
};

const normalizeOnlineFulfillmentStatus = (value) => {
    const status = String(value || '').trim();
    return ONLINE_FULFILLMENT_STATUSES.includes(status) ? status : null;
};

const validateOnlineOrderTransition = ({ currentStatus, nextStatus, orderMethod }) => {
    if (currentStatus === nextStatus) {
        return;
    }

    const allowedStatuses = ONLINE_FULFILLMENT_TRANSITIONS[currentStatus] || [];
    if (!allowedStatuses.includes(nextStatus)) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Invalid fulfillment transition: ${currentStatus} -> ${nextStatus}`,
            { statusCode: 409 }
        );
    }

    if (nextStatus === 'out_for_delivery' && orderMethod !== 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Only delivery orders can transition to out_for_delivery',
            { statusCode: 409 }
        );
    }

    if (nextStatus === 'ready_for_pickup' && orderMethod === 'delivery') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Delivery orders must transition to out_for_delivery instead of ready_for_pickup',
            { statusCode: 409 }
        );
    }
};

const buildOnlineOrderStockMovements = (order = {}) => {
    const orderId = parsePositiveInt(order?.pos_transaction_id);
    if (!orderId) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Online order is missing a valid transaction identifier',
            { statusCode: 409 }
        );
    }

    const lines = Array.isArray(order?.lines) ? order.lines : [];
    if (lines.length === 0) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Online order is missing checkout lines for inventory deduction',
            { statusCode: 409 }
        );
    }

    return lines.map((line, index) => {
        const itemId = parsePositiveInt(line?.item_id);
        const quantity = Number(line?.quantity);
        if (!itemId || !Number.isFinite(quantity) || quantity <= 0) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                `Online order line ${index + 1} has invalid inventory movement data`,
                { statusCode: 409 }
            );
        }

        const lineReference = parsePositiveInt(line?.line_id) || `${itemId}-${index + 1}`;
        return {
            item_id: itemId,
            quantity,
            movement_type: 'goods_issue',
            reference_type: 'POS',
            reference_id: `ONLINE:${orderId}:${lineReference}`,
            notes: `Online order completion ${order.invoice_number || `#${orderId}`}${order.tracking_pin ? ` (${order.tracking_pin})` : ''}`
        };
    });
};

const getPosSettings = async () => unwrapApplicationResultOrThrow(
    await getAllSettingsUseCase(),
    'Failed to retrieve POS setup settings'
);

const enforcePosComplianceReadiness = (settings = {}) => {
    // Legacy strict toggle is retired. Dual-mode compliance policy is now the
    // single source of truth for fiscal and non-fiscal runtime enforcement.
    void settings;
};

const parseDiscountProfiles = (settings = {}) => {
    let profiles = settings?.pos_discount_profiles?.value;
    if (typeof profiles === 'string') {
        try {
            profiles = JSON.parse(profiles);
        } catch {
            profiles = [];
        }
    }
    if (!Array.isArray(profiles)) return [];
    return profiles
        .map((profile) => ({
            name: String(profile?.name || '').trim(),
            percentage: round4(Number(profile?.percentage || 0)),
            active: profile?.active !== false
        }))
        .filter((profile) => profile.active && profile.name.length > 0);
};

const parseOrderMethodFees = (settings = {}) => {
    const raw = settings?.pos_order_method_fees?.value;
    let parsed = raw;

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = null;
        }
    }

    if (!isPlainObject(parsed)) {
        return createDefaultOrderMethodFeeMatrix();
    }

    const normalized = createDefaultOrderMethodFeeMatrix();
    for (const method of ORDER_METHOD_FEE_KEYS) {
        const entry = parsed?.[method];
        if (!isPlainObject(entry)) {
            continue;
        }

        const amount = Number(entry.amount);
        normalized[method] = {
            enabled: parseBooleanSetting(entry.enabled),
            amount: Number.isFinite(amount) ? Math.max(0, round4(amount)) : 0,
            label: String(entry.label || '').trim() || ORDER_METHOD_FEE_LABELS[method]
        };
    }

    return normalized;
};

const resolveCheckoutServiceFee = ({ payload, settings }) => {
    const orderMethod = ORDER_METHODS.includes(payload?.order_method)
        ? payload.order_method
        : 'dine_in';
    const feeMatrix = parseOrderMethodFees(settings);
    const methodFee = feeMatrix[orderMethod] || createDefaultOrderMethodFeeMatrix()[orderMethod];
    const hasOverride = payload?.service_fee_amount !== undefined && payload?.service_fee_amount !== null;
    const overrideAmount = hasOverride ? Number(payload.service_fee_amount) : null;

    if (hasOverride && (!Number.isFinite(overrideAmount) || overrideAmount < 0)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'service_fee_amount must be a non-negative number',
            { statusCode: 422 }
        );
    }

    if (hasOverride && !methodFee.enabled && overrideAmount > 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Service fee override is not allowed for order method: ${orderMethod}`,
            { statusCode: 422 }
        );
    }

    let serviceFeeAmount = methodFee.enabled ? round4(methodFee.amount) : 0;
    if (hasOverride) {
        serviceFeeAmount = round4(overrideAmount);
    }

    if (serviceFeeAmount <= 0) {
        return {
            serviceFeeAmount: 0,
            serviceFeeLabelSnapshot: null,
            serviceFeeMethodSnapshot: null,
            serviceFeeOverridden: false
        };
    }

    return {
        serviceFeeAmount,
        serviceFeeLabelSnapshot: methodFee.label || ORDER_METHOD_FEE_LABELS[orderMethod],
        serviceFeeMethodSnapshot: orderMethod,
        serviceFeeOverridden: Boolean(hasOverride)
    };
};

const resolveCheckoutDiscount = ({ payload, subtotalAmount, settings }) => {
    const profileName = String(payload?.discount_profile_name || '').trim();
    const requestedDiscount = round4(payload?.discount_amount || 0);

    if (!profileName) {
        if (requestedDiscount > 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Non-zero discount requires a configured discount profile.',
                { statusCode: 422 }
            );
        }
        return {
            discountAmount: 0,
            discountLabelSnapshot: null,
            discountRateSnapshot: null
        };
    }

    const profiles = parseDiscountProfiles(settings);
    const selected = profiles.find((profile) => profile.name.toLowerCase() === profileName.toLowerCase());
    if (!selected) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            `Unknown or inactive discount profile: ${profileName}`,
            { statusCode: 422 }
        );
    }

    const requestedRate = payload?.discount_rate;
    if (requestedRate != null) {
        const normalizedRate = round4(requestedRate);
        const expectedRate = round4(selected.percentage);
        if (Math.abs(normalizedRate - expectedRate) > 0.0001) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `Discount rate mismatch for profile: ${selected.name}`,
                { statusCode: 422 }
            );
        }
    }

    return {
        discountAmount: Math.min(round4(subtotalAmount * (selected.percentage / 100)), subtotalAmount),
        discountLabelSnapshot: selected.name,
        discountRateSnapshot: round4(selected.percentage)
    };
};

export const buildCheckoutPosUseCase = ({ posRepository, stockMovementService }) => {
    return async ({ payload, userId, user }) => {
        const normalizedUserId = parsePositiveInt(userId);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'userId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const lines = Array.isArray(payload.lines) ? payload.lines : [];
        if (lines.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one checkout line is required',
                { statusCode: 400 }
            ));
        }

        const idempotencyKey = payload.idempotency_key;
        if (!idempotencyKey || typeof idempotencyKey !== 'string') {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required',
                { statusCode: 400 }
            ));
        }
        const normalizedOrderMethod = String(payload.order_method || 'dine_in').trim();
        if (!ORDER_METHODS.includes(normalizedOrderMethod)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `order_method must be one of: ${ORDER_METHODS.join(', ')}`,
                { statusCode: 422 }
            ));
        }

        const normalizedRequestPayload = {
            terminal_id: payload.terminal_id || null,
            order_method: normalizedOrderMethod,
            payment_type: payload.payment_type || 'cash',
            service_fee_amount: payload.service_fee_amount == null ? null : round4(payload.service_fee_amount),
            discount_profile_name: String(payload.discount_profile_name || '').trim() || null,
            discount_rate: payload.discount_rate == null ? null : round4(payload.discount_rate),
            discount_amount: round4(payload.discount_amount || 0),
            lines: lines
                .map((line) => ({
                    item_id: Number.parseInt(line.item_id, 10),
                    quantity: round4(line.quantity),
                    sale_price: line.sale_price == null ? null : round4(line.sale_price),
                    price_override_reason: String(line.price_override_reason || '').trim() || null
                }))
                .sort((a, b) => a.item_id - b.item_id)
        };
        const requestHash = hashPayload(normalizedRequestPayload);

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const settings = await getPosSettings();
            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
                context: {
                    terminal_id: payload.terminal_id || null
                },
                settings,
                user
            });
            enforcePosComplianceReadiness(settings);
            const receiptContract = complianceDecision?.receipt_contract || {
                document_type: 'non_fiscal_slip',
                label: 'NON-FISCAL SLIP'
            };

            const existing = await posRepository.findTransactionByIdempotencyKey(
                idempotencyKey,
                { transaction, lock: true }
            );

            if (existing) {
                if (existing.request_hash !== requestHash) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'idempotency_key was already used with a different payload',
                        { statusCode: 409 }
                    );
                }

                await transaction.commit();
                return ok({
                    idempotent_replay: true,
                    compliance_decision: complianceDecision,
                    receipt_contract: receiptContract,
                    transaction: toSerializable(existing)
                });
            }

            const itemIds = [...new Set(lines.map((line) => Number.parseInt(line.item_id, 10)))];
            const items = await posRepository.findSellableItemsByIds(itemIds, { transaction, lock: true });
            const itemMap = new Map(items.map((item) => [item.item_id, item]));

            const normalizedShiftId = parsePositiveInt(payload.shift_id);
            if (payload.shift_id != null) {
                if (!normalizedShiftId) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'shift_id must be a positive integer when provided',
                        { statusCode: 422 }
                    );
                }
                const shift = await posRepository.getTerminalShiftById(normalizedShiftId, { transaction, lock: true });
                if (!shift || shift.status !== 'open') {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Selected terminal shift is not open or no longer available.',
                        { statusCode: 422 }
                    );
                }
                if (Number(shift.cashier_id) !== normalizedUserId) {
                    throw new DomainError(
                        DomainErrorCode.AUTHORIZATION_FAILED,
                        'Shift does not belong to the authenticated cashier.',
                        { statusCode: 403 }
                    );
                }
                if (payload.terminal_id && String(shift.terminal_id) !== String(payload.terminal_id)) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        'Shift terminal_id does not match checkout terminal_id.',
                        { statusCode: 422 }
                    );
                }
            }

            if (itemMap.size !== itemIds.length) {
                const missingIds = itemIds.filter((itemId) => !itemMap.has(itemId));
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Some POS-visible active items were not found: ${missingIds.join(', ')}`,
                    {
                        statusCode: 404,
                        details: { missing_item_ids: missingIds }
                    }
                );
            }

            let subtotalAmount = 0;
            const preparedLines = [];

            for (const line of lines) {
                const itemId = Number.parseInt(line.item_id, 10);
                const quantity = Number(line.quantity);
                const item = itemMap.get(itemId);

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid quantity for item ${itemId}`,
                        { statusCode: 400 }
                    );
                }

                const currentStock = Number(item.current_stock) || 0;
                if (currentStock + 0.000001 < quantity) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Insufficient stock for "${item.name}". Available: ${currentStock}, requested: ${quantity}`,
                        { statusCode: 400 }
                    );
                }

                const resolvedPrice = line.sale_price == null
                    ? (
                        item.default_sale_price != null
                            ? Number(item.default_sale_price)
                            : Number(item.cost_per_unit || 0)
                    )
                    : Number(line.sale_price);
                const defaultSalePrice = item.default_sale_price != null
                    ? Number(item.default_sale_price)
                    : Number(item.cost_per_unit || 0);

                if (!Number.isFinite(resolvedPrice) || resolvedPrice < 0) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Invalid sale price for item ${item.item_id}`,
                        { statusCode: 400 }
                    );
                }

                const salePriceOverridden = line.sale_price != null
                    && Math.abs(round4(resolvedPrice) - round4(defaultSalePrice)) > 0.0001;
                const priceOverrideReason = String(line.price_override_reason || '').trim();
                if (salePriceOverridden) {
                    if (!hasPermission(user, PERMISSION_PRICE_OVERRIDE)) {
                        throw new DomainError(
                            DomainErrorCode.AUTHORIZATION_FAILED,
                            'You do not have permission to override line-item sale prices.',
                            { statusCode: 403 }
                        );
                    }
                    if (priceOverrideReason.length < 3) {
                        throw new DomainError(
                            DomainErrorCode.VALIDATION_FAILED,
                            `Price override reason is required for item ${item.item_id}`,
                            { statusCode: 422 }
                        );
                    }
                }

                const lineSubtotal = round4(quantity * resolvedPrice);
                subtotalAmount += lineSubtotal;

                preparedLines.push({
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: round4(quantity),
                    unit_of_measure: item.unit_of_measure,
                    cost_snapshot: item.cost_per_unit != null ? round4(item.cost_per_unit) : null,
                    sale_price: round4(resolvedPrice),
                    sale_price_overridden: salePriceOverridden,
                    price_override_reason: salePriceOverridden ? priceOverrideReason : null,
                    line_subtotal: lineSubtotal,
                    vat_type_snapshot: item.vat_type || 'vatable',
                    vat_rate_snapshot: VAT_RATE
                });
            }

            subtotalAmount = round4(subtotalAmount);
            const discountResolution = resolveCheckoutDiscount({ payload, subtotalAmount, settings });
            const discountAmount = round4(discountResolution.discountAmount);
            const netItemsTotal = round4(subtotalAmount - discountAmount);
            const serviceFeeResolution = resolveCheckoutServiceFee({
                payload: { ...payload, order_method: normalizedOrderMethod },
                settings
            });
            const serviceFeeAmount = round4(serviceFeeResolution.serviceFeeAmount);
            const totalAmount = round4(netItemsTotal + serviceFeeAmount);
            const adjustmentFactor = subtotalAmount > 0 ? (netItemsTotal / subtotalAmount) : 1;

            for (const line of preparedLines) {
                line.line_subtotal = round4(line.line_subtotal * adjustmentFactor);
            }

            const adjustedSubtotal = round4(
                preparedLines.reduce((sum, line) => sum + line.line_subtotal, 0)
            );
            const lineDiff = round4(netItemsTotal - adjustedSubtotal);
            if (preparedLines.length > 0 && Math.abs(lineDiff) > 0) {
                const lastLine = preparedLines[preparedLines.length - 1];
                lastLine.line_subtotal = round4(lastLine.line_subtotal + lineDiff);
            }

            let vatableGross = 0;
            let vatExemptSales = 0;
            let zeroRatedSales = 0;

            for (const line of preparedLines) {
                if (line.vat_type_snapshot === 'vatable') {
                    vatableGross += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'vat_exempt') {
                    vatExemptSales += line.line_subtotal;
                } else if (line.vat_type_snapshot === 'zero_rated') {
                    zeroRatedSales += line.line_subtotal;
                }
            }

            vatableGross = round4(vatableGross);
            vatExemptSales = round4(vatExemptSales);
            zeroRatedSales = round4(zeroRatedSales);

            const vatableSales = round4(vatableGross / (1 + VAT_RATE));
            const vatAmount = round4(vatableGross - vatableSales);

            const invoiceCounterKey = receiptContract.document_type === 'fiscal_invoice'
                ? INVOICE_COUNTER_KEY
                : NON_FISCAL_COUNTER_KEY;
            const invoicePrefix = receiptContract.document_type === 'fiscal_invoice'
                ? 'INV'
                : 'NFS';
            const invoiceNumber = await posRepository.nextInvoiceNumber(
                invoiceCounterKey,
                { transaction, prefix: invoicePrefix }
            );

            const posTransactionId = await posRepository.createTransactionWithLines({
                header: {
                    invoice_number: invoiceNumber,
                    document_type: receiptContract.document_type === 'fiscal_invoice' ? 'fiscal_invoice' : 'non_fiscal_slip',
                    idempotency_key: idempotencyKey,
                    request_hash: requestHash,
                    cashier_id: normalizedUserId,
                    shift_id: normalizedShiftId || null,
                    terminal_id: payload.terminal_id || null,
                    order_source: 'in_store',
                    order_method: normalizedOrderMethod,
                    fulfillment_status: 'completed',
                    payment_type: payload.payment_type || 'cash',
                    subtotal_amount: subtotalAmount,
                    vatable_sales: vatableSales,
                    vat_amount: vatAmount,
                    vat_exempt_sales: vatExemptSales,
                    zero_rated_sales: zeroRatedSales,
                    discount_amount: discountAmount,
                    discount_label_snapshot: discountResolution.discountLabelSnapshot,
                    discount_rate_snapshot: discountResolution.discountRateSnapshot,
                    service_fee_amount: serviceFeeAmount,
                    service_fee_label_snapshot: serviceFeeResolution.serviceFeeLabelSnapshot,
                    service_fee_method_snapshot: serviceFeeResolution.serviceFeeMethodSnapshot,
                    service_fee_overridden: serviceFeeResolution.serviceFeeOverridden,
                    total_amount: totalAmount,
                    delivery_fee: 0,
                    status: 'completed'
                },
                lines: preparedLines
            }, { transaction });

            for (const line of preparedLines) {
                await stockMovementService.createStockMovement({
                    item_id: line.item_id,
                    quantity: Number(line.quantity),
                    movement_type: 'goods_issue',
                    reference_type: 'POS',
                    reference_id: String(posTransactionId),
                    notes: `POS checkout ${invoiceNumber}`
                }, normalizedUserId, transaction);
            }

            const created = await posRepository.getTransactionById(
                posTransactionId,
                { transaction }
            );

            await transaction.commit();
            return ok({
                idempotent_replay: false,
                compliance_decision: complianceDecision,
                receipt_contract: receiptContract,
                transaction: toSerializable(created)
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to complete POS checkout'));
        }
    };
};

export const buildListPosTransactionsUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listTransactions(query || {});
            return ok(data);
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list POS transactions'));
        }
    };
};

export const buildGetPosTransactionByIdUseCase = ({ posRepository }) => {
    return async ({ posTransactionId }) => {
        const normalizedId = parsePositiveInt(posTransactionId);
        if (!normalizedId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.getTransactionById(normalizedId);
            if (!data) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'POS transaction not found',
                    { statusCode: 404 }
                ));
            }
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS transaction'));
        }
    };
};

export const buildCloseDayZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                businessDateInput || new Date()
            );
            const summary = await posRepository.getZReadingSummary({ startAt, endAt });
            return ok({
                business_date: businessDate,
                generated_at: new Date().toISOString(),
                summary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to generate daily Z-reading'));
        }
    };
};

export const buildGetDailyZReadingUseCase = ({ posRepository }) => {
    return async ({ businessDateInput }) => {
        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(businessDateInput);
            const summary = await posRepository.getZReadingSummary({ startAt, endAt });
            return ok({
                business_date: businessDate,
                generated_at: new Date().toISOString(),
                summary
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve daily Z-reading'));
        }
    };
};

export const buildListPosCatalogUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listCatalog({
                search: query?.search || '',
                limit: query?.limit || 100,
                folder_id: query?.folder_id
            });
            const filtered = (Array.isArray(data) ? data : []).filter((item) => (
                item?.pos_visible !== false
            ));
            return ok(filtered.map((item) => toSerializable(item)));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS catalog'));
        }
    };
};

export const buildListPosCatalogOverridesUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            const data = await posRepository.listCatalogOverrides({
                search: query?.search || '',
                limit: query?.limit || 200
            });
            return ok(data.map((item) => toSerializable(item)));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve POS catalog overrides'));
        }
    };
};

export const buildUpdatePosCatalogOverrideUseCase = ({ posRepository }) => {
    return async ({ itemId, payload, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to modify POS catalog overrides.',
                    { statusCode: 403 }
                );
            }

            const item = await posRepository.getItemById(normalizedItemId);
            if (!item) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Item ${normalizedItemId} was not found`,
                    { statusCode: 404 }
                );
            }

            const data = await posRepository.upsertCatalogOverride(normalizedItemId, {
                pos_visible: payload.pos_visible
            });
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to update POS catalog override'));
        }
    };
};

export const buildUploadPosCatalogImageUseCase = ({ posRepository, imageStorage }) => {
    return async ({ itemId, file, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        if (!file) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'image file is required',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to upload POS catalog images.',
                    { statusCode: 403 }
                );
            }

            const item = await posRepository.getItemById(normalizedItemId);
            if (!item) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `Item ${normalizedItemId} was not found`,
                    { statusCode: 404 }
                );
            }

            const existing = await posRepository.findCatalogOverrideByItemId(normalizedItemId);
            if (existing?.pos_image_path) {
                await imageStorage.remove({ path: existing.pos_image_path });
            }

            const stored = await imageStorage.store({
                itemId: normalizedItemId,
                originalName: file.originalname,
                tempPath: file.path
            });

            const data = await posRepository.updateCatalogImage(normalizedItemId, {
                path: stored.path,
                url: stored.url
            });

            return ok(toSerializable(data));
        } catch (error) {
            if (file?.path) {
                try {
                    await fs.unlink(file.path);
                } catch {
                    // ignore cleanup errors for temp uploads
                }
            }
            return fail(mapPosUseCaseError(error, 'Failed to upload POS catalog image'));
        }
    };
};

export const buildDeletePosCatalogImageUseCase = ({ posRepository, imageStorage }) => {
    return async ({ itemId, user }) => {
        const normalizedItemId = parsePositiveInt(itemId);
        if (!normalizedItemId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'itemId must be a positive integer',
                { statusCode: 400 }
            ));
        }

        try {
            if (!hasPermission(user, PERMISSION_EDIT_POS_CATALOG)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'You do not have permission to delete POS catalog images.',
                    { statusCode: 403 }
                );
            }

            const existing = await posRepository.findCatalogOverrideByItemId(normalizedItemId);
            if (existing?.pos_image_path) {
                await imageStorage.remove({ path: existing.pos_image_path });
            }

            const data = await posRepository.clearCatalogImage(normalizedItemId);
            return ok(toSerializable(data));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to delete POS catalog image'));
        }
    };
};

const summarizeCashEvents = (events = []) => {
    const summary = {
        cash_in_total: 0,
        cash_out_total: 0,
        opening_adjustment_total: 0,
        closing_adjustment_total: 0,
        net_events_total: 0
    };

    for (const event of events) {
        const eventType = String(event.event_type || '').trim();
        const amount = round4(Number(event.amount || 0));
        if (!CASH_EVENT_EFFECT[eventType]) continue;
        const key = `${eventType}_total`;
        if (Object.prototype.hasOwnProperty.call(summary, key)) {
            summary[key] = round4(summary[key] + amount);
        }
        summary.net_events_total = round4(summary.net_events_total + (amount * CASH_EVENT_EFFECT[eventType]));
    }

    return summary;
};

const buildShiftCashSummary = ({ shift, cashSalesAmount }) => {
    if (!shift) return null;
    const events = Array.isArray(shift.cashEvents) ? shift.cashEvents : [];
    const eventSummary = summarizeCashEvents(events);
    const openingFloat = round4(shift.opening_float_amount || 0);
    const expectedCashAmount = round4(openingFloat + eventSummary.net_events_total + round4(cashSalesAmount || 0));
    return {
        pos_terminal_shift_id: shift.pos_terminal_shift_id,
        business_date: shift.business_date,
        terminal_id: shift.terminal_id,
        cashier_id: shift.cashier_id,
        status: shift.status,
        opened_at: shift.opened_at,
        closed_at: shift.closed_at,
        opening_float_amount: openingFloat,
        closing_cash_amount: shift.closing_cash_amount != null ? round4(shift.closing_cash_amount) : null,
        expected_cash_amount: shift.expected_cash_amount != null ? round4(shift.expected_cash_amount) : expectedCashAmount,
        cash_variance_amount: shift.cash_variance_amount != null ? round4(shift.cash_variance_amount) : null,
        cash_sales_amount: round4(cashSalesAmount || 0),
        ...eventSummary
    };
};

export const buildOpenTerminalShiftUseCase = ({ posRepository }) => {
    return async ({ payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to open a terminal shift',
                { statusCode: 401 }
            ));
        }

        const terminalId = String(payload?.terminal_id || 'WEB-POS-01').trim() || 'WEB-POS-01';
        const businessDate = payload?.business_date
            ? String(payload.business_date).slice(0, 10)
            : nowInManilaBusinessDate();
        const openingFloatAmount = round4(Number(payload?.opening_float_amount || 0));
        const openingNote = String(payload?.opening_note || '').trim() || null;

        if (!Number.isFinite(openingFloatAmount) || openingFloatAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'opening_float_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }

        try {
            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: terminalId,
                    terminal_action: 'open_shift'
                },
                user
            });

            const existing = await posRepository.findOpenTerminalShift({
                terminalId,
                cashierId: normalizedUserId
            });
            if (existing) {
                return ok({
                    reused_existing: true,
                    compliance_decision: complianceDecision,
                    shift: toSerializable(existing)
                });
            }

            const created = await posRepository.createTerminalShift({
                business_date: businessDate,
                terminal_id: terminalId,
                cashier_id: normalizedUserId,
                opening_float_amount: openingFloatAmount,
                opening_note: openingNote,
                opened_at: new Date(),
                status: 'open'
            });

            return ok({
                reused_existing: false,
                compliance_decision: complianceDecision,
                shift: toSerializable(created)
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to open terminal shift'));
        }
    };
};

export const buildGetCurrentTerminalShiftUseCase = ({ posRepository }) => {
    return async ({ query, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view current terminal shift',
                { statusCode: 401 }
            ));
        }

        try {
            const shift = await posRepository.findOpenTerminalShift({
                terminalId: String(query?.terminal_id || '').trim() || null,
                cashierId: normalizedUserId
            });

            if (!shift) {
                return ok({ shift: null, cash_summary: null });
            }

            const cashSales = await posRepository.getShiftCashSalesTotal(shift.pos_terminal_shift_id);
            return ok({
                shift: toSerializable(shift),
                cash_summary: buildShiftCashSummary({ shift: toSerializable(shift), cashSalesAmount: cashSales })
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to load current terminal shift'));
        }
    };
};

export const buildRecordCashDrawerEventUseCase = ({ posRepository }) => {
    return async ({ shiftId, payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }

        const eventType = String(payload?.event_type || '').trim();
        const amount = round4(Number(payload?.amount || 0));
        const reason = String(payload?.reason || '').trim();

        if (!CASH_EVENT_EFFECT[eventType]) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Unsupported cash drawer event type',
                { statusCode: 422 }
            ));
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'amount must be greater than zero',
                { statusCode: 422 }
            ));
        }
        if (reason.length < 3) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'reason is required and must be at least 3 characters',
                { statusCode: 422 }
            ));
        }

        try {
            const shift = await posRepository.getTerminalShiftById(normalizedShiftId);
            if (!shift || shift.status !== 'open') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Cash drawer events can only be recorded for open shifts',
                    { statusCode: 422 }
                ));
            }

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'cash_drawer_event'
                },
                user
            });

            const created = await posRepository.createCashDrawerEvent({
                pos_terminal_shift_id: normalizedShiftId,
                event_type: eventType,
                amount,
                reason,
                recorded_by: normalizedUserId
            });

            return ok({
                ...toSerializable(created),
                compliance_decision: complianceDecision
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to record cash drawer event'));
        }
    };
};

export const buildCloseTerminalShiftUseCase = ({ posRepository }) => {
    return async ({ shiftId, payload, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        const normalizedShiftId = parsePositiveInt(shiftId);
        if (!normalizedUserId || !normalizedShiftId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Valid shiftId and authenticated user are required',
                { statusCode: 400 }
            ));
        }

        const closingCashAmount = round4(Number(payload?.closing_cash_amount || 0));
        const closingNote = String(payload?.closing_note || '').trim() || null;
        if (!Number.isFinite(closingCashAmount) || closingCashAmount < 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'closing_cash_amount must be a non-negative number',
                { statusCode: 422 }
            ));
        }

        try {
            const shift = await posRepository.getTerminalShiftById(normalizedShiftId);
            if (!shift || shift.status !== 'open') {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Only open shifts can be closed',
                    { statusCode: 422 }
                ));
            }

            const complianceDecision = await assertPosComplianceAllowed({
                operation: COMPLIANCE_OPERATION.POS_TERMINAL_OPERATION,
                context: {
                    terminal_id: shift.terminal_id || null,
                    terminal_action: 'close_shift'
                },
                user
            });

            const shiftPayload = toSerializable(shift);
            const cashSales = await posRepository.getShiftCashSalesTotal(normalizedShiftId);
            const cashEvents = await posRepository.listCashDrawerEventsByShiftId(normalizedShiftId);
            const tempShift = { ...shiftPayload, cashEvents };
            const summary = buildShiftCashSummary({ shift: tempShift, cashSalesAmount: cashSales });
            const expectedCashAmount = round4(summary.expected_cash_amount || 0);
            const variance = round4(closingCashAmount - expectedCashAmount);

            const closed = await posRepository.closeTerminalShift(normalizedShiftId, {
                closing_cash_amount: closingCashAmount,
                expected_cash_amount: expectedCashAmount,
                cash_variance_amount: variance,
                closing_note: closingNote,
                closed_at: new Date(),
                closed_by: normalizedUserId,
                status: 'closed'
            });

            return ok({
                compliance_decision: complianceDecision,
                shift: toSerializable(closed),
                cash_summary: {
                    ...summary,
                    closing_cash_amount: closingCashAmount,
                    expected_cash_amount: expectedCashAmount,
                    cash_variance_amount: variance
                }
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to close terminal shift'));
        }
    };
};

export const buildGetTerminalTodayDashboardUseCase = ({ posRepository }) => {
    return async ({ query, user }) => {
        const normalizedUserId = parsePositiveInt(user?.user_id);
        if (!normalizedUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated user is required to view terminal dashboard',
                { statusCode: 401 }
            ));
        }

        try {
            const { businessDate, startAt, endAt } = buildBusinessDateRange(
                query?.business_date || nowInManilaBusinessDate()
            );
            const terminalId = String(query?.terminal_id || '').trim() || null;

            const salesSummary = await posRepository.getZReadingSummary({
                startAt,
                endAt,
                terminalId
            });
            const openShift = await posRepository.findOpenTerminalShift({
                terminalId,
                cashierId: normalizedUserId
            });
            const shiftPayload = openShift ? toSerializable(openShift) : null;
            const shiftCashSales = openShift
                ? await posRepository.getShiftCashSalesTotal(openShift.pos_terminal_shift_id)
                : 0;

            return ok({
                business_date: businessDate,
                sales_summary: salesSummary,
                active_shift: shiftPayload,
                active_shift_cash_summary: shiftPayload
                    ? buildShiftCashSummary({
                        shift: shiftPayload,
                        cashSalesAmount: shiftCashSales
                    })
                    : null
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve terminal dashboard summary'));
        }
    };
};

export const buildListIncomingOnlineOrdersUseCase = ({ posRepository }) => {
    return async ({ query }) => {
        if (query !== undefined && !isPlainObject(query)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'query must be an object',
                { statusCode: 400 }
            ));
        }

        const locationId = query?.location_id == null
            ? null
            : parsePositiveInt(query.location_id);
        if (query?.location_id != null && !locationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const orders = await posRepository.listIncomingOnlineOrders({
                locationId,
                limit: query?.limit || 200
            });
            return ok({ orders });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list incoming online orders'));
        }
    };
};

export const buildUpdateOnlineOrderStatusUseCase = ({ posRepository, stockMovementService }) => {
    return async ({ posTransactionId, payload, user }) => {
        const normalizedTransactionId = parsePositiveInt(posTransactionId);
        if (!normalizedTransactionId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'posTransactionId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!isPlainObject(payload)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'payload must be an object',
                { statusCode: 400 }
            ));
        }

        const targetStatus = normalizeOnlineFulfillmentStatus(payload?.fulfillment_status);
        if (!targetStatus) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'fulfillment_status is required and must be a supported status',
                { statusCode: 422 }
            ));
        }

        const actingUserId = parsePositiveInt(user?.user_id);
        if (!actingUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const transaction = await sequelize.transaction();

        try {
            const existing = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction,
                lock: true
            });
            if (!existing) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    `POS transaction not found: ${normalizedTransactionId}`,
                    { statusCode: 404 }
                );
            }
            if (existing.order_source !== ONLINE_ORDER_SOURCE) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Only online store orders can be updated through this endpoint',
                    { statusCode: 409 }
                );
            }

            const currentStatus = normalizeOnlineFulfillmentStatus(existing.fulfillment_status);
            if (!currentStatus) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'Current fulfillment state is invalid',
                    { statusCode: 409 }
                );
            }

            validateOnlineOrderTransition({
                currentStatus,
                nextStatus: targetStatus,
                orderMethod: existing.order_method
            });

            if (
                currentStatus !== 'completed'
                && targetStatus === 'completed'
                && stockMovementService?.createStockMovement
            ) {
                const stockMovements = buildOnlineOrderStockMovements(existing);
                for (const movement of stockMovements) {
                    await stockMovementService.createStockMovement(
                        movement,
                        actingUserId,
                        transaction
                    );
                }
            }

            const updatePayload = {
                fulfillment_status: targetStatus
            };

            // Online orders are created without a cashier. Capture the first staff
            // user who handles lifecycle actions for history/accountability.
            if (!parsePositiveInt(existing.cashier_id)) {
                updatePayload.cashier_id = actingUserId;
            }
            if (currentStatus === 'placed' && (targetStatus === 'confirmed' || targetStatus === 'rejected')) {
                updatePayload.accepted_by = actingUserId;
                updatePayload.accepted_at = new Date();
            }

            await posRepository.updateOrderById(normalizedTransactionId, updatePayload, {
                transaction,
                lock: true
            });
            const updated = await posRepository.getOrderByIdForLifecycle(normalizedTransactionId, {
                transaction
            });

            await transaction.commit();
            return ok({
                order: toSerializable(updated)
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            return fail(mapPosUseCaseError(error, 'Failed to update online order status'));
        }
    };
};
