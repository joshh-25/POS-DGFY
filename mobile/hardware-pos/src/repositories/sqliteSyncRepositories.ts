import type { SqliteDriver } from '../db/driver';
import type { LocalTransactionRecord, MobilePosCheckoutReplayEntry } from '../domain/checkout';
import type { SyncPolicyRecord, SyncRunRecord } from '../domain/types';
import type { SyncJournalRepository, SyncPolicyRepository, SyncRunRepository } from './contracts';

const DEFAULT_SYNC_POLICY: SyncPolicyRecord = {
    businessDayKey: new Date().toISOString().slice(0, 10),
    successfulSyncCountToday: 0,
    lastSuccessfulSyncAt: null,
    nextAllowedSyncAt: null,
    lastCheckpoint: null,
    resetHour: 0,
    resetMinute: 0
};

export class SqliteSyncJournalRepository implements SyncJournalRepository {
    constructor(private readonly driver: SqliteDriver) {}

    async enqueueCheckoutReplay(
        transaction: LocalTransactionRecord,
        replayEntry: MobilePosCheckoutReplayEntry
    ): Promise<void> {
        await this.driver.execute({
            sql: `
                INSERT INTO sync_journal (
                    journal_id,
                    entity_type,
                    entity_id,
                    operation_type,
                    payload_json,
                    status
                ) VALUES (?, 'checkout', ?, 'replay', ?, 'pending');
            `,
            params: [
                `journal-${transaction.localTransactionId}`,
                transaction.localTransactionId,
                JSON.stringify(replayEntry)
            ]
        });
    }

    async markReplayed(localTransactionId: string): Promise<void> {
        await this.driver.execute({
            sql: `
                UPDATE sync_journal
                SET status = 'replayed'
                WHERE entity_type = 'checkout' AND entity_id = ?;
            `,
            params: [localTransactionId]
        });
    }
}

export class SqliteSyncPolicyRepository implements SyncPolicyRepository {
    constructor(private readonly driver: SqliteDriver) {}

    async getCurrent(): Promise<SyncPolicyRecord> {
        const rows = await this.driver.query<{
            business_day_key: string;
            successful_sync_count_today: number;
            last_successful_sync_at: string | null;
            next_allowed_sync_at: string | null;
            last_checkpoint: string | null;
        }>({
            sql: `
                SELECT *
                FROM sync_policy
                ORDER BY business_day_key DESC
                LIMIT 1;
            `
        });

        const row = rows[0];
        if (!row) {
            return DEFAULT_SYNC_POLICY;
        }

        return {
            businessDayKey: row.business_day_key,
            successfulSyncCountToday: Number(row.successful_sync_count_today || 0),
            lastSuccessfulSyncAt: row.last_successful_sync_at,
            nextAllowedSyncAt: row.next_allowed_sync_at,
            lastCheckpoint: row.last_checkpoint,
            resetHour: 0,
            resetMinute: 0
        };
    }

    async save(policy: SyncPolicyRecord): Promise<void> {
        await this.driver.execute({
            sql: `
                INSERT INTO sync_policy (
                    business_day_key,
                    successful_sync_count_today,
                    last_successful_sync_at,
                    next_allowed_sync_at,
                    last_checkpoint
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(business_day_key) DO UPDATE SET
                    successful_sync_count_today = excluded.successful_sync_count_today,
                    last_successful_sync_at = excluded.last_successful_sync_at,
                    next_allowed_sync_at = excluded.next_allowed_sync_at,
                    last_checkpoint = excluded.last_checkpoint;
            `,
            params: [
                policy.businessDayKey,
                policy.successfulSyncCountToday,
                policy.lastSuccessfulSyncAt,
                policy.nextAllowedSyncAt,
                policy.lastCheckpoint
            ]
        });
    }
}

export class SqliteSyncRunRepository implements SyncRunRepository {
    constructor(private readonly driver: SqliteDriver) {}

    async create(run: SyncRunRecord): Promise<void> {
        await this.driver.execute({
            sql: `
                INSERT INTO sync_runs (
                    run_id,
                    started_at,
                    completed_at,
                    outcome,
                    checkpoint_returned,
                    consumed_slot
                ) VALUES (?, ?, ?, ?, ?, ?);
            `,
            params: [
                run.runId,
                run.startedAt,
                run.completedAt,
                run.outcome,
                run.checkpointReturned,
                run.consumedSlot ? 1 : 0
            ]
        });
    }

    async complete(runId: string, update: {
        completedAt: string;
        outcome: SyncRunRecord['outcome'];
        checkpointReturned: string | null;
        consumedSlot: boolean;
    }): Promise<void> {
        await this.driver.execute({
            sql: `
                UPDATE sync_runs
                SET completed_at = ?,
                    outcome = ?,
                    checkpoint_returned = ?,
                    consumed_slot = ?
                WHERE run_id = ?;
            `,
            params: [
                update.completedAt,
                update.outcome,
                update.checkpointReturned,
                update.consumedSlot ? 1 : 0,
                runId
            ]
        });
    }

    async getLatest(): Promise<SyncRunRecord | null> {
        const rows = await this.driver.query<{
            run_id: string;
            started_at: string;
            completed_at: string | null;
            outcome: SyncRunRecord['outcome'];
            checkpoint_returned: string | null;
            consumed_slot: number;
        }>({
            sql: `
                SELECT *
                FROM sync_runs
                ORDER BY started_at DESC
                LIMIT 1;
            `
        });

        const row = rows[0];
        if (!row) {
            return null;
        }

        return {
            runId: row.run_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            outcome: row.outcome,
            checkpointReturned: row.checkpoint_returned,
            consumedSlot: Boolean(row.consumed_slot)
        };
    }
}
