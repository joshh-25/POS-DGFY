import { dgfyLaundryOrderRepository } from './repositories/dgfyLaundryOrderRepository.js';
import { dglaundryPartnerClient } from './services/dglaundryPartnerClient.js';
import { buildDglaundryDurableDelivery } from './services/dglaundryDurableDelivery.js';
import { dgfyLaundryOutboxRepository } from './repositories/dgfyLaundryOutboxRepository.js';
import { dgfyLaundryRepository } from '../dgfyLaundry/repositories/dgfyLaundryRepository.js';
import { buildDgfyLaundryOrderUseCases } from './usecases/dgfyLaundryOrderUseCases.js';

export const dglaundryDurableDelivery = buildDglaundryDurableDelivery({
  repository: dgfyLaundryOutboxRepository,
  transportClient: dglaundryPartnerClient,
  mappingRepository: dgfyLaundryOrderRepository
});

export const dgfyLaundryOrderUseCases = buildDgfyLaundryOrderUseCases({
  repository: dgfyLaundryOrderRepository,
  partnerClient: dglaundryDurableDelivery,
  operatorRepository: dgfyLaundryRepository
});

export { dgfyLaundryOrderRepository, dgfyLaundryOutboxRepository, dglaundryPartnerClient };
