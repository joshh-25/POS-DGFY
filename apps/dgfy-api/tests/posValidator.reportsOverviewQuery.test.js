import { jest } from '@jest/globals';
import {
    validatePosReportsQuery,
    validatePosReportsBreakdownQuery,
    validatePosReportsExportQuery
} from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('POS reports overview query validator', () => {
    it('accepts a valid date range with optional filters', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                granularity: 'daily',
                cashier_id: '4',
                payment_type: 'cash',
                source: 'in_store',
                category: 'beverages'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(res.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.date_from).toBeInstanceOf(Date);
        expect(req.validatedQuery.granularity).toBe('daily');
        expect(req.validatedQuery.cashier_id).toBe(4);
    });

    it('defaults granularity to daily when omitted', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.granularity).toBe('daily');
    });

    it('rejects a request missing date_from/date_to', () => {
        const req = { query: { granularity: 'daily' } };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalled();
    });

    it('rejects date_to earlier than date_from', () => {
        const req = {
            query: {
                date_from: '2026-07-06',
                date_to: '2026-07-01'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an unsupported granularity value', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                granularity: 'hourly'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an unsupported source filter value', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                source: 'marketplace'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an unsupported payment_type filter value', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                payment_type: 'crypto'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});

describe('POS reports export query validator', () => {
    it('accepts a valid export request and defaults section/format', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsExportQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.section).toBe('daily');
        expect(req.validatedQuery.format).toBe('csv');
    });

    it('accepts the transaction-level sales export section', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                section: 'sales'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsExportQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.section).toBe('sales');
    });

    it('accepts the Employee Credit activity export section', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                section: 'employee_credit'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsExportQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.section).toBe('employee_credit');
    });

    it('rejects an unsupported section value', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                section: 'inventory'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsExportQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});

describe('POS report breakdown query validator', () => {
    it('accepts a breakdown with filters and normalizes numeric pagination', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                breakdown: 'items',
                location_id: '12',
                page: '2',
                limit: '100',
                sort_by: 'sku',
                sort_direction: 'desc'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsBreakdownQuery(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedQuery.breakdown).toBe('items');
        expect(req.validatedQuery.location_id).toBe(12);
        expect(req.validatedQuery.page).toBe(2);
        expect(req.validatedQuery.limit).toBe(100);
        expect(req.validatedQuery.sort_by).toBe('sku');
    });

    it('rejects unsupported breakdown and sort values', () => {
        const req = {
            query: {
                date_from: '2026-07-01',
                date_to: '2026-07-06',
                breakdown: 'daily',
                sort_by: 'customer_email'
            }
        };
        const res = mockRes();
        const next = jest.fn();

        validatePosReportsBreakdownQuery(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
