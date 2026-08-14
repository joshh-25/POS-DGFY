/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from '../../../../../../apps/dgfy-web/Layout.jsx';

const mocks = vi.hoisted(() => ({
  authService: {
    getCurrentUser: vi.fn(),
    logout: vi.fn()
  },
  settingsService: {
    getAllSettings: vi.fn()
  },
  store: {
    setCurrentUser: vi.fn()
  },
  permission: {
    can: vi.fn(() => true)
  }
}));

vi.mock('../../../../src/hooks/usePermission', () => ({
  usePermission: () => ({
    can: mocks.permission.can,
    userRole: 'admin',
    loading: false
  })
}));

vi.mock('../../../../src/services/authService.js', () => mocks.authService);
vi.mock('../../../../src/services/settingsService.js', () => mocks.settingsService);
vi.mock('../../../../src/store/useStore.js', () => ({
  default: () => mocks.store
}));

vi.mock('../../../../src/features/settings/WorkflowModeContext.jsx', () => ({
  useWorkflowMode: () => ({
    workflowMode: 'msme',
    modeChangeNotice: null,
    dismissModeChangeNotice: vi.fn()
  })
}));

vi.mock('../../../../src/features/settings/workflowMode.js', () => ({
  getWorkflowModeLabel: () => 'MSME',
  isWorkflowPageVisible: () => true,
  isWorkflowPageModeSensitive: () => false
}));

vi.mock('../../../../src/features/onboarding/components/OnboardingSetupModal.jsx', () => ({
  default: () => null,
  OnboardingReminderBanner: () => null
}));

vi.mock('../../../../src/services/onboardingService.js', () => ({
  trackOnboardingEvent: vi.fn(() => Promise.resolve())
}));

vi.mock('../../../../Components/common/FeedbackWidget', () => ({
  default: () => null
}));

vi.mock('../../../../Components/common/GracePeriodBanner', () => ({
  default: () => null
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('Layout tenant capability status', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authService.getCurrentUser.mockResolvedValue({
      username: 'owner',
      email: 'owner@example.test',
      role: 'admin',
      is_master_admin: false,
      company: { plan: 'premium' }
    });
    mocks.settingsService.getAllSettings.mockResolvedValue({
      tenant_ims_enabled: { value: true },
      tenant_pos_enabled: { value: false }
    });
  });

  it('hydrates tenant-visible capability status from settings and dismisses it', async () => {
    render(
      <MemoryRouter>
        <Layout currentPageName="Dashboard">
          <div>Dashboard content</div>
        </Layout>
      </MemoryRouter>
    );

    await screen.findByText('Platform admin changed your permissions');
    expect(screen.getByText(/POS access is disabled for this company/)).toBeTruthy();
    expect(mocks.settingsService.getAllSettings).toHaveBeenCalledWith({ force: true });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => {
      expect(screen.queryByText(/POS access is disabled for this company/)).toBeNull();
    });
  });

  it('shows blocked-action event copy over hydrated status', async () => {
    render(
      <MemoryRouter>
        <Layout currentPageName="Dashboard">
          <div>Dashboard content</div>
        </Layout>
      </MemoryRouter>
    );

    await screen.findByText(/POS access is disabled for this company/);

    window.dispatchEvent(new CustomEvent('tenant:capability-blocked', {
      detail: {
        title: 'Platform admin changed your permissions',
        message: 'IMS access is disabled for this company. Inventory, purchases, settings, reports, and related workspace tools are unavailable until platform admin enables IMS again.',
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: 'tenant_ims_enabled'
      }
    }));

    await waitFor(() => {
      expect(screen.getAllByText(/IMS access is disabled for this company/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Reason code: TENANT_CAPABILITY_DISABLED')).toBeTruthy();
  });
});
