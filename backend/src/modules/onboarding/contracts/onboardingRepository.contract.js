const REQUIRED_METHODS = [
  'getStatus',
  'saveStep',
  'complete'
];

export const assertOnboardingRepositoryContract = (repository) => {
  if (!repository || typeof repository !== 'object') {
    throw new Error('onboardingRepository must be an object');
  }

  const missing = REQUIRED_METHODS.filter((method) => typeof repository[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`onboardingRepository missing required methods: ${missing.join(', ')}`);
  }
};

export default {
  assertOnboardingRepositoryContract
};
