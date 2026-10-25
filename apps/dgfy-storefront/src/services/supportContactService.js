import { requestJson } from './requestJson.js';

export const getPublicStorefrontSupportContact = async () => {
  const data = await requestJson('/api/v1/public/support-contact', {
    cache: 'no-store',
    credentials: 'omit'
  });
  return {
    email: typeof data?.email === 'string' && data.email.trim() ? data.email.trim() : null
  };
};
