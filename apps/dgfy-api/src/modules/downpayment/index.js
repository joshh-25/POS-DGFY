import { downpaymentSettingsRepository } from './repositories/downpaymentSettingsRepository.js';
import { buildGetDownpaymentSettingsUseCase, buildUpdateDownpaymentSettingsUseCase } from './usecases/downpaymentSettingsUseCases.js';

export const getDownpaymentSettingsUseCase = buildGetDownpaymentSettingsUseCase({
    repository: downpaymentSettingsRepository
});

export const updateDownpaymentSettingsUseCase = buildUpdateDownpaymentSettingsUseCase({
    repository: downpaymentSettingsRepository
});

export { downpaymentSettingsRepository };
