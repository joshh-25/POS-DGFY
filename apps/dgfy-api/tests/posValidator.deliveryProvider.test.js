import { describe, expect, it, jest } from '@jest/globals';
import { validatePosCheckout } from '../src/validators/posValidator.js';

const runCheckoutValidator = (body) => {
    const req = { body };
    const res = {
        status: jest.fn(() => res),
        json: jest.fn(() => res)
    };
    const next = jest.fn();

    validatePosCheckout(req, res, next);
    return { req, res, next };
};

const baseDeliveryCheckout = (deliveryProviderBreakdown) => ({
    idempotency_key: 'delivery-provider-validator-001',
    order_method: 'delivery',
    payment_type: 'cash',
    delivery_provider_breakdown: deliveryProviderBreakdown,
    lines: [{ item_id: 1, quantity: 1, sale_price: 100 }]
});

describe('POS delivery provider checkout validator', () => {
    it('accepts exactly one provider row', () => {
        const result = runCheckoutValidator(baseDeliveryCheckout([
            { provider_type: 'grab', amount: 100 }
        ]));

        expect(result.res.status).not.toHaveBeenCalled();
        expect(result.next).toHaveBeenCalledTimes(1);
        expect(result.req.validatedData.delivery_provider_breakdown).toEqual([
            { provider_type: 'grab', amount: 100 }
        ]);
    });

    it('rejects a delivery checkout containing multiple provider rows', () => {
        const result = runCheckoutValidator(baseDeliveryCheckout([
            { provider_type: 'grab', amount: 60 },
            { provider_type: 'other', provider_name: 'Maxim', amount: 40 }
        ]));

        expect(result.res.status).toHaveBeenCalledWith(422);
        expect(result.next).not.toHaveBeenCalled();
    });
});
