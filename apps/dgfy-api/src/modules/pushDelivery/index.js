import { pushDeviceTokenRepository, pushDeliveryLogRepository } from './repositories/pushDeviceTokenRepository.js';
import { staffPushAudienceRepository } from './repositories/staffPushAudienceRepository.js';
import { resolvePushAdapter } from './adapters/index.js';
import {
    buildDeleteAccountPushTokenUseCase,
    buildRegisterAccountPushTokenUseCase,
    buildDeleteGuestPushTokenUseCase,
    buildRegisterGuestPushTokenUseCase,
    buildDeleteStaffPushTokenUseCase,
    buildRegisterStaffPushTokenUseCase,
} from './usecases/pushTokenUseCases.js';
import { buildDispatchOrderStatusPushUseCase } from './usecases/dispatchOrderStatusPushUseCase.js';
import { buildDispatchStaffNewOnlineOrderPushUseCase } from './usecases/dispatchStaffNewOnlineOrderPushUseCase.js';
import { buildProcessPushReceiptsUseCase } from './usecases/processPushReceiptsUseCase.js';
import { resolveMovementLocation } from '../../services/locationInventoryService.js';

const orderStatusPush = buildDispatchOrderStatusPushUseCase({
    deviceRepository: pushDeviceTokenRepository,
    logRepository: pushDeliveryLogRepository,
    adapterResolver: resolvePushAdapter
});

const staffNewOnlineOrderPush = buildDispatchStaffNewOnlineOrderPushUseCase({
    deviceRepository: pushDeviceTokenRepository,
    logRepository: pushDeliveryLogRepository,
    audienceRepository: staffPushAudienceRepository,
    adapterResolver: resolvePushAdapter,
    resolveLocation: resolveMovementLocation
});

export const registerAccountPushTokenUseCase = buildRegisterAccountPushTokenUseCase({ repository: pushDeviceTokenRepository });
export const deleteAccountPushTokenUseCase = buildDeleteAccountPushTokenUseCase({ repository: pushDeviceTokenRepository });
export const registerStaffPushTokenUseCase = buildRegisterStaffPushTokenUseCase({ repository: pushDeviceTokenRepository });
export const deleteStaffPushTokenUseCase = buildDeleteStaffPushTokenUseCase({ repository: pushDeviceTokenRepository });

export const dispatchAccountOrderStatusPush = (activity, options) => orderStatusPush.dispatchAccount(activity, options);
export const dispatchGuestOrderStatusPush = (activity) => orderStatusPush.dispatchGuest(activity);
export const dispatchStaffNewOnlineOrderPush = (payload) => staffNewOnlineOrderPush(payload);
export const revokeGuestOrderPushTokens = (input) => pushDeviceTokenRepository.revokeGuestOrderTokens(input);
export const revokeStaffPushTokensForUser = (input) => pushDeviceTokenRepository.revokeStaffTokensForUser(input);
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
    buildRegisterStaffPushTokenUseCase,
    buildDeleteStaffPushTokenUseCase,
    buildDispatchStaffNewOnlineOrderPushUseCase,
    buildProcessPushReceiptsUseCase
};

export default {
    registerAccountPushTokenUseCase,
    deleteAccountPushTokenUseCase,
    dispatchAccountOrderStatusPush,
    dispatchGuestOrderStatusPush,
    dispatchStaffNewOnlineOrderPush,
    revokeGuestOrderPushTokens,
    revokeStaffPushTokensForUser,
    processPushReceiptsUseCase
};
