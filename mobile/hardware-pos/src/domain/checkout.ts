import type { LocalTransactionIdentity, ReceiptState } from './types';

export interface LocalTransactionLineInput {
    lineId: string;
    itemId: number;
    itemName: string;
    quantity: number;
    unitPrice: number;
    discounts: number;
    fees: number;
    vatRelevantAmount: number;
    barcodeMetadata?: Record<string, unknown> | null;
}

export interface LocalTransactionTotals {
    subtotal: number;
    discountTotal: number;
    feeTotal: number;
    grandTotal: number;
    vatTotal: number;
}

export interface LocalCheckoutInput {
    localTransactionId: string;
    idempotencyKey: string;
    createdAtLocal: string;
    cashierId: number;
    shiftId: string;
    receiptState?: ReceiptState;
    lines: LocalTransactionLineInput[];
    totals: LocalTransactionTotals;
    pricingSnapshot: Record<string, unknown>;
    paymentSnapshot: Record<string, unknown>;
    customerSnapshot?: Record<string, unknown> | null;
}

export interface LocalTransactionRecord extends LocalTransactionIdentity {
    cashierId: number;
    shiftId: string;
    lines: LocalTransactionLineInput[];
    totals: LocalTransactionTotals;
    pricingSnapshot: Record<string, unknown>;
    paymentSnapshot: Record<string, unknown>;
    customerSnapshot: Record<string, unknown> | null;
    serverTransactionId: number | null;
    lastSyncReasonCode: string | null;
}

export interface MobilePosCheckoutReplayEntry {
    local_transaction_id: string;
    payload: Record<string, unknown>;
}

export const buildLocalCheckoutRecord = (input: LocalCheckoutInput): LocalTransactionRecord => ({
    localTransactionId: input.localTransactionId,
    idempotencyKey: input.idempotencyKey,
    createdAtLocal: input.createdAtLocal,
    status: 'sync_pending',
    receiptState: input.receiptState ?? 'not_printed',
    cashierId: input.cashierId,
    shiftId: input.shiftId,
    lines: input.lines,
    totals: input.totals,
    pricingSnapshot: input.pricingSnapshot,
    paymentSnapshot: input.paymentSnapshot,
    customerSnapshot: input.customerSnapshot ?? null,
    serverTransactionId: null,
    lastSyncReasonCode: null
});

export const buildCheckoutReplayPayload = (
    transaction: LocalTransactionRecord
): MobilePosCheckoutReplayEntry => ({
    local_transaction_id: transaction.localTransactionId,
    payload: {
        idempotency_key: transaction.idempotencyKey,
        shift_id: transaction.shiftId,
        cashier_id: transaction.cashierId,
        created_at_local: transaction.createdAtLocal,
        lines: transaction.lines.map((line) => ({
            item_id: line.itemId,
            item_name_snapshot: line.itemName,
            quantity: line.quantity,
            sale_price: line.unitPrice,
            discount_amount: line.discounts,
            fee_amount: line.fees,
            vat_relevant_amount: line.vatRelevantAmount,
            scan_metadata: line.barcodeMetadata ?? null
        })),
        totals: transaction.totals,
        pricing_snapshot: transaction.pricingSnapshot,
        payment_snapshot: transaction.paymentSnapshot,
        customer_snapshot: transaction.customerSnapshot
    }
});
