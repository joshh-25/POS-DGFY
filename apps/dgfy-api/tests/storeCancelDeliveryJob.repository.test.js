import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { storeRepository } from '../src/modules/store/repositories/storeRepository.js';

describe('store order delivery-job cancellation', () => {
    it('cancels an in-flight assigned job while preserving run membership and personnel', async () => {
        const row = {
            delivery_job_id: 77,
            pos_transaction_id: 903,
            provider: 'manual',
            status: 'assigned',
            delivery_run_id: 42,
            delivery_personnel_id: 11,
            update: jest.fn(async function update(payload) { Object.assign(this, payload); })
        };
        const DeliveryJob = { findOne: jest.fn().mockResolvedValue(row) };
        const transaction = { LOCK: { UPDATE: 'UPDATE' } };
        const result = await dbStore.run({ DeliveryJob }, () => (
            storeRepository.cancelDeliveryJobForOrder(903, { transaction })
        ));
        expect(result).toEqual({ delivery_job_id: 77, from: 'assigned', to: 'cancelled' });
        expect(row.update).toHaveBeenCalledWith({ status: 'cancelled' }, { transaction });
        expect(row.delivery_run_id).toBe(42);
        expect(row.delivery_personnel_id).toBe(11);
    });

    it('leaves provider-owned jobs untouched', async () => {
        const row = { provider: 'courier_partner', status: 'assigned', update: jest.fn() };
        const DeliveryJob = { findOne: jest.fn().mockResolvedValue(row) };
        const result = await dbStore.run({ DeliveryJob }, () => storeRepository.cancelDeliveryJobForOrder(903));
        expect(result).toBeNull();
        expect(row.update).not.toHaveBeenCalled();
    });
});
