import { HardwarePosAuthClient } from '../api/hardwarePosAuthClient';
import { MobilePosClient, type MobilePosClientConfig } from '../api/mobilePosClient';
import { NativeSqliteDriver } from '../db/nativeSqliteDriver';
import { createIndexStatements, createTableStatements } from '../db/migrations';
import type { MobilePosCheckoutReplayEntry } from '../domain/checkout';
import type { SyncPolicyRecord } from '../domain/types';
import type { LocalTransactionRepository } from '../repositories/contracts';
import { InMemoryLocalTransactionRepository, InMemorySyncJournalRepository, InMemorySyncPolicyRepository, InMemorySyncRunRepository } from '../repositories/inMemoryRepositories';
import { SqliteLocalTransactionRepository } from '../repositories/sqliteLocalTransactionRepository';
import { SqliteSyncJournalRepository, SqliteSyncPolicyRepository, SqliteSyncRunRepository } from '../repositories/sqliteSyncRepositories';
import { LocalCheckoutJournalService } from '../services/localCheckoutJournalService';
import { ManualSyncService } from '../services/manualSyncService';
import { PendingHistoryService } from '../services/pendingHistoryService';
import { RuntimeStateService } from '../services/runtimeStateService';
import { createTransactionAwareStandalonePosSqliteConnection, isStandalonePosSqliteAvailable } from '../native/standalonePosSqlite';

export interface HardwarePosDependencies {
    localTransactionRepository: LocalTransactionRepository;
    localCheckoutJournalService: LocalCheckoutJournalService;
    pendingHistoryService: PendingHistoryService;
    manualSyncService: ManualSyncService;
    mobilePosClient: MobilePosClient | null;
    storageMode: 'sqlite' | 'memory';
    syncPolicyRepository: InMemorySyncPolicyRepository | SqliteSyncPolicyRepository;
    runtimeStateService: RuntimeStateService | null;
    authClient: HardwarePosAuthClient;
    configureMobileClient(config: MobilePosClientConfig | null): MobilePosClient | null;
    getMobilePosClient(): MobilePosClient | null;
}

class MutableMobilePosSyncApi {
    private client: MobilePosClient | null;

    constructor(client: MobilePosClient | null) {
        this.client = client;
    }

    setClient(client: MobilePosClient | null) {
        this.client = client;
    }

    getClient(): MobilePosClient | null {
        return this.client;
    }

    async syncCheckouts(payload: {
        device_id: string;
        client_sync_run_id: string;
        entries: MobilePosCheckoutReplayEntry[];
    }) {
        if (!this.client) {
            return {
                results: payload.entries.map((entry, index) => ({
                    local_transaction_id: String(entry.local_transaction_id ?? `local-${index}`),
                    status: 'accepted' as const,
                    server_transaction_id: 9000 + index,
                    replay_outcome: 'processed'
                })),
                summary: {
                    checkpoint_token: `local-checkpoint-${Date.now()}`,
                    accepted_count: payload.entries.length,
                    replayed_count: 0
                }
            };
        }

        return await this.client.syncCheckouts(payload);
    }

    async acknowledgeCheckpoint(payload: { checkpoint_token: string }) {
        if (!this.client) {
            return;
        }

        await this.client.acknowledgeCheckpoint(payload);
    }
}

const defaultSyncPolicy = (): SyncPolicyRecord => ({
    businessDayKey: new Date().toISOString().slice(0, 10),
    successfulSyncCountToday: 0,
    lastSuccessfulSyncAt: null,
    nextAllowedSyncAt: null,
    lastCheckpoint: null,
    resetHour: 0,
    resetMinute: 0
});

const runSqliteMigrations = async (driver: NativeSqliteDriver): Promise<void> => {
    for (const statement of createTableStatements) {
        await driver.execute({ sql: statement.sql });
    }
    for (const statement of createIndexStatements) {
        await driver.execute({ sql: statement.sql });
    }
};

const createSqliteDependencies = async (input: {
    deviceId: string;
    clientConfig?: MobilePosClientConfig | null;
}): Promise<HardwarePosDependencies> => {
    const connection = await createTransactionAwareStandalonePosSqliteConnection();
    const driver = new NativeSqliteDriver(connection);
    await runSqliteMigrations(driver);

    const localTransactionRepository = new SqliteLocalTransactionRepository(driver);
    const syncJournalRepository = new SqliteSyncJournalRepository(driver);
    const syncPolicyRepository = new SqliteSyncPolicyRepository(driver);
    const syncRunRepository = new SqliteSyncRunRepository(driver);
    const runtimeStateService = new RuntimeStateService(driver);
    const resolvedClientConfig = input.clientConfig ?? await runtimeStateService.getAuthConfig();
    const mutableSyncApi = new MutableMobilePosSyncApi(
        resolvedClientConfig ? new MobilePosClient(resolvedClientConfig) : null
    );
    const authClient = new HardwarePosAuthClient();

    return {
        localTransactionRepository,
        localCheckoutJournalService: new LocalCheckoutJournalService({
            localTransactionRepository,
            syncJournalRepository
        }),
        pendingHistoryService: new PendingHistoryService(
            localTransactionRepository,
            syncRunRepository
        ),
        manualSyncService: new ManualSyncService({
            deviceId: input.deviceId,
            localTransactionRepository,
            syncJournalRepository,
            syncPolicyRepository,
            syncRunRepository,
            mobilePosSyncApi: mutableSyncApi
        }),
        mobilePosClient: mutableSyncApi.getClient(),
        storageMode: 'sqlite',
        syncPolicyRepository,
        runtimeStateService,
        authClient,
        configureMobileClient(config: MobilePosClientConfig | null) {
            const nextClient = config ? new MobilePosClient(config) : null;
            mutableSyncApi.setClient(nextClient);
            return nextClient;
        },
        getMobilePosClient() {
            return mutableSyncApi.getClient();
        }
    };
};

const createInMemoryDependencies = (input: {
    deviceId: string;
    clientConfig?: MobilePosClientConfig | null;
}): HardwarePosDependencies => {
    const localTransactionRepository = new InMemoryLocalTransactionRepository();
    const syncJournalRepository = new InMemorySyncJournalRepository();
    const syncPolicyRepository = new InMemorySyncPolicyRepository(defaultSyncPolicy());
    const syncRunRepository = new InMemorySyncRunRepository();
    const mutableSyncApi = new MutableMobilePosSyncApi(
        input.clientConfig ? new MobilePosClient(input.clientConfig) : null
    );
    const authClient = new HardwarePosAuthClient();

    return {
        localTransactionRepository,
        localCheckoutJournalService: new LocalCheckoutJournalService({
            localTransactionRepository,
            syncJournalRepository
        }),
        pendingHistoryService: new PendingHistoryService(
            localTransactionRepository,
            syncRunRepository
        ),
        manualSyncService: new ManualSyncService({
            deviceId: input.deviceId,
            localTransactionRepository,
            syncJournalRepository,
            syncPolicyRepository,
            syncRunRepository,
            mobilePosSyncApi: mutableSyncApi
        }),
        mobilePosClient: mutableSyncApi.getClient(),
        storageMode: 'memory',
        syncPolicyRepository,
        runtimeStateService: null,
        authClient,
        configureMobileClient(config: MobilePosClientConfig | null) {
            const nextClient = config ? new MobilePosClient(config) : null;
            mutableSyncApi.setClient(nextClient);
            return nextClient;
        },
        getMobilePosClient() {
            return mutableSyncApi.getClient();
        }
    };
};

let dependenciesPromise: Promise<HardwarePosDependencies> | null = null;

export const initializeHardwarePosDependencies = (input: {
    deviceId: string;
    clientConfig?: MobilePosClientConfig | null;
}): Promise<HardwarePosDependencies> => {
    if (!dependenciesPromise) {
        dependenciesPromise = (async () => {
            if (isStandalonePosSqliteAvailable()) {
                try {
                    return await createSqliteDependencies(input);
                } catch (error) {
                    console.warn(
                        'Standalone POS SQLite initialization failed. Falling back to in-memory runtime.',
                        error
                    );
                }
            }

            return createInMemoryDependencies(input);
        })().catch((error) => {
            dependenciesPromise = null;
            throw error;
        });
    }

    return dependenciesPromise;
};
