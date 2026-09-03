export { CHECKOUT_FONT_FAMILY as GUEST_CHECKOUT_FONT_FAMILY } from './checkoutUiTokens.js';
export const GUEST_CHECKOUT_SAVED_DETAILS_TITLE = 'Guest Check-out Saved Details';

export const getGuestCheckoutTypography = (isMobileViewport = false) => ({
  accountTitle: {
    fontSize: 18,
    lineHeight: 1.2,
    fontWeight: 700
  },
  savedDetailsTitle: {
    fontSize: isMobileViewport ? 14 : 15,
    lineHeight: 1.25,
    fontWeight: 700
  },
  identityName: {
    fontSize: isMobileViewport ? 14 : 15,
    lineHeight: 1.25,
    fontWeight: 700
  },
  identityContact: {
    fontSize: isMobileViewport ? 12 : 13,
    lineHeight: 1.4
  },
  otpTitle: {
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 700
  },
  otpBody: {
    fontSize: isMobileViewport ? 12 : 13,
    lineHeight: 1.5
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 1.35,
    fontWeight: 600
  },
  control: {
    fontSize: 13
  },
  action: {
    fontSize: 13,
    fontWeight: 600
  },
  helper: {
    fontSize: isMobileViewport ? 11 : 12,
    lineHeight: 1.45
  },
  validation: {
    fontSize: 12,
    lineHeight: 1.5
  }
});
