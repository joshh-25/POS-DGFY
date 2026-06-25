export type LocalTransactionStatus =
    | 'draft'
    | 'committed_local'
    | 'sync_pending'
    | 'sync_replaying'
    | 'synced'
    | 'conflict'
    | 'failed_manual_resolution_required';

export type ReceiptState =
    | 'not_printed'
    | 'printed_local_pending_sync'
    | 'printed_local_synced';

export type SyncRunOutcome =
    | 'authorized'
    | 'completed'
    | 'completed_noop'
    | 'failed'
    | 'blocked_daily_limit'
    | 'blocked_policy';

export type SyncAllowance = '0/2' | '1/2' | '2/2';

export interface SyncPolicyRecord {
    businessDayKey: string;
    successfulSyncCountToday: number;
    lastSuccessfulSyncAt: string | null;
    nextAllowedSyncAt: string | null;
    lastCheckpoint: string | null;
    resetHour: number;
    resetMinute: number;
}

export interface SyncRunRecord {
    runId: string;
    startedAt: string;
    completedAt: string | null;
    outcome: SyncRunOutcome;
    checkpointReturned: string | null;
    consumedSlot: boolean;
}

export interface LocalTransactionIdentity {
    localTransactionId: string;
    idempotencyKey: string;
    createdAtLocal: string;
    status: LocalTransactionStatus;
    receiptState: ReceiptState;
}
