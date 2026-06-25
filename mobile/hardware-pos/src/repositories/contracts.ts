import type { LocalTransactionRecord, MobilePosCheckoutReplayEntry } from '../domain/checkout';
import type { HistoryRow } from '../domain/history';
import type { SyncPolicyRecord, SyncRunOutcome, SyncRunRecord } from '../domain/types';

export interface HistoryCounts {
    pending: number;
    synced: number;
    conflict: number;
}

export interface LocalTransactionRepository {
    create(transaction: LocalTransactionRecord): Promise<void>;
    getById(localTransactionId: string): Promise<LocalTransactionRecord | null>;
    markStatus(input: {
        localTransactionId: string;
        status: LocalTransactionRecord['status'];
        serverTransactionId?: number | null;
        lastSyncReasonCode?: string | null;
        receiptState?: LocalTransactionRecord['receiptState'];
    }): Promise<void>;
    listReplayable(): Promise<LocalTransactionRecord[]>;
    listHistory(): Promise<HistoryRow[]>;
    getHistoryCounts(): Promise<HistoryCounts>;
}

export interface SyncJournalRepository {
    enqueueCheckoutReplay(transaction: LocalTransactionRecord, replayEntry: MobilePosCheckoutReplayEntry): Promise<void>;
    markReplayed(localTransactionId: string): Promise<void>;
}

export interface SyncPolicyRepository {
    getCurrent(): Promise<SyncPolicyRecord>;
    save(policy: SyncPolicyRecord): Promise<void>;
}

export interface SyncRunRepository {
    create(run: SyncRunRecord): Promise<void>;
    complete(runId: string, update: {
        completedAt: string;
        outcome: SyncRunOutcome;
        checkpointReturned: string | null;
        consumedSlot: boolean;
    }): Promise<void>;
    getLatest(): Promise<SyncRunRecord | null>;
}
