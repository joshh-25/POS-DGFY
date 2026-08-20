import { describe, expect, it } from 'vitest';

import {
  buildValidationDetailMessage,
  buildVoucherReasonMessage
} from '../posCheckoutErrorMessages.js';

const errorWithReasonCode = (reasonCode, status = 422) => ({
  response: {
    status,
    data: { errors: { reason_code: reasonCode } }
  }
});

// #712: before this, a voucher redemption-time reason code had NO frontend copy anywhere --
// VoucherManagementPanel.jsx's REASON_CODE_MESSAGES map only covers authoring/CRUD codes. A 422
// carrying one of these fell through to a raw `error.response.data.message`.
describe('buildVoucherReasonMessage', () => {
  it('maps known voucher redemption reason codes to friendly copy', () => {
    expect(buildVoucherReasonMessage(errorWithReasonCode('VOUCHER_NOT_FOUND')))
      .toBe('Voucher code was not found.');
    expect(buildVoucherReasonMessage(errorWithReasonCode('VOUCHER_EXPIRED')))
      .toBe('This voucher has expired.');
    expect(buildVoucherReasonMessage(errorWithReasonCode('VOUCHER_CHANNEL_NOT_ELIGIBLE')))
      .toBe("This voucher isn't enabled for in-store (POS) redemption.");
    expect(buildVoucherReasonMessage(errorWithReasonCode('VOUCHER_POS_REDEMPTION_DISABLED')))
      .toBe('Voucher redemption is not enabled for this store. Contact an admin.');
  });

  // #712's own MULTIPLE_PROMO_CODES_NOT_ALLOWED extension throws this as a 409, not a 422 -- the
  // reason-code lookup must not gate on status code, unlike the generic validation-array path.
  it('resolves a voucher reason code on a 409 conflict, not only on 422', () => {
    expect(buildVoucherReasonMessage(errorWithReasonCode('VOUCHER_DISCOUNT_SLOT_OCCUPIED', 409)))
      .toBe('Only one discount can be applied to a sale. Remove the other discount first.');
  });

  it('returns null for an unrecognized or absent reason code', () => {
    expect(buildVoucherReasonMessage(errorWithReasonCode('SOME_UNRELATED_CODE'))).toBeNull();
    expect(buildVoucherReasonMessage({})).toBeNull();
    expect(buildVoucherReasonMessage(undefined)).toBeNull();
  });
});

describe('buildValidationDetailMessage voucher integration', () => {
  it('prefers the friendly voucher reason message over the raw response message', () => {
    const error = {
      response: {
        status: 422,
        data: {
          message: 'Validation failed',
          errors: { reason_code: 'VOUCHER_BUDGET_EXHAUSTED' }
        }
      }
    };
    expect(buildValidationDetailMessage(error)).toBe("This voucher's discount budget has been used up.");
  });

  it('falls through to the raw message for a non-voucher, non-FNB validation error', () => {
    const error = {
      response: {
        status: 422,
        data: { message: 'Some other validation error' }
      }
    };
    expect(buildValidationDetailMessage(error)).toBe('Some other validation error');
  });
});
