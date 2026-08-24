import api from './api.js';

export const getOnboardingStatus = async () => {
  const response = await api.get('/onboarding/status');
  return response.data.data;
};

export const saveOnboardingStep = async ({ stepKey, payload = {} } = {}) => {
  const response = await api.put('/onboarding/step', {
    step_key: stepKey,
    payload
  });
  return response.data.data;
};

export const completeOnboarding = async () => {
  const response = await api.post('/onboarding/complete');
  return response.data.data;
};

export const bulkCreateOnboardingItems = async ({ rows = [] } = {}) => {
  const response = await api.post('/onboarding/items/bulk', { rows });
  return response.data.data;
};

export const trackOnboardingEvent = async ({ eventKey, metadata = {} } = {}) => {
  const response = await api.post('/onboarding/events', {
    event_key: eventKey,
    metadata
  });
  return response.data.data;
};

export default {
  getOnboardingStatus,
  saveOnboardingStep,
  completeOnboarding,
  bulkCreateOnboardingItems,
  trackOnboardingEvent
};
