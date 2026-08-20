import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';
import dbStore from '../src/utils/dbStore.js';

const buildModel = () => ({
    findOne: jest.fn(),
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn()
});

afterEach(() => jest.restoreAllMocks());

describe('POS transaction adjustment repository foundation', () => {
    it('reads adjustment evidence with tenant transaction locks and stable ordering', async () => {
        const adjustmentModel = buildModel();
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        adjustmentModel.findAll.mockResolvedValue([
            { toJSON: () => ({ pos_transaction_adjustment_id: 701, status: 'succeeded' }) }
        ]);
        adjustmentModel.findOne.mockImplementation(({ where }) => {
            if (where?.adjustment_reference) {
                return { toJSON: () => ({ pos_transaction_adjustment_id: 701, adjustment_reference: 'ADJ-701' }) };
            }
            return { toJSON: () => ({ pos_transaction_adjustment_id: 701, idempotency_key: 'void-1' }) };
        });
        adjustmentModel.findByPk.mockResolvedValue({
            toJSON: () => ({ pos_transaction_adjustment_id: 701, adjustment_reference: 'ADJ-701' })
        });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosTransactionAdjustment') return adjustmentModel;
            throw new Error(`Unexpected model ${name}`);
        });

        const rows = await posRepository.listPosTransactionAdjustmentsForTransaction(42, { transaction, lock: true });
        const byKey = await posRepository.findPosTransactionAdjustmentByIdempotencyKey(42, ' void-1 ', { transaction, lock: true });
        const byReference = await posRepository.findPosTransactionAdjustmentByReference('ADJ-701', { transaction, lock: true });
        const byProviderEvent = await posRepository.findPosTransactionAdjustmentByProviderEventId('evt-701', { transaction, lock: true });
        const byId = await posRepository.getPosTransactionAdjustmentById(701, { transaction, lock: true });

        expect(rows).toEqual([{ pos_transaction_adjustment_id: 701, status: 'succeeded' }]);
        expect(byKey).toEqual({ pos_transaction_adjustment_id: 701, idempotency_key: 'void-1' });
        expect(byReference).toEqual({ pos_transaction_adjustment_id: 701, adjustment_reference: 'ADJ-701' });
        expect(byProviderEvent).toEqual({ pos_transaction_adjustment_id: 701, idempotency_key: 'void-1' });
        expect(byId).toEqual({ pos_transaction_adjustment_id: 701, adjustment_reference: 'ADJ-701' });
        expect(adjustmentModel.findAll).toHaveBeenCalledWith(expect.objectContaining({
            where: { pos_transaction_id: 42 },
            transaction,
            lock: 'UPDATE',
            order: [['created_at', 'ASC'], ['pos_transaction_adjustment_id', 'ASC']]
        }));
        expect(adjustmentModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { pos_transaction_id: 42, idempotency_key: 'void-1' },
            transaction,
            lock: 'UPDATE'
        }));
    });

    it('returns the existing adjustment when a unique idempotency race occurs', async () => {
        const adjustmentModel = buildModel();
        const duplicate = new Error('duplicate adjustment');
        duplicate.name = 'SequelizeUniqueConstraintError';
        adjustmentModel.create.mockRejectedValue(duplicate);
        adjustmentModel.findOne.mockResolvedValue({
            toJSON: () => ({ pos_transaction_adjustment_id: 701, idempotency_key: 'void-1' })
        });
        jest.spyOn(dbStore, 'get').mockImplementation((name) => {
            if (name === 'PosTransactionAdjustment') return adjustmentModel;
            throw new Error(`Unexpected model ${name}`);
        });

        const transaction = { id: 'tx-1' };
        const result = await posRepository.createPosTransactionAdjustment({
            pos_transaction_id: 42,
            idempotency_key: 'void-1'
        }, { transaction });

        expect(result).toEqual({ pos_transaction_adjustment_id: 701, idempotency_key: 'void-1' });
        expect(adjustmentModel.create).toHaveBeenCalledWith(
            { pos_transaction_id: 42, idempotency_key: 'void-1' },
            { transaction }
        );
        expect(adjustmentModel.findOne).toHaveBeenCalledWith(expect.objectContaining({
            where: { pos_transaction_id: 42, idempotency_key: 'void-1' },
            transaction
        }));
    });
});
