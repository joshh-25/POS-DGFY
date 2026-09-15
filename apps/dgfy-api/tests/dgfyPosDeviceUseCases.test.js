import { describe, expect, it, jest } from '@jest/globals';
import { buildIssueDgfyPosDeviceChallengeUseCase } from '../src/modules/pos/usecases/dgfyPosDeviceUseCases.js';

const account = { id: 'dgfy-account-1', email: 'owner@example.test' };
const session = {
    user_id: 17,
    role: 'admin',
    is_master_admin: true,
    permissions: ['pos:view']
};

const payload = {
    device_id: 'device-a',
    terminal_id: 'COUNTER-01',
    purpose: 'session',
    request_path: '/api/v1/dgfy/account/companies/tenant-a/pos-session',
    request_method: 'POST',
    session_id: 'sso-session-1'
};

describe('DGFY POS device session challenge use case', () => {
    it('requires an accepted POS-capable DGFY company session and issues no access token', async () => {
        const createTenantSession = jest.fn().mockResolvedValue({
            ...session,
            token: 'tenant-access-token',
            refreshToken: 'tenant-refresh-token'
        });
        const service = {
            canonicalRequestPath: (value) => value,
            issueChallengeForTenant: jest.fn().mockResolvedValue({
                challenge: 'one-use-challenge',
                session_id: payload.session_id,
                terminal_id: payload.terminal_id
            })
        };
        const useCase = buildIssueDgfyPosDeviceChallengeUseCase({ service, createTenantSession });

        const result = await useCase({ account, tenantId: 'tenant-a', payload });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
            challenge: 'one-use-challenge',
            session_id: payload.session_id,
            terminal_id: payload.terminal_id
        });
        expect(result.data).not.toHaveProperty('token');
        expect(result.data).not.toHaveProperty('refreshToken');
        expect(service.issueChallengeForTenant).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a',
            purpose: 'session',
            requestPath: payload.request_path,
            requestMethod: 'POST',
            actorUserId: 17
        }));
    });

    it('rejects non-session targets and accounts without POS permission', async () => {
        const service = {
            canonicalRequestPath: (value) => value,
            issueChallengeForTenant: jest.fn()
        };
        const createTenantSession = jest.fn().mockResolvedValue({
            user_id: 17,
            role: 'staff',
            permissions: ['items:view']
        });
        const useCase = buildIssueDgfyPosDeviceChallengeUseCase({ service, createTenantSession });

        const wrongPurpose = await useCase({ account, tenantId: 'tenant-a', payload: { ...payload, purpose: 'request' } });
        expect(wrongPurpose.success).toBe(false);
        expect(wrongPurpose.error.details.error_code).toBe('POS_DEVICE_SESSION_CHALLENGE_REQUIRED');
        expect(createTenantSession).not.toHaveBeenCalled();

        const denied = await useCase({ account, tenantId: 'tenant-a', payload });
        expect(denied.success).toBe(false);
        expect(denied.error.code).toBe('AUTHORIZATION_FAILED');
        expect(service.issueChallengeForTenant).not.toHaveBeenCalled();
    });

    it('rejects a challenge path or method that could be replayed for another entry point', async () => {
        const service = {
            canonicalRequestPath: (value) => value,
            issueChallengeForTenant: jest.fn()
        };
        const useCase = buildIssueDgfyPosDeviceChallengeUseCase({
            service,
            createTenantSession: jest.fn().mockResolvedValue(session)
        });

        const wrongPath = await useCase({
            account,
            tenantId: 'tenant-a',
            payload: { ...payload, request_path: '/api/v1/pos/catalog' }
        });
        expect(wrongPath.success).toBe(false);
        expect(wrongPath.error.details.error_code).toBe('POS_DEVICE_SESSION_PATH_MISMATCH');

        const wrongMethod = await useCase({
            account,
            tenantId: 'tenant-a',
            payload: { ...payload, request_method: 'GET' }
        });
        expect(wrongMethod.success).toBe(false);
        expect(wrongMethod.error.details.error_code).toBe('POS_DEVICE_SESSION_METHOD_MISMATCH');
        expect(service.issueChallengeForTenant).not.toHaveBeenCalled();
    });
});
