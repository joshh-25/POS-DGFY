import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';

const normalizedTenantId = (value) => String(value || '').trim();

const expectedPosSessionPath = (tenantId) => (
    `/api/v1/dgfy/account/companies/${encodeURIComponent(normalizedTenantId(tenantId))}/pos-session`
);

const assertPosAccess = (session) => {
    const role = String(session?.role || '').trim().toLowerCase();
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const allowedRole = session?.is_master_admin === true || role === 'admin' || role === 'cashier';
    if (!allowedRole || (!permissions.includes('pos:view') && !permissions.includes('pos:transact'))) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'This DGFY account does not have POS access for the selected company.',
            { statusCode: 403 }
        );
    }
};

// A DGFY account opens POS before a tenant access token exists. This use case
// authenticates the accepted company membership first, then asks the tenant
// device service to issue a session-purpose challenge inside that tenant's
// database. It deliberately returns no tenant access or refresh token.
export const buildIssueDgfyPosDeviceChallengeUseCase = ({
    service,
    createTenantSession
} = {}) => async ({ account, tenantId, payload = {}, requestId = null } = {}) => {
    try {
        const resolvedTenantId = normalizedTenantId(tenantId);
        if (!resolvedTenantId) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Company id is required for POS device challenge.',
                { statusCode: 400 }
            );
        }
        if (String(payload.purpose || '').trim().toLowerCase() !== 'session') {
            throw new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'Only a session challenge is available before POS unlock.',
                { statusCode: 403, details: { error_code: 'POS_DEVICE_SESSION_CHALLENGE_REQUIRED' } }
            );
        }

        const session = await createTenantSession({ account, tenantId: resolvedTenantId });
        assertPosAccess(session);

        const expectedPath = expectedPosSessionPath(resolvedTenantId);
        const suppliedPath = service.canonicalRequestPath(payload.request_path);
        if (suppliedPath !== expectedPath) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'The challenge path must target the selected company POS session.',
                { statusCode: 422, details: { error_code: 'POS_DEVICE_SESSION_PATH_MISMATCH' } }
            );
        }
        if (String(payload.request_method || '').trim().toUpperCase() !== 'POST') {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'The POS session challenge method must be POST.',
                { statusCode: 422, details: { error_code: 'POS_DEVICE_SESSION_METHOD_MISMATCH' } }
            );
        }

        return ok(await service.issueChallengeForTenant({
            tenantId: resolvedTenantId,
            deviceId: payload.device_id,
            terminalId: payload.terminal_id,
            purpose: 'session',
            requestPath: expectedPath,
            requestMethod: 'POST',
            sessionId: payload.session_id,
            actorUserId: session.user_id,
            requestId
        }), 'DGFY POS device session challenge issued.');
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Unable to issue the DGFY POS device session challenge.'));
    }
};

export default {
    buildIssueDgfyPosDeviceChallengeUseCase
};
