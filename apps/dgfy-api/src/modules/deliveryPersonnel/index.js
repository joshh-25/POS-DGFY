import { deliveryPersonnelRepository } from './repositories/deliveryPersonnelRepository.js';
import {
  buildCreateDeliveryPersonnelUseCase,
  buildListDeliveryPersonnelUseCase,
  buildUpdateDeliveryPersonnelUseCase
} from './usecases/deliveryPersonnelUseCases.js';

export const listDeliveryPersonnelUseCase = buildListDeliveryPersonnelUseCase({ repository: deliveryPersonnelRepository });
export const createDeliveryPersonnelUseCase = buildCreateDeliveryPersonnelUseCase({ repository: deliveryPersonnelRepository });
export const updateDeliveryPersonnelUseCase = buildUpdateDeliveryPersonnelUseCase({ repository: deliveryPersonnelRepository });
