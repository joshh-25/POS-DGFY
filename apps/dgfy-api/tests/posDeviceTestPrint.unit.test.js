import { describe, expect, it, jest } from '@jest/globals';
import { buildTestPosPrinterUseCase } from '../src/modules/pos/usecases/posDeviceUseCases.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const buildPosRepositoryStub = () => ({
    createAuditLog: jest.fn().mockResolvedValue(null)
});

describe('buildTestPosPrinterUseCase', () => {
    it('dispatches a bounded test page and records the terminal setup audit event', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            testPrint: jest.fn().mockResolvedValue({
                ok: true,
                result: { printersDetected: 1 }
            })
        };
        const useCase = buildTestPosPrinterUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: {
                message: '  DGFY setup check  ',
                copies: 9,
                terminal_id: '  POS-01  '
            },
            user: { user_id: 7 },
            auditContext: {
                ipAddress: '127.0.0.1',
                userAgent: 'unit-test'
            }
        });

        expect(result).toMatchObject({
            success: true,
            data: {
                terminal_id: 'POS-01',
                copies: 2,
                driver_id: 'lan_escpos_bridge'
            }
        });
        expect(deviceDriver.testPrint).toHaveBeenCalledWith({
            message: 'DGFY setup check',
            copies: 2,
            terminal_id: 'POS-01',
            reason: 'terminal_setup_test_print'
        });
        expect(posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 7,
            entity_type: 'pos_device_test_print',
            action: 'CREATE',
            changes: expect.objectContaining({
                operation: 'test_print',
                terminal_id: 'POS-01',
                copies: 2,
                driver_id: 'lan_escpos_bridge'
            }),
            ip_address: '127.0.0.1',
            user_agent: 'unit-test'
        }));
    });

    it('returns the hardware failure and still records the failed attempt', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = {
            id: 'lan_escpos_bridge',
            testPrint: jest.fn().mockRejectedValue(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Printer bridge is not reachable',
                { statusCode: 503, details: { reason_code: 'BRIDGE_OFFLINE' } }
            ))
        };
        const useCase = buildTestPosPrinterUseCase({ posRepository, deviceDriver });

        const result = await useCase({
            payload: { terminal_id: 'POS-01' },
            user: { user_id: 7 }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.reason_code).toBe('BRIDGE_OFFLINE');
        expect(posRepository.createAuditLog).toHaveBeenCalledTimes(1);
        expect(posRepository.createAuditLog.mock.calls[0][0].changes.bridge_result).toMatchObject({
            success: false,
            reason_code: 'BRIDGE_OFFLINE'
        });
    });

    it('rejects an unauthenticated setup request before touching hardware', async () => {
        const posRepository = buildPosRepositoryStub();
        const deviceDriver = { id: 'lan_escpos_bridge', testPrint: jest.fn() };
        const useCase = buildTestPosPrinterUseCase({ posRepository, deviceDriver });

        const result = await useCase({ payload: {}, user: null });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(deviceDriver.testPrint).not.toHaveBeenCalled();
        expect(posRepository.createAuditLog).not.toHaveBeenCalled();
    });
});
