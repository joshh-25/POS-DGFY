import { validateCreateTenantLocation, validateUpdateTenantLocation } from '../src/validators/tenantLocationValidator.js';
import { jest } from '@jest/globals';

// #1218 (pr-reviewer RF-1, PR #1237): the create-time Joi cross-field rule enforcing the
// two-layer 422 contract at the validator boundary, ahead of tenantLocationUseCases.js's
// merged-state assertFulfillmentLeadTimeValid. Deliberately does NOT test the same rule
// against the update schema -- the update schema must NOT enforce this cross-field rule
// (see tenantLocationValidator.js's own comment): a partial PUT touching neither lead-time
// field must succeed against a row that already has a valid lead time, which only the
// use-case layer can judge since it alone sees the persisted row. That behaviour is already
// covered end to end in tenantLocationDeliveryTimingPolicy.usecases.test.js.

const runMiddleware = (middleware, req) => {
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    const next = jest.fn();
    middleware(req, res, next);
    return { res, next };
};

const validLocationBody = () => ({
    name: 'Downtown Branch',
    address_line: '123 Main Street',
    latitude: 14.5995,
    longitude: 120.9842
});

describe('tenantLocationValidator delivery timing policy cross-field rule (#1218)', () => {
    describe('create', () => {
        it('rejects immediate_fulfillment_enabled: false with no lead time (422)', () => {
            const req = {
                body: {
                    ...validLocationBody(),
                    immediate_fulfillment_enabled: false
                }
            };
            const { res, next } = runMiddleware(validateCreateTenantLocation, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
            expect(res.payload.errors.some((error) =>
                error.message.includes('fulfillment lead time') || error.message.includes('required when immediate fulfillment is disabled')
            )).toBe(true);
        });

        it('rejects immediate_fulfillment_enabled: false with only one lead-time bound set (422)', () => {
            const req = {
                body: {
                    ...validLocationBody(),
                    immediate_fulfillment_enabled: false,
                    fulfillment_lead_time_min_days: 3
                }
            };
            const { res, next } = runMiddleware(validateCreateTenantLocation, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });

        it('rejects max < min regardless of immediate_fulfillment_enabled (422)', () => {
            const req = {
                body: {
                    ...validLocationBody(),
                    fulfillment_lead_time_min_days: 7,
                    fulfillment_lead_time_max_days: 3
                }
            };
            const { res, next } = runMiddleware(validateCreateTenantLocation, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
            expect(res.payload.errors.some((error) =>
                error.message.includes('greater than or equal to minimum')
            )).toBe(true);
        });

        it('accepts immediate_fulfillment_enabled: false with a valid min===max lead time', () => {
            const req = {
                body: {
                    ...validLocationBody(),
                    immediate_fulfillment_enabled: false,
                    fulfillment_lead_time_min_days: 3,
                    fulfillment_lead_time_max_days: 3
                }
            };
            const { res, next } = runMiddleware(validateCreateTenantLocation, req);

            expect(res.statusCode).toBe(200);
            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.fulfillment_lead_time_min_days).toBe(3);
            expect(req.validatedData.fulfillment_lead_time_max_days).toBe(3);
        });

        it('accepts a default-configured create payload (both flags default true, no lead time)', () => {
            const req = { body: validLocationBody() };
            const { res, next } = runMiddleware(validateCreateTenantLocation, req);

            expect(res.statusCode).toBe(200);
            expect(next).toHaveBeenCalledTimes(1);
            expect(req.validatedData.scheduling_enabled).toBe(true);
            expect(req.validatedData.immediate_fulfillment_enabled).toBe(true);
        });
    });

    describe('update', () => {
        it('accepts a partial PUT touching neither lead-time field nor immediate_fulfillment_enabled (validator does not judge merged state)', () => {
            const req = { body: { is_active: true } };
            const { res, next } = runMiddleware(validateUpdateTenantLocation, req);

            expect(res.statusCode).toBe(200);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('accepts a partial PUT of only immediate_fulfillment_enabled: false at the validator layer (merged-state 422 is the use case\'s job, not Joi\'s)', () => {
            const req = { body: { immediate_fulfillment_enabled: false } };
            const { res, next } = runMiddleware(validateUpdateTenantLocation, req);

            expect(res.statusCode).toBe(200);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('still rejects a self-contained invalid update payload carrying both lead-time bounds inverted at the field-level scalar bounds, leaving the range check to the use case', () => {
            // Scalar bounds (min/max 0-365) are still enforced by Joi on update; only the
            // cross-field max>=min / required-when-disabled rule is deliberately deferred.
            const req = { body: { fulfillment_lead_time_min_days: -1 } };
            const { res, next } = runMiddleware(validateUpdateTenantLocation, req);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(422);
        });
    });
});
