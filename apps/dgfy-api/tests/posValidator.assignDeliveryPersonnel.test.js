import { jest } from '@jest/globals';
import { validateAssignDeliveryPersonnel } from '../src/validators/posValidator.js';

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const run = (body) => {
    const req = { body };
    const res = mockRes();
    const next = jest.fn();
    validateAssignDeliveryPersonnel(req, res, next);
    return { req, res, next };
};

describe('POS delivery assignment validator', () => {
    // Staging regression: POS sent courier_service_name: null for Maxim and got a 422.
    it('accepts a null or empty courier_service_name for a named courier service', () => {
        for (const courierServiceName of [null, '']) {
            const { res, next } = run({
                idempotency_key: 'pos-delivery-assignment-test-1',
                delivery_personnel_name: 'Maximus',
                courier_service: 'maxim',
                courier_service_name: courierServiceName,
                courier_reference: '112312412',
                tracking_url: 'https://example.com/booking/112312412'
            });
            expect(res.status).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalledTimes(1);
        }
    });

    it('accepts an Other courier name and still rejects a non-string one', () => {
        expect(run({
            idempotency_key: 'pos-delivery-assignment-test-2',
            courier_service: 'other',
            courier_service_name: 'City Courier'
        }).next).toHaveBeenCalledTimes(1);

        const { res, next } = run({
            idempotency_key: 'pos-delivery-assignment-test-3',
            courier_service: 'other',
            courier_service_name: 42
        });
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });
});
