import { jest } from '@jest/globals';
import { ShiftRepository } from '../../../../src/modules/shifts/repositories/shiftRepository.js';

describe('ShiftRepository.findOpenShift', () => {
    let mockTenantConnector;
    let mockBusinessDatabaseRegistryRepository;
    let mockCashDrawerEventRepository;
    let shiftRepository;

    beforeEach(() => {
        mockCashDrawerEventRepository = {};

        mockBusinessDatabaseRegistryRepository = {
            findByBusinessId: jest.fn()
        };

        mockTenantConnector = {
            getModels: jest.fn()
        };

        shiftRepository = new ShiftRepository({
            tenantConnector: mockTenantConnector,
            businessDatabaseRegistryRepository: mockBusinessDatabaseRegistryRepository,
            cashDrawerEventRepository: mockCashDrawerEventRepository
        });
    });

    it('should return the open shift for a (terminal, cashier) pair', async () => {
        const mockShiftModel = {
            findOne: jest.fn()
        };

        mockBusinessDatabaseRegistryRepository.findByBusinessId.mockResolvedValue({
            database_name: 'dgfy_business_1',
            status: 'active',
            verified_at: new Date()
        });

        mockTenantConnector.getModels.mockReturnValue({
            Shift: mockShiftModel
        });

        const mockShiftRecord = {
            id: 1,
            business_id: 'biz-1',
            terminal_id: 'term-1',
            cashier_account_id: 10,
            status: 'open',
            opened_at: new Date(),
            get: jest.fn(function() {
                return this;
            })
        };

        mockShiftModel.findOne.mockResolvedValue(mockShiftRecord);

        const result = await shiftRepository.findOpenShift('biz-1', {
            terminalId: 'term-1',
            cashierAccountId: 10
        });

        expect(result).toBeTruthy();
        expect(result.status).toBe('open');
        expect(mockShiftModel.findOne).toHaveBeenCalledWith({
            where: {
                business_id: 'biz-1',
                terminal_id: 'term-1',
                cashier_account_id: 10,
                status: 'open'
            }
        });
    });

    it('should return null when no open shift exists', async () => {
        const mockShiftModel = {
            findOne: jest.fn()
        };

        mockBusinessDatabaseRegistryRepository.findByBusinessId.mockResolvedValue({
            database_name: 'dgfy_business_1',
            status: 'active',
            verified_at: new Date()
        });

        mockTenantConnector.getModels.mockReturnValue({
            Shift: mockShiftModel
        });

        mockShiftModel.findOne.mockResolvedValue(null);

        const result = await shiftRepository.findOpenShift('biz-1', {
            terminalId: 'term-1',
            cashierAccountId: 10
        });

        expect(result).toBeNull();
    });

    it('should return null when called without required parameters', async () => {
        const result = await shiftRepository.findOpenShift('biz-1', {
            terminalId: undefined,
            cashierAccountId: 10
        });

        expect(result).toBeNull();
    });
});
