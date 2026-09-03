import { dgfyLaundryOrderRepository } from './repositories/dgfyLaundryOrderRepository.js';
import { dglaundryPartnerClient } from './services/dglaundryPartnerClient.js';
import { buildDgfyLaundryOrderUseCases } from './usecases/dgfyLaundryOrderUseCases.js';

export const dgfyLaundryOrderUseCases = buildDgfyLaundryOrderUseCases({
  repository: dgfyLaundryOrderRepository,
  partnerClient: dglaundryPartnerClient
});

export { dgfyLaundryOrderRepository, dglaundryPartnerClient };
