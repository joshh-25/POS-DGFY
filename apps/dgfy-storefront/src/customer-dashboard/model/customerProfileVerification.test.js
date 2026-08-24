import { describe, expect, it } from 'vitest';
import {
  getCustomerProfileVerification,
  getCustomerProfileVerificationRemainingRequirements,
  getCustomerProfileVerificationReminder
} from './customerProfileVerification.js';

describe('customer profile verification model', () => {
  it('returns the incomplete requirements for the login reminder', () => {
    const accountPanel = {
      me: {
        is_email_verified: true
      }
    };

    expect(getCustomerProfileVerification(accountPanel)).toMatchObject({
      completed: 2,
      total: 3,
      isFullyVerified: false
    });
    expect(getCustomerProfileVerificationRemainingRequirements(accountPanel)).toEqual(['Valid ID']);
    expect(getCustomerProfileVerificationReminder(accountPanel)).toMatchObject({
      title: 'Complete your profile verification',
      description: 'Remaining requirements: Valid ID.'
    });
  });

  it('returns no remaining requirements for a fully verified account', () => {
    const accountPanel = {
      me: {
        is_email_verified: true,
        id_verification_status: 'approved'
      }
    };

    expect(getCustomerProfileVerificationRemainingRequirements(accountPanel)).toEqual([]);
    expect(getCustomerProfileVerificationReminder(accountPanel)).toBeNull();
  });
});
