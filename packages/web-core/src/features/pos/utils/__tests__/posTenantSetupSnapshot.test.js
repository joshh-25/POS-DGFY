import { describe, expect, it } from 'vitest';
import { buildTenantSetupStateSnapshot } from '../posTenantSetupSnapshot.js';

describe('tenant setup capability snapshot', () => {
  it('preserves the explicit POS-disabled state for selected-company hydration', () => {
    const snapshot = buildTenantSetupStateSnapshot({
      settingsPayload: {
        tenant_pos_enabled: { value: 'false' },
        tenant_onboarding_state: { value: 'completed' }
      },
      companyPayload: {},
      usersPayload: [],
      onboardingPayload: {},
      workflowMode: 'food_manufacturing'
    });

    expect(snapshot).toMatchObject({
      tenantPosEnabled: false,
      onboardingCompleted: true
    });
  });
});
