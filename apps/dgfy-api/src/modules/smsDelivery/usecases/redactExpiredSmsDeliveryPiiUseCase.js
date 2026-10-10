import { getSmsDeliveryLogRetentionDays } from '../adapters/index.js';
import { smsDeliveryLogRepository } from '../repositories/smsDeliveryLogRepository.js';

export const redactExpiredSmsDeliveryPiiUseCase = async ({ repository = smsDeliveryLogRepository, now = new Date(), days = getSmsDeliveryLogRetentionDays() } = {}) => {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return repository.redactPiiOlderThan(cutoff, { limit: 1000 });
};

export default redactExpiredSmsDeliveryPiiUseCase;
