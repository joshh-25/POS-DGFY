import { getSmsDeliveryLogRetentionDays } from '../adapters/index.js';
import { smsDeliveryLogRepository } from '../repositories/smsDeliveryLogRepository.js';

const REDACTION_BATCH_SIZE = 1000;
const MAX_REDACTION_BATCHES_PER_RUN = 100;

export const redactExpiredSmsDeliveryPiiUseCase = async ({ repository = smsDeliveryLogRepository, now = new Date(), days = getSmsDeliveryLogRetentionDays() } = {}) => {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  let redactedTotal = 0;
  let redactedBatch = 0;
  let batchCount = 0;

  do {
    redactedBatch = await repository.redactPiiOlderThan(cutoff, { limit: REDACTION_BATCH_SIZE });
    redactedTotal += redactedBatch;
    batchCount += 1;
  } while (redactedBatch === REDACTION_BATCH_SIZE && batchCount < MAX_REDACTION_BATCHES_PER_RUN);

  return redactedTotal;
};

export default redactExpiredSmsDeliveryPiiUseCase;
