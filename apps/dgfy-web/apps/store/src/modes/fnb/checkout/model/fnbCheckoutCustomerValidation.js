export const isValidFnbCheckoutEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export const isValidPhilippineMobileNumber = (value) => {
  const normalized = String(value || '').replace(/[\s()-]/g, '');
  return /^09\d{9}$/.test(normalized) || /^\+639\d{9}$/.test(normalized);
};
