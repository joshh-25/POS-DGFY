import { jest } from '@jest/globals';
import { createMobilePosOperatingScopeWrapper } from '../src/modules/pos/usecases/mobilePosOperatingScope.js';

describe('Phase 355 mobile operating scope', () => {
    test('rejected authority does not invoke the financial command or discard an entry', async () => {
        const denied = { success: false, error: { statusCode: 401, details: { reason_code: 'POS_OPERATOR_AUTHORITY_REQUIRED' } } };
        const authorizeMutation = jest.fn(async () => denied);
        const command = jest.fn();
        const wrapped = createMobilePosOperatingScopeWrapper({ repository: {}, authorizeMutation })(command, ['pos:transact']);
        const result = await wrapped({ user: { user_id: 7 }, payload: { terminal_id: 'REG-1', location_id: 1 } });
        expect(result).toBe(denied);
        expect(command).not.toHaveBeenCalled();
        expect(authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, requiredPermissions: ['pos:transact'] }));
        expect(authorizeMutation.mock.calls[0][0]).not.toHaveProperty('authorityToken');
    });
    test('legacy authorized entries preserve the existing replay command arguments', async () => {
        const command = jest.fn(async () => ({ success: true }));
        const wrapped = createMobilePosOperatingScopeWrapper({ repository: {}, authorizeMutation: async () => ({ success: true }) })(command);
        const input = { user: { user_id: 7 }, payload: { terminal_id: 'REG-1', location_id: 1 }, trustedMobileReplay: true };
        expect((await wrapped(input)).success).toBe(true);
        expect(command).toHaveBeenCalledWith(input);
    });

    test('transaction replay scope uses the target transaction location before the current shift', async () => {
        const command = jest.fn(async () => ({ success: true }));
        const authorizeMutation = jest.fn(async () => ({ success: true }));
        const repository = {
            getTransactionById: jest.fn(async () => ({
                pos_transaction_id: 91,
                terminal_id: 'REG-B',
                location_id: 2,
                shift_id: 22
            })),
            getTerminalShiftById: jest.fn(async () => ({
                pos_terminal_shift_id: 22,
                terminal_id: 'REG-B',
                location_id: 2,
                status: 'open'
            })),
            findOpenTerminalShift: jest.fn(async () => ({
                pos_terminal_shift_id: 11,
                terminal_id: 'REG-A',
                location_id: 1,
                status: 'open'
            }))
        };
        const wrapped = createMobilePosOperatingScopeWrapper({ repository, authorizeMutation })(command, ['pos:void']);

        await wrapped({
            user: { user_id: 7 },
            posTransactionId: 91,
            payload: { transaction_id: 91, shift_id: 22, terminal_id: 'REG-B', idempotency_key: 'void-91-unique' }
        });

        expect(authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({
            userId: 7,
            scope: { terminalId: 'REG-B', locationId: 2, shiftId: 22 }
        }));
        expect(repository.findOpenTerminalShift).not.toHaveBeenCalled();
        expect(command).toHaveBeenCalled();
    });

    test('transaction replay rejects an actor shift from another branch before mutation', async () => {
        const command = jest.fn();
        const authorizeMutation = jest.fn();
        const repository = {
            getTransactionById: jest.fn(async () => ({ location_id: 2, terminal_id: 'REG-B' })),
            getTerminalShiftById: jest.fn(async () => ({ location_id: 1, terminal_id: 'REG-A', status: 'open' }))
        };
        const wrapped = createMobilePosOperatingScopeWrapper({ repository, authorizeMutation })(command, ['pos:void']);

        const result = await wrapped({
            user: { user_id: 7 },
            posTransactionId: 91,
            payload: { transaction_id: 91, shift_id: 11, terminal_id: 'REG-A', idempotency_key: 'void-91-branch' }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual(expect.objectContaining({ reason_code: 'POS_OPERATOR_SCOPE_MISMATCH' }));
        expect(authorizeMutation).not.toHaveBeenCalled();
        expect(command).not.toHaveBeenCalled();
    });
});
