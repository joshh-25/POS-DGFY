import { jest } from '@jest/globals';
import { buildGetPosDeviceStatusUseCase } from '../src/modules/pos/usecases/posDeviceUseCases.js';
import { clientManagedDeviceDriver } from '../src/modules/pos/integrations/clientManagedDeviceDriver.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const buildPosRepositoryStub = () => ({
    createAuditLog: jest.fn().mockResolvedValue(null)
});

describe('getPosDeviceStatusUseCase', () => {
    it('never returns a failure when no hardware driver is configured (absence is not an error)', async () => {
        const posRepository = buildPosRepositoryStub();
        const useCase = buildGetPosDeviceStatusUseCase({ posRepository, deviceDriver: clientManagedDeviceDriver });

        const result = await useCase({ user: { user_id: 1 } });

        expect(result.success).toBe(true);
        expect(result.data.driver.id).toBe('client_managed');
        expect(result.data.hardware_required).toBe(false);
        expect(posRepository.createAuditLog).not.toHaveBeenCalled();
    });

    it('reports the resolved driver id on success', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            getStatus: jest.fn().mockResolvedValue({ ok: true, printersDetected: 1 })
        };
        const useCase = buildGetPosDeviceStatusUseCase({ posRepository, deviceDriver });

        const result = await useCase({ user: { user_id: 1 } });

        expect(result.success).toBe(true);
        expect(result.data.driver).toEqual({ id: 'lan_escpos_bridge', available: true });
        expect(result.data.bridge.printersDetected).toBe(1);
    });

    it('still fails when a driver IS configured but unreachable (a genuine fault, not absence)', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            getStatus: jest.fn().mockRejectedValue(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Device bridge is not reachable at http://127.0.0.1:5101/device/status',
                { statusCode: 503 }
            ))
        };
        const useCase = buildGetPosDeviceStatusUseCase({ posRepository, deviceDriver });

        const result = await useCase({ user: { user_id: 1 } });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
    });

    it('requires an authenticated user', async () => {
        const posRepository = buildPosRepositoryStub();
        const useCase = buildGetPosDeviceStatusUseCase({ posRepository, deviceDriver: clientManagedDeviceDriver });

        const result = await useCase({ user: null });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    });
});
