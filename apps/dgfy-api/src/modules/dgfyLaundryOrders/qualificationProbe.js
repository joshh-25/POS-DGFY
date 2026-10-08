import { paymongoService } from '../../services/paymongoService.js';
import {
  commercePaymentRepository,
  createCommercePaymentRefundUseCase
} from '../../commercePayments/index.js';
import { dgfyLaundryOrderRepository } from './repositories/dgfyLaundryOrderRepository.js';
import { dgfyLaundryOrderUseCases, dglaundryDurableDelivery } from './index.js';
import { buildDglaundryQualificationProbeUseCase } from './usecases/dglaundryQualificationProbeUseCase.js';

export const dglaundryQualificationProbeUseCase = buildDglaundryQualificationProbeUseCase({
  orderRepository: dgfyLaundryOrderRepository,
  mappingRepository: dgfyLaundryOrderRepository,
  orderUseCases: dgfyLaundryOrderUseCases,
  paymentRepository: commercePaymentRepository,
  paymongoService,
  createRefundUseCase: createCommercePaymentRefundUseCase,
  partnerClient: dglaundryDurableDelivery
});
