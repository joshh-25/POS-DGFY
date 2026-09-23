import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import dbStore from '../src/utils/dbStore.js';

const buildModel = () => ({
    findOne: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    update: jest.fn()
});

afterEach(() => jest.restoreAllMocks());

describe('POS split-payment repository contract', () => {
    it('uses tenant models and transaction locks for session and allocation reads', async () => {
        const sessionModel = buildModel();
        const allocationModel = buildModel();
        const serializedSnapshot = JSON.stringify({ lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] });
        sessionModel.findOne.mockResolvedValue({ toJSON: () => ({ pos_payment_session_id: 501, snapshot: serializedSnapshot }) });
        sessionModel.findByPk.mockResolvedValue({ toJSON: () => ({ pos_payment_session_id: 501, snapshot: serializedSnapshot }) });
        allocationModel.findAll.mockResolvedValue([{ toJSON: () => ({ pos_payment_allocation_id: 701 }) }]);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosPaymentSession') return sessionModel;
            if (name === 'PosPaymentAllocation') return allocationModel;
            throw new Error(`Unexpected model ${name}`);
        });

        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const session = await posRepository.findPosPaymentSessionByIdempotencyKey('split-session-001', { transaction, lock: true });
        const sessionById = await posRepository.getPosPaymentSessionById(501, { transaction, lock: true });
        const allocations = await posRepository.listPosPaymentAllocationsForSession(501, { transaction, lock: true });

        expect(session).toEqual({
            pos_payment_session_id: 501,
            snapshot: { lines: [{ item_id: 36, quantity: 1, sale_price: 90 }] }
        });
        expect(sessionById.snapshot.lines).toEqual([{ item_id: 36, quantity: 1, sale_price: 90 }]);
        expect(allocations).toEqual([{ pos_payment_allocation_id: 701 }]);
        expect(sessionModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { idempotency_key: 'split-session-001' }, transaction, lock: 'UPDATE'
        }));
        expect(allocationModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: { session_id: 501 }, transaction, lock: 'UPDATE'
        }));
    });

    it('returns existing rows on unique-key races for sessions and allocations', async () => {
        const sessionModel = buildModel();
        const allocationModel = buildModel();
        const sessionError = new Error('duplicate session');
        sessionError.name = 'SequelizeUniqueConstraintError';
        const allocationError = new Error('duplicate allocation');
        allocationError.name = 'SequelizeUniqueConstraintError';
        sessionModel.create.mockRejectedValue(sessionError);
        allocationModel.create.mockRejectedValue(allocationError);
        sessionModel.findOne.mockResolvedValue({ toJSON: () => ({ pos_payment_session_id: 501 }) });
        allocationModel.findOne.mockResolvedValue({ toJSON: () => ({ pos_payment_allocation_id: 701 }) });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosPaymentSession') return sessionModel;
            if (name === 'PosPaymentAllocation') return allocationModel;
            throw new Error(`Unexpected model ${name}`);
        });

        const session = await posRepository.createPosPaymentSession({ idempotency_key: 'split-session-001' }, { transaction: { id: 'tx-1' } });
        const allocation = await posRepository.createPosPaymentAllocation({ session_id: 501, idempotency_key: 'split-allocation-001' }, { transaction: { id: 'tx-1' } });

        expect(session).toEqual({ pos_payment_session_id: 501 });
        expect(allocation).toEqual({ pos_payment_allocation_id: 701 });
        expect(allocationModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { session_id: 501, idempotency_key: 'split-allocation-001' }
        }));
    });

    it('cancels only empty in-flight sessions before shift close', async () => {
        const sessionModel = buildModel();
        const allocationModel = buildModel();
        const emptySession = {
            pos_payment_session_id: 501,
            status: 'open',
            total_amount: 90,
            paid_amount: 0,
            remaining_amount: 90
        };
        const sessionRow = {
            toJSON: () => ({ ...emptySession }),
            update: jest.fn(async (payload) => {
                Object.assign(emptySession, payload);
            })
        };
        sessionModel.findAll.mockResolvedValue([sessionRow]);
        sessionModel.findByPk.mockResolvedValue(sessionRow);
        allocationModel.findAll.mockResolvedValue([]);
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosPaymentSession') return sessionModel;
            if (name === 'PosPaymentAllocation') return allocationModel;
            throw new Error(`Unexpected model ${name}`);
        });

        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const cancelled = await posRepository.cancelEmptyInFlightPaymentSessionsForShift(41, {
            transaction,
            lock: true,
            cancelledBy: 17
        });

        expect(cancelled).toEqual([expect.objectContaining({
            pos_payment_session_id: 501,
            status: 'cancelled',
            cancelled_by: 17,
            paid_amount: 0,
            remaining_amount: 90
        })]);
        expect(sessionRow.update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'cancelled',
            cancelled_by: 17,
            cancel_reason: expect.stringContaining('empty split-payment session')
        }), { transaction });
        expect(sessionModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                shift_id: 41,
                status: { [Op.in]: ['open', 'partially_paid', 'ready_to_complete'] }
            }),
            transaction,
            lock: 'UPDATE'
        }));
        expect(allocationModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: { session_id: 501 },
            transaction,
            lock: 'UPDATE'
        }));
    });
});
