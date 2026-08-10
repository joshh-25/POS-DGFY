import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { posRepository } from '../src/modules/pos/repositories/posRepository.js';

const asPlain = (value) => ({
    toJSON: () => value
});
const transaction = { LOCK: { UPDATE: 'UPDATE' } };

describe('POS delivery personnel repository', () => {
    it('lists active personnel for a branch and global personnel', async () => {
        const findAll = jest.fn().mockResolvedValue([
            asPlain({ delivery_personnel_id: 1, display_name: 'Branch Rider', location_id: 7, is_active: true })
        ]);

        await dbStore.run({ DeliveryPersonnel: { findAll } }, async () => {
            const result = await posRepository.listActiveDeliveryPersonnel({ locationId: 7, transaction });

            expect(result).toEqual([
                { delivery_personnel_id: 1, display_name: 'Branch Rider', location_id: 7, is_active: true }
            ]);
            expect(findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ is_active: true }),
                transaction
            }));
        });
    });

    it('validates an active delivery person against the order branch', async () => {
        const findOne = jest.fn().mockResolvedValue(
            asPlain({ delivery_personnel_id: 2, display_name: 'Global Rider', location_id: null, is_active: true })
        );

        await dbStore.run({ DeliveryPersonnel: { findOne } }, async () => {
            const result = await posRepository.findActiveDeliveryPersonnelById(2, {
                locationId: 7,
                transaction,
                lock: true
            });

            expect(result).toEqual({
                delivery_personnel_id: 2,
                display_name: 'Global Rider',
                location_id: null,
                is_active: true
            });
            expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ delivery_personnel_id: 2, is_active: true }),
                transaction,
                lock: 'UPDATE'
            }));
        });
    });

    it('persists assignment fields on the delivery job', async () => {
        const row = {
            update: jest.fn().mockImplementation(async (payload) => {
                Object.assign(row, payload);
                return row;
            }),
            toJSON: () => ({
                pos_transaction_id: 44,
                delivery_personnel_id: 2,
                assigned_by: 12,
                assigned_at: '2026-08-08T12:00:00.000Z'
            })
        };
        const findOne = jest.fn().mockResolvedValue(row);

        await dbStore.run({ DeliveryJob: { findOne } }, async () => {
            const result = await posRepository.assignDeliveryPersonnelToJob(44, {
                delivery_personnel_id: 2,
                assigned_by: 12,
                assigned_shift_id: 77,
                status: 'assigned',
                assigned_at: '2026-08-08T12:00:00.000Z'
            }, { transaction, lock: true });

            expect(row.update).toHaveBeenCalledWith({
                delivery_personnel_id: 2,
                assigned_by: 12,
                assigned_shift_id: 77,
                status: 'assigned',
                assigned_at: '2026-08-08T12:00:00.000Z'
            }, { transaction });
            expect(result).toMatchObject({
                pos_transaction_id: 44,
                delivery_personnel_id: 2,
                assigned_by: 12
            });
            expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
                where: { pos_transaction_id: 44 },
                transaction,
                lock: 'UPDATE'
            }));
        });
    });
});
