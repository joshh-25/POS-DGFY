import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolvePosVoidFinancialOutcome } from './posVoidFinancialOutcome.js';

const EPSILON = 0.000001;

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const roundPosItemVoidAmount = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const normalizeMetadata = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};

const getLineName = (line = {}) => (
    String(line.item_name_snapshot || line.item?.name || '').trim()
    || `Item #${parsePositiveInt(line.item_id) || 'unknown'}`
);

export const normalizePosItemVoidLines = ({ requestedLines = [], transactionLines = [] } = {}) => {
    if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'voided_lines must contain at least one transaction line',
            { statusCode: 422, details: { reason_code: 'POS_ITEM_VOID_LINES_REQUIRED' } }
        );
    }

    const sourceLines = new Map((Array.isArray(transactionLines) ? transactionLines : []).map((line) => [
        parsePositiveInt(line?.line_id),
        line
    ]));
    const seenLineIds = new Set();
    return requestedLines.map((requestedLine) => {
        const lineId = parsePositiveInt(requestedLine?.line_id);
        const sourceLine = sourceLines.get(lineId);
        const requestedQuantity = roundPosItemVoidAmount(requestedLine?.quantity);
        const originalQuantity = roundPosItemVoidAmount(sourceLine?.quantity);
        const previousVoidedQuantity = roundPosItemVoidAmount(sourceLine?.voided_quantity);
        const availableQuantity = roundPosItemVoidAmount(Math.max(0, originalQuantity - previousVoidedQuantity));

        if (!lineId || !sourceLine || requestedQuantity <= 0) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Every item void line must reference an existing line and a positive quantity',
                { statusCode: 422, details: { reason_code: 'POS_ITEM_VOID_LINE_INVALID', line_id: lineId } }
            );
        }
        if (seenLineIds.has(lineId)) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'A transaction line may appear only once in an item void request',
                { statusCode: 422, details: { reason_code: 'POS_ITEM_VOID_LINE_DUPLICATE', line_id: lineId } }
            );
        }
        seenLineIds.add(lineId);
        if (availableQuantity <= EPSILON || requestedQuantity > availableQuantity + EPSILON) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'Voided quantity cannot exceed the remaining quantity on the transaction line',
                {
                    statusCode: 409,
                    details: {
                        reason_code: 'POS_ITEM_VOID_QUANTITY_EXCEEDS_REMAINING',
                        line_id: lineId,
                        original_quantity: originalQuantity,
                        previously_voided_quantity: previousVoidedQuantity,
                        available_quantity: availableQuantity,
                        requested_quantity: requestedQuantity
                    }
                }
            );
        }

        const originalLineSubtotal = roundPosItemVoidAmount(sourceLine.line_subtotal);
        const unitAmount = originalQuantity > EPSILON
            ? originalLineSubtotal / originalQuantity
            : roundPosItemVoidAmount(sourceLine.sale_price);
        const lineSubtotal = roundPosItemVoidAmount(unitAmount * requestedQuantity);
        const nextVoidedQuantity = roundPosItemVoidAmount(previousVoidedQuantity + requestedQuantity);

        return {
            line_id: lineId,
            item_id: parsePositiveInt(sourceLine.item_id),
            item_name: getLineName(sourceLine),
            original_quantity: originalQuantity,
            previous_voided_quantity: previousVoidedQuantity,
            available_quantity: availableQuantity,
            quantity: requestedQuantity,
            voided_quantity: nextVoidedQuantity,
            remaining_quantity: roundPosItemVoidAmount(Math.max(0, originalQuantity - nextVoidedQuantity)),
            sale_price: roundPosItemVoidAmount(sourceLine.sale_price),
            line_subtotal: lineSubtotal,
            stock_effect_type: sourceLine.stock_effect_type || null,
            fnb_modifiers_snapshot: Array.isArray(sourceLine.fnb_modifiers_snapshot)
                ? sourceLine.fnb_modifiers_snapshot
                : null
        };
    });
};

export const isPosItemVoidAdjustment = (adjustment) => (
    normalizeMetadata(adjustment?.metadata).evidence_scope === 'pos_item_void'
);

export const getPosItemVoidAdjustmentMetadata = (adjustment) => normalizeMetadata(adjustment?.metadata);

export const buildPosItemVoidFinancialOutcome = (transaction, amount) => {
    const outcome = resolvePosVoidFinancialOutcome({
        ...transaction,
        total_amount: roundPosItemVoidAmount(amount)
    });
    return {
        ...outcome,
        evidence_scope: 'pos_item_void',
        refund_amount: roundPosItemVoidAmount(outcome.refund_amount)
    };
};

export const buildPosItemVoidTransactionUpdate = ({ transaction = {}, lines = [], voidedAmount = 0 } = {}) => {
    const sourceLines = Array.isArray(lines) ? lines : [];
    const grossByLine = sourceLines.map((line) => {
        const quantity = Math.max(0, Number(line?.quantity || 0));
        const salePrice = Number(line?.sale_price);
        const grossAmount = Number.isFinite(salePrice) && salePrice >= 0
            ? salePrice * quantity
            : Number(line?.line_subtotal || 0);
        const voidedQuantity = Math.min(quantity, Math.max(0, Number(line?.voided_quantity || 0)));
        return {
            grossAmount: Math.max(0, grossAmount),
            activeGrossAmount: Math.max(0, grossAmount * (quantity > EPSILON ? (quantity - voidedQuantity) / quantity : 0))
        };
    });
    const originalGross = grossByLine.reduce((sum, line) => sum + line.grossAmount, 0);
    const activeGross = grossByLine.reduce((sum, line) => sum + line.activeGrossAmount, 0);
    const activeRatio = originalGross > EPSILON
        ? Math.min(1, Math.max(0, activeGross / originalGross))
        : null;
    const scale = (value) => roundPosItemVoidAmount(
        activeRatio == null
            ? Math.max(0, Number(value || 0) - Number(voidedAmount || 0))
            : Math.max(0, Number(value || 0) * activeRatio)
    );
    const subtotalAmount = scale(transaction.subtotal_amount);
    const discountAmount = scale(transaction.discount_amount);
    const serviceFeeAmount = scale(transaction.service_fee_amount);
    const restaurantServiceChargeAmount = scale(transaction.restaurant_service_charge_amount);
    const totalAmount = activeRatio == null
        ? scale(transaction.total_amount)
        : roundPosItemVoidAmount(Math.max(0, Number(transaction.total_amount || 0) * activeRatio));
    const originalPaymentStatus = String(transaction.payment_status || '').trim().toLowerCase();
    const wasSettled = ['paid', 'partial_refunded', 'refund_pending', 'refunded'].includes(originalPaymentStatus);
    const amountPaid = wasSettled
        ? totalAmount
        : roundPosItemVoidAmount(Math.min(Number(transaction.amount_paid || 0), totalAmount));

    return {
        subtotal_amount: subtotalAmount,
        vatable_sales: scale(transaction.vatable_sales),
        vat_amount: scale(transaction.vat_amount),
        vat_exempt_sales: scale(transaction.vat_exempt_sales),
        zero_rated_sales: scale(transaction.zero_rated_sales),
        discount_amount: discountAmount,
        service_fee_amount: serviceFeeAmount,
        restaurant_service_charge_amount: restaurantServiceChargeAmount,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance_due: roundPosItemVoidAmount(Math.max(0, totalAmount - amountPaid))
    };
};

export const resolvePosItemVoidRefundScope = async ({
    posRepository,
    transactionId,
    adjustmentId,
    transaction
} = {}) => {
    const normalizedAdjustmentId = parsePositiveInt(adjustmentId);
    if (!normalizedAdjustmentId) return null;
    if (typeof posRepository?.listPosTransactionAdjustmentsForTransaction !== 'function') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Item void refund evidence is unavailable',
            { statusCode: 503, details: { reason_code: 'POS_ITEM_VOID_REFUND_EVIDENCE_UNAVAILABLE' } }
        );
    }

    const adjustments = await posRepository.listPosTransactionAdjustmentsForTransaction(
        transactionId,
        { transaction, lock: true }
    );
    const itemVoidAdjustment = (Array.isArray(adjustments) ? adjustments : []).find((adjustment) => (
        Number(adjustment?.pos_transaction_adjustment_id) === normalizedAdjustmentId
        && adjustment?.adjustment_type === 'void'
        && adjustment?.status === 'succeeded'
        && isPosItemVoidAdjustment(adjustment)
    ));
    if (!itemVoidAdjustment) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'The selected item-void evidence was not found',
            { statusCode: 404, details: { reason_code: 'POS_ITEM_VOID_ADJUSTMENT_NOT_FOUND' } }
        );
    }

    const refundAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter((adjustment) => {
        const metadata = getPosItemVoidAdjustmentMetadata(adjustment);
        return ['cash_refund', 'external_refund', 'provider_refund'].includes(adjustment?.adjustment_type)
            && String(metadata.item_void_adjustment_id || '') === String(normalizedAdjustmentId)
            && ['succeeded', 'pending', 'manual_review_required'].includes(String(adjustment?.status || '').toLowerCase());
    });
    const terminalRefund = refundAdjustments.find((adjustment) => adjustment.status === 'succeeded');

    const metadata = getPosItemVoidAdjustmentMetadata(itemVoidAdjustment);
    const financialOutcome = buildPosItemVoidFinancialOutcome(transaction, itemVoidAdjustment.amount);

    return {
        adjustment: itemVoidAdjustment,
        amount: roundPosItemVoidAmount(itemVoidAdjustment.amount),
        // Recompute from the current transaction instead of trusting an older
        // persisted outcome. This keeps the refund route aligned with the
        // actual tender when legacy payment-breakdown data was serialized
        // differently at the time of the void.
        metadata: {
            ...metadata,
            financial_outcome: financialOutcome
        },
        refund_adjustments: refundAdjustments,
        terminal_refund: terminalRefund || null,
        transaction
    };
};

export const calculatePosRefundedAmount = (adjustments = []) => roundPosItemVoidAmount(
    (Array.isArray(adjustments) ? adjustments : [])
        .filter((adjustment) => (
            ['cash_refund', 'external_refund', 'provider_refund'].includes(adjustment?.adjustment_type)
            && adjustment?.status === 'succeeded'
        ))
        .reduce((sum, adjustment) => sum + Number(adjustment?.amount || 0), 0)
);

export const resolvePosPaymentStatusAfterRefund = ({ transaction, adjustments = [], amount }) => {
    const totalRefunded = roundPosItemVoidAmount(calculatePosRefundedAmount(adjustments) + Number(amount || 0));
    const itemVoidAmounts = (Array.isArray(adjustments) ? adjustments : [])
        .filter((adjustment) => isPosItemVoidAdjustment(adjustment) && adjustment?.adjustment_type === 'void')
        .reduce((sum, adjustment) => sum + Number(adjustment?.amount || 0), 0);
    const originalAmount = roundPosItemVoidAmount(
        Number(transaction?.total_amount || 0) + itemVoidAmounts
    );
    if (originalAmount > 0 && totalRefunded + EPSILON >= originalAmount) return 'refunded';
    if (originalAmount <= EPSILON && totalRefunded <= EPSILON) return 'paid';
    return 'partial_refunded';
};
