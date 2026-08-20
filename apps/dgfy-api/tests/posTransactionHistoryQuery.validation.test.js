import { describe, expect, it, jest } from '@jest/globals';
import { validatePosTransactionsQuery } from '../src/validators/posValidator.js';

describe('POS transaction history query validation', () => {
    it('accepts cashier names and Employee Credit payment filters', () => {
        const req = {
            query: {
                cashier_name: 'Hernando',
                payment_type: 'employee_credit'
            }
        };
        const next = jest.fn();
        const res = {
            status: jest.fn(() => res),
            json: jest.fn()
        };

        validatePosTransactionsQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery).toMatchObject({
            cashier_name: 'Hernando',
            payment_type: 'employee_credit'
        });
        expect(res.status).not.toHaveBeenCalled();
    });
});
