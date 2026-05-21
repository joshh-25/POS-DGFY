import {
  onboardingBulkItemsSchema,
  onboardingEventSchema,
  onboardingStepSchema
} from '../src/validators/onboardingValidator.js';

describe('onboardingValidator schemas', () => {
  it('accepts known onboarding step keys', () => {
    const value = onboardingStepSchema.validate({
      step_key: 'brand_assets',
      payload: { uploaded_profile_asset: false }
    });

    expect(value.error).toBeUndefined();
  });

  it('accepts primary location and bulk item step keys', () => {
    const locationValue = onboardingStepSchema.validate({
      step_key: 'primary_location',
      payload: { location_id: 1 }
    });
    const value = onboardingStepSchema.validate({
      step_key: 'bulk_items',
      payload: { created_item_ids: [1] }
    });

    expect(locationValue.error).toBeUndefined();
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

  it('accepts new onboarding event keys', () => {
    const value = onboardingEventSchema.validate({
      event_key: 'bulk_items_saved',
      metadata: { surface: 'modal' }
    });

    expect(value.error).toBeUndefined();
  });

  it('accepts row-level invalid bulk item rows so the use case can partially save', () => {
    const value = onboardingBulkItemsSchema.validate({
      rows: [
        { client_row_id: 'row-1', mode_item_preset: 'finished_product', name: 'Bread', default_sale_price: 25, location_id: 1 },
        { client_row_id: 'row-2', mode_item_preset: '', name: '', default_sale_price: '' }
      ]
    });

    expect(value.error).toBeUndefined();
  });
});
