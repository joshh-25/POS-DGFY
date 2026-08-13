import { describe, expect, it, jest } from '@jest/globals';
import { validateAssignDeliveryPersonnel } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS delivery assignment validator', () => {
    it('accepts a trimmed third-party courier name', () => {
        const req = {
            body: {
                idempotency_key: 'delivery-assignment-validator-1',
                delivery_personnel_name: '  Juan Dela Cruz  '
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateAssignDeliveryPersonnel(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData).toMatchObject({ delivery_personnel_name: 'Juan Dela Cruz' });
    });

    it('rejects a payload that sends both a registered ID and a typed name', () => {
        const req = {
            body: {
                idempotency_key: 'delivery-assignment-validator-2',
                delivery_personnel_id: 21,
                delivery_personnel_name: 'Juan Dela Cruz'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validateAssignDeliveryPersonnel(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });
});
