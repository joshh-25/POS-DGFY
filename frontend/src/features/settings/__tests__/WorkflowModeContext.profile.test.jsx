// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { WorkflowModeProvider, useWorkflowMode } from '../WorkflowModeContext.jsx';
import { buildStoreProfile } from '@sieitzz/shared-constants/storeProfile';

const browserSessionMock = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'token'),
  refreshBrowserSession: vi.fn()
}));

const settingsServiceMock = vi.hoisted(() => ({
  getAllSettings: vi.fn()
}));

vi.mock('@/services/browserSession.js', () => browserSessionMock);
vi.mock('@/services/settingsService.js', () => settingsServiceMock);

const Probe = () => {
  const { profile, disabledCapabilities } = useWorkflowMode();
  return (
    <div>
      <span data-testid="profile-source">{profile?.provenance?.source_template_id ?? 'none'}</span>
      <span data-testid="profile-modules">{JSON.stringify(profile?.modules || [])}</span>
      <span data-testid="disabled-capabilities">{JSON.stringify(disabledCapabilities)}</span>
    </div>
  );
};

describe('WorkflowModeProvider Store Profile distribution (issue #178 Phase 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserSessionMock.getAccessToken.mockReturnValue('token');
    window.history.replaceState({}, '', '/dashboard');
  });

  afterEach(() => {
    cleanup();
  });

  it('distributes the server-persisted profile when present', async () => {
    const persistedProfile = buildStoreProfile({
      workflowMode: 'fnb',
      disabledCapabilities: ['tableService', 'kitchenQueue', 'restaurantServiceCharge']
    });
    const stampedProfile = { ...persistedProfile, provenance: { ...persistedProfile.provenance, source_template_id: 9 } };
    settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      ops_workflow_mode: { value: 'fnb' },
      ops_disabled_capabilities: { value: ['tableService', 'kitchenQueue', 'restaurantServiceCharge'] },
      ops_store_profile: { value: stampedProfile }
    });

    render(
      <WorkflowModeProvider>
        <Probe />
      </WorkflowModeProvider>
    );

    await waitFor(() => expect(screen.getByTestId('profile-source').textContent).toBe('9'));
    expect(JSON.parse(screen.getByTestId('profile-modules').textContent)).not.toContain('tableService');
    expect(JSON.parse(screen.getByTestId('disabled-capabilities').textContent).sort()).toEqual(
      ['kitchenQueue', 'restaurantServiceCharge', 'tableService'].sort()
    );
  });

  it('rebuilds the profile locally when no persisted profile setting is present', async () => {
    settingsServiceMock.getAllSettings.mockResolvedValueOnce({
      ops_workflow_mode: { value: 'retail' }
    });

    render(
      <WorkflowModeProvider>
        <Probe />
      </WorkflowModeProvider>
    );

    await waitFor(() => expect(screen.getByTestId('profile-source').textContent).toBe('none'));
    expect(JSON.parse(screen.getByTestId('profile-modules').textContent)).toEqual(
      buildStoreProfile({ workflowMode: 'retail' }).modules
    );
  });
});
