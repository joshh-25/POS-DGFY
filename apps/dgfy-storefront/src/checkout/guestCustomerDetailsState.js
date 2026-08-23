export const createBlankGuestCustomerIdentity = () => ({
  firstName: '',
  lastName: '',
  name: '',
  phone: '',
  email: ''
});

export const shouldHydrateSavedGuestCustomerDetails = ({
  isDgfyCustomerSignedIn = false,
  guestCheckoutUnlocked = false,
  hasSavedCustomerDetails = false,
  isUsingDifferentGuestDetails = false
} = {}) => (
  !isDgfyCustomerSignedIn
  && guestCheckoutUnlocked
  && hasSavedCustomerDetails
  && !isUsingDifferentGuestDetails
);
