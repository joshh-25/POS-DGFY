import type { LocalTransactionRecord, MobilePosCheckoutReplayEntry } from '../domain/checkout';
import { toHistoryRow, type HistoryRow } from '../domain/history';
import type { SyncPolicyRecord, SyncRunRecord } from '../domain/types';
import type {
    HistoryCounts,
    LocalTransactionRepository,
    SyncJournalRepository,
    SyncPolicyRepository,
    SyncRunRepository
} from './contracts';

const cloneTransaction = (transaction: LocalTransactionRecord): LocalTransactionRecord => ({
    ...transaction,
    lines: transaction.lines.map((line) => ({ ...line, barcodeMetadata: line.barcodeMetadata ? { ...line.barcodeMetadata } : null })),
    totals: { ...transaction.totals },
    pricingSnapshot: { ...transaction.pricingSnapshot },
    paymentSnapshot: { ...transaction.paymentSnapshot },
    customerSnapshot: transaction.customerSnapshot ? { ...transaction.customerSnapshot } : null
});

export class InMemoryLocalTransactionRepository implements LocalTransactionRepository {
    private readonly records = new Map<string, LocalTransactionRecord>();

    async create(transaction: LocalTransactionRecord): Promise<void> {
        this.records.set(transaction.localTransactionId, cloneTransaction(transaction));
    }

    async getById(localTransactionId: string): Promise<LocalTransactionRecord | null> {
        const record = this.records.get(localTransactionId);
        return record ? cloneTransaction(record) : null;
    }

    async markStatus(input: {
        localTransactionId: string;
        status: LocalTransactionRecord['status'];
        serverTransactionId?: number | null;
        lastSyncReasonCode?: string | null;
        receiptState?: LocalTransactionRecord['receiptState'];
    }): Promise<void> {
        const existing = this.records.get(input.localTransactionId);
        if (!existing) {
            return;
        }

        this.records.set(input.localTransactionId, {
            ...existing,
            status: input.status,
            receiptState: input.receiptState ?? existing.receiptState,
            serverTransactionId: input.serverTransactionId ?? existing.serverTransactionId,
            lastSyncReasonCode: input.lastSyncReasonCode ?? existing.lastSyncReasonCode
        });
    }

    async listReplayable(): Promise<LocalTransactionRecord[]> {
        return [...this.records.values()]
            .filter((record) => record.status === 'sync_pending' || record.status === 'sync_replaying')
            .sort((left, right) => left.createdAtLocal.localeCompare(right.createdAtLocal))
            .map(cloneTransaction);
    }

    async listHistory(): Promise<HistoryRow[]> {
        return [...this.records.values()]
            .sort((left, right) => right.createdAtLocal.localeCompare(left.createdAtLocal))
            .map((record) => toHistoryRow({
                localTransactionId: record.localTransactionId,
                createdAtLocal: record.createdAtLocal,
                cashierId: record.cashierId,
                shiftId: record.shiftId,
                paymentType: String(record.paymentSnapshot?.payment_type ?? 'cash'),
                orderMethod: String(record.paymentSnapshot?.order_method ?? 'dine_in'),
                orderSource: 'in_store',
                status: record.status,
                receiptState: record.receiptState,
                grandTotal: record.totals.grandTotal,
                itemCount: record.lines.length,
                serverTransactionId: record.serverTransactionId
            }));
    }

    async getHistoryCounts(): Promise<HistoryCounts> {
        const values = [...this.records.values()];
        return {
            pending: values.filter((record) => record.status === 'sync_pending' || record.status === 'sync_replaying').length,
            synced: values.filter((record) => record.status === 'synced').length,
            conflict: values.filter((record) => record.status === 'conflict' || record.status === 'failed_manual_resolution_required').length
        };
    }
}

export class InMemorySyncJournalRepository implements SyncJournalRepository {
    private readonly entries = new Map<string, { status: 'pending' | 'replayed'; payload: MobilePosCheckoutReplayEntry }>();

    async enqueueCheckoutReplay(transaction: LocalTransactionRecord, replayEntry: MobilePosCheckoutReplayEntry): Promise<void> {
        this.entries.set(transaction.localTransactionId, {
            status: 'pending',
            payload: replayEntry
        });
    }

    async markReplayed(localTransactionId: string): Promise<void> {
        const existing = this.entries.get(localTransactionId);
        if (!existing) {
            return;
        }

        this.entries.set(localTransactionId, {
            ...existing,
            status: 'replayed'
        });
    }
}

export class InMemorySyncPolicyRepository implements SyncPolicyRepository {
    constructor(private policy: SyncPolicyRecord) {}

    async getCurrent(): Promise<SyncPolicyRecord> {
        return { ...this.policy };
    }

    async save(policy: SyncPolicyRecord): Promise<void> {
        this.policy = { ...policy };
    }
}

export class InMemorySyncRunRepository implements SyncRunRepository {
    private readonly runs = new Map<string, SyncRunRecord>();

    async create(run: SyncRunRecord): Promise<void> {
        this.runs.set(run.runId, { ...run });
    }

    async complete(runId: string, update: {
        completedAt: string;
        outcome: SyncRunRecord['outcome'];
        checkpointReturned: string | null;
        consumedSlot: boolean;
    }): Promise<void> {
        const existing = this.runs.get(runId);
        if (!existing) {
            return;
        }

        this.runs.set(runId, {
            ...existing,
            completedAt: update.completedAt,
            outcome: update.outcome,
            checkpointReturned: update.checkpointReturned,
            consumedSlot: update.consumedSlot
        });
    }

    async getLatest(): Promise<SyncRunRecord | null> {
        return [...this.runs.values()]
            .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null;
    }
}
