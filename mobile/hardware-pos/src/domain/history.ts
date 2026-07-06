import type { LocalTransactionStatus, ReceiptState } from './types';

export interface HistoryRow {
    localTransactionId: string;
    createdAtLocal: string;
    cashierId: number;
    shiftId: string;
    paymentType: string;
    orderMethod: string;
    orderSource: 'in_store' | 'online_store';
    status: LocalTransactionStatus;
    receiptState: ReceiptState;
    grandTotal: number;
    itemCount: number;
    serverTransactionId: number | null;
    statusLabel: string;
    authoritative: boolean;
    attentionRequired: boolean;
}

const STATUS_LABELS: Record<LocalTransactionStatus, string> = {
    draft: 'Draft',
    committed_local: 'Committed locally',
    sync_pending: 'Pending sync',
    sync_replaying: 'Sync in progress',
    synced: 'Synced',
    conflict: 'Conflict',
    failed_manual_resolution_required: 'Manual resolution required'
};

export const toHistoryRow = (input: {
    localTransactionId: string;
    createdAtLocal: string;
    cashierId: number;
    shiftId: string;
    paymentType?: string;
    orderMethod?: string;
    orderSource?: 'in_store' | 'online_store';
    status: LocalTransactionStatus;
    receiptState: ReceiptState;
    grandTotal: number;
    itemCount: number;
    serverTransactionId: number | null;
}): HistoryRow => ({
    ...input,
    paymentType: input.paymentType ?? 'cash',
    orderMethod: input.orderMethod ?? 'dine_in',
    orderSource: input.orderSource ?? 'in_store',
    statusLabel: STATUS_LABELS[input.status],
    authoritative: input.status === 'synced',
    attentionRequired: input.status === 'conflict' || input.status === 'failed_manual_resolution_required'
});
