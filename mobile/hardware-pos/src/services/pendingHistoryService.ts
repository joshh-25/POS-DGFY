import type { HistoryRow } from '../domain/history';
import type { HistoryCounts, LocalTransactionRepository, SyncRunRepository } from '../repositories/contracts';

export interface PendingHistorySnapshot {
    rows: HistoryRow[];
    counts: HistoryCounts;
    lastSyncRun: Awaited<ReturnType<SyncRunRepository['getLatest']>>;
}

export class PendingHistoryService {
    constructor(
        private readonly localTransactionRepository: LocalTransactionRepository,
        private readonly syncRunRepository: SyncRunRepository
    ) {}

    async getSnapshot(): Promise<PendingHistorySnapshot> {
        const [rows, counts, lastSyncRun] = await Promise.all([
            this.localTransactionRepository.listHistory(),
            this.localTransactionRepository.getHistoryCounts(),
            this.syncRunRepository.getLatest()
        ]);

        return {
            rows,
            counts,
            lastSyncRun
        };
    }
}
