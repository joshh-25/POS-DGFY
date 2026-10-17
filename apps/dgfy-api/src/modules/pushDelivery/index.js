import { pushDeviceTokenRepository, pushDeliveryLogRepository } from './repositories/pushDeviceTokenRepository.js';
import { resolvePushAdapter } from './adapters/index.js';
import {
    buildDeleteAccountPushTokenUseCase,
    buildRegisterAccountPushTokenUseCase,
    buildDeleteGuestPushTokenUseCase,
    buildRegisterGuestPushTokenUseCase,
} from './usecases/pushTokenUseCases.js';
import { buildDispatchOrderStatusPushUseCase } from './usecases/dispatchOrderStatusPushUseCase.js';
import { buildProcessPushReceiptsUseCase } from './usecases/processPushReceiptsUseCase.js';

const orderStatusPush = buildDispatchOrderStatusPushUseCase({
    deviceRepository: pushDeviceTokenRepository,
    logRepository: pushDeliveryLogRepository,
    adapterResolver: resolvePushAdapter
});

export const registerAccountPushTokenUseCase = buildRegisterAccountPushTokenUseCase({ repository: pushDeviceTokenRepository });
export const deleteAccountPushTokenUseCase = buildDeleteAccountPushTokenUseCase({ repository: pushDeviceTokenRepository });

export const dispatchAccountOrderStatusPush = (activity, options) => orderStatusPush.dispatchAccount(activity, options);
export const dispatchGuestOrderStatusPush = (activity) => orderStatusPush.dispatchGuest(activity);
export const revokeGuestOrderPushTokens = (input) => pushDeviceTokenRepository.revokeGuestOrderTokens(input);
export const processPushReceiptsUseCase = buildProcessPushReceiptsUseCase({
    repository: {
        ...pushDeliveryLogRepository,
        revokeTokenById: (...args) => pushDeviceTokenRepository.revokeTokenById(...args)
    },
    adapterResolver: resolvePushAdapter
});

export {
    pushDeviceTokenRepository,
    pushDeliveryLogRepository,
    buildRegisterAccountPushTokenUseCase,
    buildDeleteAccountPushTokenUseCase,
    buildRegisterGuestPushTokenUseCase,
    buildDeleteGuestPushTokenUseCase,
    buildDispatchOrderStatusPushUseCase,
    buildProcessPushReceiptsUseCase
};

export default {
    registerAccountPushTokenUseCase,
    deleteAccountPushTokenUseCase,
    dispatchAccountOrderStatusPush,
    dispatchGuestOrderStatusPush,
    revokeGuestOrderPushTokens,
    processPushReceiptsUseCase
};
