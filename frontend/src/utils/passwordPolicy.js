export const MIN_PASSWORD_LENGTH = 8;
export const GENERATED_PASSWORD_LENGTH = 16;

const READABLE_PASSWORD_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%?&';

export const isPasswordLongEnough = (password) => String(password || '').length >= MIN_PASSWORD_LENGTH;

export const generateReadablePassword = (length = GENERATED_PASSWORD_LENGTH) => {
  const normalizedLength = Math.max(MIN_PASSWORD_LENGTH, Number.parseInt(length, 10) || GENERATED_PASSWORD_LENGTH);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(normalizedLength);
    cryptoApi.getRandomValues(values);
    return Array.from(values, (value) => READABLE_PASSWORD_CHARACTERS[value % READABLE_PASSWORD_CHARACTERS.length]).join('');
  }

  return Array.from({ length: normalizedLength }, () => {
    const index = Math.floor(Math.random() * READABLE_PASSWORD_CHARACTERS.length);
    return READABLE_PASSWORD_CHARACTERS[index];
  }).join('');
};
