import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import { isAdminLikeRole } from '../../../config/userRoles.js';

const authenticatedUserId = (user) => Number.parseInt(user?.user_id, 10) || null;

const requireUser = (user) => {
    const userId = authenticatedUserId(user);
    if (!userId) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required.', { statusCode: 401 });
    }
    return userId;
};

const requireAdministrator = (user) => {
    const userId = requireUser(user);
    const isMasterAdmin = user?.is_master_admin === true
        || user?.is_master_admin === 1
        || user?.is_master_admin === '1';
    if (!isMasterAdmin && !isAdminLikeRole(user?.role)) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'An authenticated tenant administrator is required for POS device administration.',
            { statusCode: 403, details: { error_code: 'POS_DEVICE_ADMIN_REQUIRED' } }
        );
    }
    return userId;
};

export const buildIssuePosDeviceActivationUseCase = ({ service } = {}) => async ({ tenantId, payload = {}, user, requestId } = {}) => {
    try {
        const userId = requireAdministrator(user);
        return ok(await service.issueActivationCode({
            tenantId,
            terminalId: payload.terminal_id,
            locationId: payload.location_id,
            issuedBy: userId,
            reason: payload.reason,
            requestId
        }), 'POS device activation code issued.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to issue a POS device activation code.'));
    }
};

export const buildActivatePosDeviceUseCase = ({ service, allowAnonymous = false } = {}) => async ({ tenantId, payload = {}, user, requestId } = {}) => {
    try {
        const userId = allowAnonymous ? authenticatedUserId(user) : requireUser(user);
        return ok(await service.activateDevice({
            tenantId,
            activationCode: payload.activation_code,
            deviceId: payload.device_id,
            publicKey: payload.public_key,
            keyAlgorithm: payload.key_algorithm,
            clientType: payload.client_type,
            terminalId: payload.terminal_id,
            locationId: payload.location_id,
            actorUserId: userId,
            reason: payload.reason,
            requestId
        }), 'POS device activated.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to activate the POS device.'));
    }
};

// The one-use activation code is the bootstrap credential for a strict terminal:
// first enrollment must be possible before a POS session (and therefore before
// authenticate) exists. The service still binds the audit actor to the
// administrator who issued the code and rejects anonymous replacement.
export const buildActivatePosDeviceBootstrapUseCase = ({ service } = {}) => (
    buildActivatePosDeviceUseCase({ service, allowAnonymous: true })
);

export const buildListPosDevicesUseCase = ({ service } = {}) => async ({ tenantId, query = {}, user } = {}) => {
    try {
        requireAdministrator(user);
        return ok({ devices: await service.listDevices({
            tenantId,
            terminalId: query.terminal_id,
            includeInactive: query.include_inactive !== false
        }) }, 'POS devices retrieved.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to list POS devices.'));
    }
};

export const buildRevokePosDeviceUseCase = ({ service } = {}) => async ({ tenantId, enrollmentId, payload = {}, user, requestId } = {}) => {
    try {
        const userId = requireAdministrator(user);
        return ok(await service.revokeDevice({
            tenantId,
            enrollmentId,
            actorUserId: userId,
            reason: payload.reason,
            requestId
        }), 'POS device revoked.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to revoke the POS device.'));
    }
};

export const buildReplacePosDeviceUseCase = ({ service } = {}) => async ({ tenantId, enrollmentId, payload = {}, user, requestId } = {}) => {
    try {
        const userId = requireAdministrator(user);
        return ok(await service.replaceDevice({
            tenantId,
            enrollmentId,
            activationCode: payload.activation_code,
            deviceId: payload.device_id,
            publicKey: payload.public_key,
            keyAlgorithm: payload.key_algorithm,
            clientType: payload.client_type,
            terminalId: payload.terminal_id,
            locationId: payload.location_id,
            actorUserId: userId,
            reason: payload.reason,
            requestId
        }), 'POS device replaced.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to replace the POS device.'));
    }
};

export const buildIssuePosDeviceChallengeUseCase = ({ service } = {}) => async ({ tenantId, payload = {}, user = null, requestId } = {}) => {
    try {
        return ok(await service.issueChallenge({
            tenantId,
            deviceId: payload.device_id,
            terminalId: payload.terminal_id,
            purpose: payload.purpose,
            requestPath: payload.request_path,
            requestMethod: payload.request_method,
            sessionId: payload.session_id,
            actorUserId: authenticatedUserId(user),
            requestId
        }), 'POS device challenge issued.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to issue the POS device challenge.'));
    }
};

export const buildVerifyPosDeviceProofUseCase = ({ service } = {}) => async ({ tenantId, payload = {}, request, requestId } = {}) => {
    try {
        const body = payload.request_body !== undefined
            ? payload.request_body
            : (request?.body && typeof request.body === 'object' ? request.body : null);
        return ok(await service.verifyDeviceProof({
            tenantId,
            deviceId: payload.device_id,
            terminalId: payload.terminal_id,
            challenge: payload.challenge,
            signature: payload.signature,
            sessionId: payload.session_id,
            purpose: payload.purpose,
            method: payload.request_method || request?.method || 'POST',
            path: payload.request_path || request?.originalUrl || request?.path || '/',
            locationId: payload.location_id,
            body,
            requestId
        }), 'POS device proof verified.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to verify the POS device proof.'));
    }
};

export default {
    buildIssuePosDeviceActivationUseCase,
    buildActivatePosDeviceUseCase,
    buildActivatePosDeviceBootstrapUseCase,
    buildListPosDevicesUseCase,
    buildRevokePosDeviceUseCase,
    buildReplacePosDeviceUseCase,
    buildIssuePosDeviceChallengeUseCase,
    buildVerifyPosDeviceProofUseCase
};
