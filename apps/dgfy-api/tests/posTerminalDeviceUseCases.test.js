import { describe, expect, it, jest } from '@jest/globals';
import {
    buildActivatePosDeviceUseCase,
    buildActivatePosDeviceBootstrapUseCase,
    buildIssuePosDeviceActivationUseCase,
    buildListPosDevicesUseCase,
    buildRevokePosDeviceUseCase,
    buildReplacePosDeviceUseCase
} from '../src/modules/pos/usecases/posTerminalDeviceUseCases.js';

const admin = { user_id: 11, role: 'admin', is_master_admin: false };
const masterAdmin = { user_id: 12, role: 'staff', is_master_admin: true };
const manager = { user_id: 13, role: 'manager', is_master_admin: false };
const cashier = { user_id: 14, role: 'cashier', is_master_admin: false };

describe('POS terminal device administration use cases', () => {
    it('restricts activation-code issue, list, revoke, and replace to administrators', async () => {
        const service = {
            issueActivationCode: jest.fn(),
            listDevices: jest.fn(),
            revokeDevice: jest.fn(),
            replaceDevice: jest.fn()
        };

        const issue = buildIssuePosDeviceActivationUseCase({ service });
        const list = buildListPosDevicesUseCase({ service });
        const revoke = buildRevokePosDeviceUseCase({ service });
        const replace = buildReplacePosDeviceUseCase({ service });

        for (const result of [
            await issue({ tenantId: 'tenant-a', payload: {}, user: manager }),
            await list({ tenantId: 'tenant-a', query: {}, user: manager }),
            await revoke({ tenantId: 'tenant-a', enrollmentId: 1, payload: {}, user: manager }),
            await replace({ tenantId: 'tenant-a', enrollmentId: 1, payload: {}, user: manager })
        ]) {
            expect(result.success).toBe(false);
            expect(result.error.details.error_code).toBe('POS_DEVICE_ADMIN_REQUIRED');
        }
        expect(service.issueActivationCode).not.toHaveBeenCalled();
        expect(service.listDevices).not.toHaveBeenCalled();
        expect(service.revokeDevice).not.toHaveBeenCalled();
        expect(service.replaceDevice).not.toHaveBeenCalled();
    });

    it('accepts tenant and master admins for administration and allows an authenticated POS operator to activate', async () => {
        const service = {
            issueActivationCode: jest.fn().mockResolvedValue({ activation_code: 'one-use-code' }),
            listDevices: jest.fn().mockResolvedValue([]),
            revokeDevice: jest.fn().mockResolvedValue({ status: 'revoked' }),
            replaceDevice: jest.fn().mockResolvedValue({ status: 'active' }),
            activateDevice: jest.fn().mockResolvedValue({ status: 'active' })
        };

        const issue = buildIssuePosDeviceActivationUseCase({ service });
        const list = buildListPosDevicesUseCase({ service });
        const revoke = buildRevokePosDeviceUseCase({ service });
        const replace = buildReplacePosDeviceUseCase({ service });
        const activate = buildActivatePosDeviceUseCase({ service });

        await expect(issue({ tenantId: 'tenant-a', payload: { terminal_id: 'COUNTER-01', reason: 'new terminal' }, user: admin })).resolves.toMatchObject({ success: true });
        await expect(list({ tenantId: 'tenant-a', query: {}, user: masterAdmin })).resolves.toMatchObject({ success: true });
        await expect(revoke({ tenantId: 'tenant-a', enrollmentId: 1, payload: { reason: 'retired' }, user: admin })).resolves.toMatchObject({ success: true });
        await expect(replace({ tenantId: 'tenant-a', enrollmentId: 1, payload: { reason: 'lost device' }, user: masterAdmin })).resolves.toMatchObject({ success: true });
        await expect(activate({ tenantId: 'tenant-a', payload: { activation_code: 'one-use-code' }, user: cashier })).resolves.toMatchObject({ success: true });

        expect(service.issueActivationCode).toHaveBeenCalledWith(expect.objectContaining({ issuedBy: 11 }));
        expect(service.listDevices).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a' }));
        expect(service.revokeDevice).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 11 }));
        expect(service.replaceDevice).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 12 }));
        expect(service.activateDevice).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 14 }));
    });

    it('allows first enrollment to bootstrap from the one-use activation code before POS authentication', async () => {
        const service = {
            activateDevice: jest.fn().mockResolvedValue({ status: 'active' })
        };
        const activateBootstrap = buildActivatePosDeviceBootstrapUseCase({ service });

        await expect(activateBootstrap({
            tenantId: 'tenant-a',
            payload: { activation_code: 'one-use-code' },
            user: null
        })).resolves.toMatchObject({ success: true });
        expect(service.activateDevice).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-a',
            actorUserId: null
        }));
    });
});
