import { jest } from '@jest/globals';
import { validateEmployeeCreditRepayment } from '../src/validators/posValidator.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const validate = (body) => {
  const req = { body };
  const res = mockRes();
  const next = jest.fn();
  validateEmployeeCreditRepayment(req, res, next);
  return { req, res, next };
};

describe('Employee Credit repayment validator', () => {
  it('accepts Repay All with an account version', () => {
    const { req, res, next } = validate({
      repay_all: true,
      expected_version: 2,
      reason: 'Final payroll repayment',
      idempotency_key: 'employee-credit-repay-all-001'
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData).toMatchObject({ repay_all: true, expected_version: 2 });
    expect(req.validatedData.amount).toBeUndefined();
  });

  it('continues accepting manual partial repayments without a version', () => {
    const { req, res, next } = validate({
      amount: 40,
      reason: 'Partial cash repayment',
      idempotency_key: 'employee-credit-partial-001'
    });

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validatedData).toMatchObject({ amount: 40 });
    expect(req.validatedData.repay_all).toBeUndefined();
  });

  it('rejects Repay All without the expected account version', () => {
    const { res, next } = validate({
      repay_all: true,
      reason: 'Final payroll repayment',
      idempotency_key: 'employee-credit-repay-all-002'
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('rejects requests that include both a manual amount and Repay All', () => {
    const { res, next } = validate({
      amount: 125,
      repay_all: true,
      expected_version: 2,
      reason: 'Invalid mixed repayment',
      idempotency_key: 'employee-credit-repay-all-003'
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });
});
