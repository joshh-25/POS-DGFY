import { describe, expect, it, jest } from '@jest/globals';
import { validateTerminalShiftHistoryQuery } from '../src/validators/posValidator.js';

const createResponse = () => {
    const response = {};
    response.status = jest.fn(() => response);
    response.json = jest.fn(() => response);
    return response;
};

describe('POS cashier shift-history query validation', () => {
    it('accepts a trimmed search term and strips attempts to provide cashier scope', () => {
        const request = { query: { search: '  #44  ', cashier_id: '999' } };
        const response = createResponse();
        const next = jest.fn();

        validateTerminalShiftHistoryQuery(request, response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.validatedQuery).toEqual(expect.objectContaining({ search: '#44', status: 'all' }));
        expect(request.validatedQuery).not.toHaveProperty('cashier_id');
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects search terms longer than 120 characters', () => {
        const request = { query: { search: 'x'.repeat(121) } };
        const response = createResponse();
        const next = jest.fn();

        validateTerminalShiftHistoryQuery(request, response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(422);
    });
});
