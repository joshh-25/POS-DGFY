import { jest } from '@jest/globals';
import { validateCompleteDirectDelivery } from '../src/validators/posValidator.js';

const validateMethod = (method) => {
  const req = { body: { idempotency_key: 'delivery-settlement-123', terminal_id: 'COUNTER-01', settlement: { amount: 100, method } } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  validateCompleteDirectDelivery(req, res, next);
  return { res, next };
};

describe('direct delivery settlement methods', () => {
  it('rejects employee credit at validation', () => {
    const { res, next } = validateMethod('employee_credit');
    expect(res.status).toHaveBeenCalledWith(422);
    expect(next).not.toHaveBeenCalled();
  });
  it.each(['cash', 'cheque'])('accepts %s', (method) => {
    const { res, next } = validateMethod(method);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
