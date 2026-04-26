import { onboardingEventSchema, onboardingStepSchema } from '../src/validators/onboardingValidator.js';

describe('onboardingValidator schemas', () => {
  it('accepts known onboarding step keys', () => {
    const value = onboardingStepSchema.validate({
      step_key: 'business_profile',
      payload: { pos_business_name: 'Tenant One' }
    });

    expect(value.error).toBeUndefined();
  });

  it('rejects unknown onboarding step keys', () => {
    const value = onboardingStepSchema.validate({
      step_key: 'unexpected_step',
      payload: {}
    });

    expect(value.error).toBeDefined();
    expect(value.error.message).toMatch(/must be one of/i);
  });

  it('rejects onboarding event metadata that exceeds size limits', () => {
    const value = onboardingEventSchema.validate({
      event_key: 'wizard_viewed',
      metadata: {
        blob: 'a'.repeat(9 * 1024)
      }
    });

    expect(value.error).toBeDefined();
    expect(value.error.message).toMatch(/metadata exceeds size limit/i);
  });
});
