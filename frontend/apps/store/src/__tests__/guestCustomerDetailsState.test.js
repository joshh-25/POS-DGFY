import { describe, expect, it } from 'vitest';
import {
  createBlankGuestCustomerIdentity,
  shouldHydrateSavedGuestCustomerDetails
} from '../checkout/guestCustomerDetailsState.js';

describe('guest customer details state', () => {
  it('creates a blank guest identity when a user switches to different details', () => {
    expect(createBlankGuestCustomerIdentity()).toEqual({
      firstName: '',
      lastName: '',
      name: '',
      phone: '',
      email: ''
    });
  });

  it('stops saved guest details hydration while using different details', () => {
    expect(shouldHydrateSavedGuestCustomerDetails({
      guestCheckoutUnlocked: true,
      hasSavedCustomerDetails: true,
      isUsingDifferentGuestDetails: true
    })).toBe(false);
  });

  it('allows saved guest details hydration for the default guest path', () => {
    expect(shouldHydrateSavedGuestCustomerDetails({
      guestCheckoutUnlocked: true,
      hasSavedCustomerDetails: true,
      isUsingDifferentGuestDetails: false
    })).toBe(true);
  });
});
