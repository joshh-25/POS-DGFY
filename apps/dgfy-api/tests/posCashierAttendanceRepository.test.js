import { describe, expect, it, jest } from '@jest/globals';
import { createPosCashierAttendanceRepository } from '../src/modules/pos/repositories/posCashierAttendanceRepository.js';

const modelWith = (overrides = {}) => ({
    create: jest.fn(async (payload) => ({ toJSON: () => payload })),
    findOne: jest.fn(async () => null),
    findOrCreate: jest.fn(async ({ defaults }) => [{ toJSON: () => defaults }, true]),
    update: jest.fn(async () => [1]),
    findByPk: jest.fn(async (id) => ({ toJSON: () => ({
        pos_transaction_id: id,
        cashier_id: 9,
        shift_id: 4,
        operator_session_id: 17,
        terminal_id: 'TERM-1',
        location_id: 2,
        secret_pin_hash: 'must-not-leak'
    }) })),
    ...overrides
});

const buildModels = () => ({
    EmployeeAttendanceSession: modelWith(),
    EmployeeBreakSegment: modelWith(),
    PosTerminalOperatorSession: modelWith(),
    PosDrawerHandoffEvent: modelWith(),
    PosTransaction: modelWith()
});

describe('POS cashier attendance persistence repository', () => {
    it('serializes storage primitives without leaking unapproved fields', async () => {
        const models = buildModels();
        const repository = createPosCashierAttendanceRepository(models);

        const result = await repository.attachOperatorSessionToTransaction({
            transactionId: 1001,
            operatorSessionId: 17
        });

        expect(result).toEqual({
            pos_transaction_id: 1001,
            cashier_id: 9,
            shift_id: 4,
            operator_session_id: 17,
            terminal_id: 'TERM-1',
            location_id: 2
        });
        expect(result).not.toHaveProperty('secret_pin_hash');
        expect(models.PosTransaction.update).toHaveBeenCalledWith(
            { operator_session_id: 17 },
            expect.objectContaining({
                where: { pos_transaction_id: 1001, operator_session_id: null }
            })
        );
    });

    it('does not collapse non-idempotent handoff events into one NULL-key record', async () => {
        const models = buildModels();
        const repository = createPosCashierAttendanceRepository(models);

        await repository.createDrawerHandoffEvent({
            pos_terminal_shift_id: 1,
            event_type: 'shared_relief_start',
            idempotency_key: null
        });

        expect(models.PosDrawerHandoffEvent.create).toHaveBeenCalledTimes(1);
        expect(models.PosDrawerHandoffEvent.findOrCreate).not.toHaveBeenCalled();
    });

    it('uses the shift-scoped idempotency key when one is supplied', async () => {
        const models = buildModels();
        const repository = createPosCashierAttendanceRepository(models);

        await repository.createDrawerHandoffEvent({
            pos_terminal_shift_id: 1,
            event_type: 'counted_custody_transfer',
            idempotency_key: 'handoff-1'
        });

        expect(models.PosDrawerHandoffEvent.findOrCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { pos_terminal_shift_id: 1, idempotency_key: 'handoff-1' }
            })
        );
        expect(models.PosDrawerHandoffEvent.create).not.toHaveBeenCalled();
    });
});
