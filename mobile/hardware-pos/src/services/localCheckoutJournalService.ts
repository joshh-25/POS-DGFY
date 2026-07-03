import { buildCheckoutReplayPayload, buildLocalCheckoutRecord, type LocalCheckoutInput, type LocalTransactionRecord } from '../domain/checkout';
import type { LocalTransactionRepository, SyncJournalRepository } from '../repositories/contracts';

export interface LocalCheckoutJournalDependencies {
    localTransactionRepository: LocalTransactionRepository;
    syncJournalRepository: SyncJournalRepository;
}

export class LocalCheckoutJournalService {
    constructor(private readonly deps: LocalCheckoutJournalDependencies) {}

    async commitLocalCheckout(input: LocalCheckoutInput): Promise<LocalTransactionRecord> {
        const transaction = buildLocalCheckoutRecord(input);
        const replayEntry = buildCheckoutReplayPayload(transaction);

        await this.deps.localTransactionRepository.create(transaction);
        await this.deps.syncJournalRepository.enqueueCheckoutReplay(transaction, replayEntry);

        return transaction;
    }
}
