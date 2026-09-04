import { dgfyLaundryRepository } from './repositories/dgfyLaundryRepository.js';
import { buildDgfyLaundryProviderUseCases } from './usecases/dgfyLaundryProviderUseCases.js';

export const dgfyLaundryProviderUseCases = buildDgfyLaundryProviderUseCases({ repository: dgfyLaundryRepository });
export { dgfyLaundryRepository };
