import { describe, expect, it, jest } from '@jest/globals';
import {
    validateDeliveryRunCreate,
    validateDeliveryRunUpdate,
    validateDeliveryRunIdParam,
    validateDeliveryRunMemberParam,
    validateDeliveryRunPersonnelSet,
    validateDeliveryRunMembersAdd,
    validateDeliveryRunDispatch,
    validateDeliveryRunListQuery
} from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const runValidator = (validator, req) => {
    const res = mockRes();
    const next = jest.fn();
    validator(req, res, next);
    return { res, next };
};

describe('Delivery run validators (Phase 225)', () => {
    it('accepts a minimal create payload', () => {
        const req = { body: { label: 'Morning Run' } };
        const { res, next } = runValidator(validateDeliveryRunCreate, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedData).toMatchObject({ label: 'Morning Run' });
    });

    it('rejects a create payload without a label', () => {
        const req = { body: { notes: 'no label here' } };
        const { res, next } = runValidator(validateDeliveryRunCreate, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts an update payload with an allowed status', () => {
        const req = { body: { status: 'scheduled' } };
        const { res, next } = runValidator(validateDeliveryRunUpdate, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects an update payload trying to set a dispatch-owned status', () => {
        const req = { body: { status: 'dispatched' } };
        const { res, next } = runValidator(validateDeliveryRunUpdate, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects an empty update payload', () => {
        const req = { body: {} };
        const { res, next } = runValidator(validateDeliveryRunUpdate, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('validates the run id param', () => {
        const req = { params: { deliveryRunId: '7' } };
        const { res, next } = runValidator(validateDeliveryRunIdParam, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedParams.deliveryRunId).toBe(7);
    });

    it('validates the run member param pair', () => {
        const req = { params: { deliveryRunId: '7', posTransactionId: '501' } };
        const { res, next } = runValidator(validateDeliveryRunMemberParam, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedParams).toMatchObject({ deliveryRunId: 7, posTransactionId: 501 });
    });

    it('accepts a personnel-set payload with exactly one is_accountable row shape-wise (XOR enforced per row)', () => {
        const req = {
            body: {
                idempotency_key: 'set-personnel-validator-1',
                personnel: [
                    { delivery_personnel_id: 21, is_accountable: true },
                    { delivery_personnel_name: 'Backup Rider', is_accountable: false }
                ]
            }
        };
        const { res, next } = runValidator(validateDeliveryRunPersonnelSet, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects a personnel row that sends both a registered ID and a typed name', () => {
        const req = {
            body: {
                idempotency_key: 'set-personnel-validator-2',
                personnel: [
                    { delivery_personnel_id: 21, delivery_personnel_name: 'Backup Rider', is_accountable: true }
                ]
            }
        };
        const { res, next } = runValidator(validateDeliveryRunPersonnelSet, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects a personnel-set payload with no idempotency_key', () => {
        const req = {
            body: {
                personnel: [{ delivery_personnel_id: 21, is_accountable: true }]
            }
        };
        const { res, next } = runValidator(validateDeliveryRunPersonnelSet, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts a bulk members-add payload', () => {
        const req = {
            body: {
                idempotency_key: 'members-add-validator-1',
                pos_transaction_ids: [501, 502, 503]
            }
        };
        const { res, next } = runValidator(validateDeliveryRunMembersAdd, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(req.validatedData.pos_transaction_ids).toEqual([501, 502, 503]);
    });

    it('rejects a members-add payload with duplicate ids', () => {
        const req = {
            body: {
                idempotency_key: 'members-add-validator-2',
                pos_transaction_ids: [501, 501]
            }
        };
        const { res, next } = runValidator(validateDeliveryRunMembersAdd, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects a members-add payload over the 500 batch cap', () => {
        const req = {
            body: {
                idempotency_key: 'members-add-validator-3',
                pos_transaction_ids: Array.from({ length: 501 }, (_, i) => i + 1)
            }
        };
        const { res, next } = runValidator(validateDeliveryRunMembersAdd, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts a dispatch payload with just an idempotency_key', () => {
        const req = { body: { idempotency_key: 'dispatch-validator-1' } };
        const { res, next } = runValidator(validateDeliveryRunDispatch, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedData).toMatchObject({ idempotency_key: 'dispatch-validator-1' });
    });

    it('rejects a dispatch payload with no idempotency_key', () => {
        const req = { body: {} };
        const { res, next } = runValidator(validateDeliveryRunDispatch, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('rejects a dispatch payload with a too-short idempotency_key', () => {
        const req = { body: { idempotency_key: 'short' } };
        const { res, next } = runValidator(validateDeliveryRunDispatch, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('accepts an empty list query and normalizes limit/page', () => {
        const req = { query: { status: 'draft', limit: '10', page: '2' } };
        const { res, next } = runValidator(validateDeliveryRunListQuery, req);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.validatedQuery).toMatchObject({ status: 'draft', limit: 10, page: 2 });
    });

    it('rejects a list query limit above 100', () => {
        const req = { query: { limit: '500' } };
        const { res, next } = runValidator(validateDeliveryRunListQuery, req);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
