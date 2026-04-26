/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OnboardingSetupModal, { OnboardingReminderBanner } from '../components/OnboardingSetupModal.jsx';

const mocks = vi.hoisted(() => ({
  onboardingServiceMock: {
    completeOnboarding: vi.fn(),
    saveOnboardingStep: vi.fn(),
    trackOnboardingEvent: vi.fn()
  },
  settingsServiceMock: {
    updateSettings: vi.fn(),
    uploadStorefrontAsset: vi.fn()
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/services/onboardingService.js', () => mocks.onboardingServiceMock);
vi.mock('@/services/settingsService.js', () => mocks.settingsServiceMock);
vi.mock('sonner', () => ({
  toast: mocks.toastMock
}));

const baseOnboarding = {
  tenant_onboarding_state: 'in_progress',
  tenant_onboarding_progress: {
    step_payloads: {
      business_profile: {
        pos_business_name: 'Seeded Name'
      }
    },
    checklist_snapshot: {
      required_total: 4,
      completed_required_count: 1,
      missing_requirements: ['has_active_location', 'has_primary_storefront_location', 'has_sellable_item']
    }
  }
};

const baseUser = {
  is_master_admin: true,
  company: {
    name: 'Tenant Example'
  }
};

const renderModal = (props = {}) => render(
  <MemoryRouter>
    <OnboardingSetupModal
      open
      onboarding={baseOnboarding}
      currentUser={baseUser}
      onClose={vi.fn()}
      onRefreshUser={vi.fn()}
      {...props}
    />
  </MemoryRouter>
);

describe('OnboardingSetupModal behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardingServiceMock.trackOnboardingEvent.mockResolvedValue({ accepted: true });
    mocks.onboardingServiceMock.saveOnboardingStep.mockResolvedValue({ tenant_onboarding_state: 'in_progress' });
    mocks.onboardingServiceMock.completeOnboarding.mockResolvedValue({ tenant_onboarding_state: 'completed' });
    mocks.settingsServiceMock.updateSettings.mockResolvedValue({});
    mocks.settingsServiceMock.uploadStorefrontAsset.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('tracks wizard viewed on open and prefills display name from onboarding payload', async () => {
    renderModal();

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.trackOnboardingEvent).toHaveBeenCalledWith({
        eventKey: 'wizard_viewed',
        metadata: { surface: 'modal' }
      });
    });

    expect(screen.getByLabelText(/POS business display name/i).value).toBe('Seeded Name');
  });

  it('saves business profile step then allows skipping optional assets', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.clear(screen.getByLabelText(/POS business display name/i));
    await user.type(screen.getByLabelText(/POS business display name/i), 'Tenant Setup Name');
    await user.click(screen.getByRole('button', { name: /Save and Continue/i }));

    await waitFor(() => {
      expect(mocks.settingsServiceMock.updateSettings).toHaveBeenCalledWith({ pos_business_name: 'Tenant Setup Name' });
      expect(mocks.onboardingServiceMock.saveOnboardingStep).toHaveBeenCalledWith({
        stepKey: 'business_profile',
        payload: { pos_business_name: 'Tenant Setup Name' }
      });
    });

    await user.click(screen.getByRole('button', { name: /Skip for Now/i }));

    await waitFor(() => {
      expect(mocks.onboardingServiceMock.trackOnboardingEvent).toHaveBeenCalledWith({
        eventKey: 'optional_asset_skipped',
        metadata: { surface: 'modal' }
      });
      expect(screen.getByText(/3\) Required Readiness Checks/i)).toBeTruthy();
    });
  });
});

describe('OnboardingReminderBanner behavior', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders progress and action when onboarding is incomplete', () => {
    const onOpenWizard = vi.fn();
    render(<OnboardingReminderBanner onboarding={baseOnboarding} onOpenWizard={onOpenWizard} />);
    expect(screen.getByText(/Tenant onboarding is incomplete/i)).toBeTruthy();
    expect(screen.getByText(/Completion progress: 1\/4 required checks\./i)).toBeTruthy();
  });

  it('does not render when onboarding is completed', () => {
    render(
      <OnboardingReminderBanner
        onboarding={{ ...baseOnboarding, tenant_onboarding_state: 'completed' }}
        onOpenWizard={vi.fn()}
      />
    );
    expect(screen.queryByText(/Tenant onboarding is incomplete/i)).toBeNull();
  });
});
