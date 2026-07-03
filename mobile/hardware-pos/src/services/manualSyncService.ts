import { buildCheckoutReplayPayload, type LocalTransactionRecord, type MobilePosCheckoutReplayEntry } from '../domain/checkout';
import { applySyncCompletion, authorizeManualSync } from '../domain/syncPolicy';
import type { ReceiptState, SyncRunRecord } from '../domain/types';
import type {
    LocalTransactionRepository,
    SyncJournalRepository,
    SyncPolicyRepository,
    SyncRunRepository
} from '../repositories/contracts';

type MobilePosReasonCode =
    | 'PERMISSION_DENIED'
    | 'TERMINAL_POLICY_DENIED'
    | 'STOCK_LOCATION_CONFLICT'
    | 'COMPLIANCE_BLOCKED'
    | 'DUPLICATE_IDEMPOTENT_REPLAY'
    | 'MALFORMED_PAYLOAD'
    | 'STALE_CONFIG_VERSION_MISMATCH'
    | 'UNKNOWN';

interface MobilePosSyncResultEntry {
    local_transaction_id: string;
    status: 'accepted' | 'replayed' | 'rejected';
    server_transaction_id?: number | null;
    replay_outcome?: string | null;
    error?: {
        error_code?: MobilePosReasonCode | string;
    } | null;
}

export interface MobilePosSyncResponse {
    results: MobilePosSyncResultEntry[];
    summary: {
        checkpoint_token: string | null;
        accepted_count: number;
        replayed_count: number;
    };
}

export interface MobilePosSyncApi {
    syncCheckouts(payload: {
        device_id: string;
        client_sync_run_id: string;
        entries: MobilePosCheckoutReplayEntry[];
    }): Promise<MobilePosSyncResponse>;
    acknowledgeCheckpoint(payload: {
        checkpoint_token: string;
    }): Promise<void>;
}

export interface ManualSyncDependencies {
    deviceId: string;
    localTransactionRepository: LocalTransactionRepository;
    syncJournalRepository: SyncJournalRepository;
    syncPolicyRepository: SyncPolicyRepository;
    syncRunRepository: SyncRunRepository;
    mobilePosSyncApi: MobilePosSyncApi;
}

export interface ManualSyncOutcome {
    runId: string;
    outcome: SyncRunRecord['outcome'];
    allowed: boolean;
    pendingCount: number;
    checkpointToken: string | null;
    nextAllowedSyncAt: string | null;
    successfulSyncCountToday: number;
}

const isConflictReason = (reasonCode: string | null | undefined): boolean => (
    reasonCode === 'STOCK_LOCATION_CONFLICT'
    || reasonCode === 'COMPLIANCE_BLOCKED'
    || reasonCode === 'STALE_CONFIG_VERSION_MISMATCH'
);

const toReceiptStateAfterSync = (receiptState: ReceiptState): ReceiptState => (
    receiptState === 'printed_local_pending_sync' ? 'printed_local_synced' : receiptState
);

export class ManualSyncService {
    constructor(private readonly deps: ManualSyncDependencies) {}

    async run(runId: string, now: Date): Promise<ManualSyncOutcome> {
        const policy = await this.deps.syncPolicyRepository.getCurrent();
        const authorization = authorizeManualSync({ now, policy });

        await this.deps.syncRunRepository.create({
            runId,
            startedAt: now.toISOString(),
            completedAt: null,
            outcome: authorization.allowed ? 'authorized' : 'blocked_daily_limit',
            checkpointReturned: null,
            consumedSlot: false
        });

        if (!authorization.allowed) {
            await this.deps.syncRunRepository.complete(runId, {
                completedAt: now.toISOString(),
                outcome: 'blocked_daily_limit',
                checkpointReturned: null,
                consumedSlot: false
            });

            return {
                runId,
                outcome: 'blocked_daily_limit',
                allowed: false,
                pendingCount: 0,
                checkpointToken: null,
                nextAllowedSyncAt: authorization.nextAllowedSyncAt,
                successfulSyncCountToday: policy.successfulSyncCountToday
            };
        }

        const replayableTransactions = await this.deps.localTransactionRepository.listReplayable();
        if (replayableTransactions.length === 0) {
            const updatedPolicy = applySyncCompletion({
                now,
                policy,
                durableCheckpointReturned: false,
                checkpointToken: null,
                replayAcceptedCount: 0
            });
            await this.deps.syncPolicyRepository.save(updatedPolicy);
            await this.deps.syncRunRepository.complete(runId, {
                completedAt: now.toISOString(),
                outcome: 'completed_noop',
                checkpointReturned: null,
                consumedSlot: false
            });

            return {
                runId,
                outcome: 'completed_noop',
                allowed: true,
                pendingCount: 0,
                checkpointToken: null,
                nextAllowedSyncAt: updatedPolicy.nextAllowedSyncAt,
                successfulSyncCountToday: updatedPolicy.successfulSyncCountToday
            };
        }

        for (const transaction of replayableTransactions) {
            await this.deps.localTransactionRepository.markStatus({
                localTransactionId: transaction.localTransactionId,
                status: 'sync_replaying'
            });
        }

        try {
            const response = await this.deps.mobilePosSyncApi.syncCheckouts({
                device_id: this.deps.deviceId,
                client_sync_run_id: runId,
                entries: replayableTransactions.map(buildCheckoutReplayPayload)
            });

            await this.applyReplayResults(replayableTransactions, response.results);

            const durableCheckpointReturned = Boolean(response.summary.checkpoint_token);
            const replayAcceptedCount = response.summary.accepted_count + response.summary.replayed_count;
            const updatedPolicy = applySyncCompletion({
                now,
                policy,
                durableCheckpointReturned,
                checkpointToken: response.summary.checkpoint_token,
                replayAcceptedCount
            });

            await this.deps.syncPolicyRepository.save(updatedPolicy);

            if (response.summary.checkpoint_token) {
                await this.deps.mobilePosSyncApi.acknowledgeCheckpoint({
                    checkpoint_token: response.summary.checkpoint_token
                });
            }

            await this.deps.syncRunRepository.complete(runId, {
                completedAt: now.toISOString(),
                outcome: replayAcceptedCount > 0 ? 'completed' : 'completed_noop',
                checkpointReturned: response.summary.checkpoint_token,
                consumedSlot: durableCheckpointReturned && replayAcceptedCount > 0
            });

            return {
                runId,
                outcome: replayAcceptedCount > 0 ? 'completed' : 'completed_noop',
                allowed: true,
                pendingCount: replayableTransactions.length,
                checkpointToken: response.summary.checkpoint_token,
                nextAllowedSyncAt: updatedPolicy.nextAllowedSyncAt,
                successfulSyncCountToday: updatedPolicy.successfulSyncCountToday
            };
        } catch (error) {
            for (const transaction of replayableTransactions) {
                await this.deps.localTransactionRepository.markStatus({
                    localTransactionId: transaction.localTransactionId,
                    status: 'sync_pending'
                });
            }

            await this.deps.syncRunRepository.complete(runId, {
                completedAt: now.toISOString(),
                outcome: 'failed',
                checkpointReturned: null,
                consumedSlot: false
            });

            return {
                runId,
                outcome: 'failed',
                allowed: true,
                pendingCount: replayableTransactions.length,
                checkpointToken: null,
                nextAllowedSyncAt: policy.nextAllowedSyncAt,
                successfulSyncCountToday: policy.successfulSyncCountToday
            };
        }
    }

    private async applyReplayResults(
        replayableTransactions: LocalTransactionRecord[],
        results: MobilePosSyncResultEntry[]
    ): Promise<void> {
        const transactionMap = new Map(
            replayableTransactions.map((transaction) => [transaction.localTransactionId, transaction])
        );

        for (const result of results) {
            const transaction = transactionMap.get(result.local_transaction_id);
            if (!transaction) {
                continue;
            }

            if (result.status === 'accepted' || result.status === 'replayed') {
                await this.deps.localTransactionRepository.markStatus({
                    localTransactionId: transaction.localTransactionId,
                    status: 'synced',
                    serverTransactionId: result.server_transaction_id ?? null,
                    lastSyncReasonCode: result.replay_outcome ?? null,
                    receiptState: toReceiptStateAfterSync(transaction.receiptState)
                });
                await this.deps.syncJournalRepository.markReplayed(transaction.localTransactionId);
                continue;
            }

            const reasonCode = result.error?.error_code ?? 'UNKNOWN';
            await this.deps.localTransactionRepository.markStatus({
                localTransactionId: transaction.localTransactionId,
                status: isConflictReason(reasonCode)
                    ? 'conflict'
                    : 'failed_manual_resolution_required',
                lastSyncReasonCode: reasonCode
            });
        }
    }
}
