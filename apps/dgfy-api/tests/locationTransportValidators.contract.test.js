import { jest } from '@jest/globals';
import {
  validateReceivePurchaseOrder
} from '../src/validators/purchaseOrderValidator.js';
import {
  validateCompleteJobOrder
} from '../src/validators/jobOrderValidator.js';

const createResponse = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('location transport validators contract', () => {
  it('validateReceivePurchaseOrder returns deterministic 422 payload when location_id is missing', () => {
    const req = {
      requestId: 'req-validator-po',
      body: {
        line_items: [
          { line_item_id: 1, quantity_received: 2 }
        ]
      }
    };
    const res = createResponse();
    const next = jest.fn();

    validateReceivePurchaseOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: null,
      message: 'Validation failed',
      error_code: 'VALIDATION_FAILED',
      request_id: 'req-validator-po',
      errors: expect.arrayContaining([
        expect.objectContaining({
          field: 'location_id'
        })
      ]),
      timestamp: expect.any(String)
    }));
  });

  it('validateCompleteJobOrder returns deterministic 422 payload when source/destination are missing', () => {
    const req = {
      requestId: 'req-validator-jo',
      body: {
        quantity_produced: 2
      }
    };
    const res = createResponse();
    const next = jest.fn();

    validateCompleteJobOrder(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      data: null,
      message: 'Validation failed',
      error_code: 'VALIDATION_FAILED',
      request_id: 'req-validator-jo',
      errors: expect.arrayContaining([
        expect.objectContaining({ field: 'source_location_id' }),
        expect.objectContaining({ field: 'destination_location_id' })
      ]),
      timestamp: expect.any(String)
    }));
  });
});
