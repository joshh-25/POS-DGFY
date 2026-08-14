// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { WorkflowModeProvider, useWorkflowMode } from '../WorkflowModeContext.jsx';

const browserSessionMock = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => ''),
  refreshBrowserSession: vi.fn()
}));

const settingsServiceMock = vi.hoisted(() => ({
  getAllSettings: vi.fn()
}));

vi.mock('@/services/browserSession.js', () => browserSessionMock);
vi.mock('@/services/settingsService.js', () => settingsServiceMock);

describe('WorkflowModeProvider public routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/register-company?source=dgfy&auth=login#business-registration');
  });

  afterEach(() => {
    cleanup();
  });

  it('does not refresh tenant session or load tenant workflow settings on DGFY registration routes', async () => {
    render(
      <WorkflowModeProvider>
        <div>public registration</div>
      </WorkflowModeProvider>
    );

    await waitFor(() => expect(browserSessionMock.refreshBrowserSession).not.toHaveBeenCalled());
    expect(settingsServiceMock.getAllSettings).not.toHaveBeenCalled();
  });

  it('marks tenant workflow mode unresolved when tenant settings fail to load', async () => {
    const Probe = () => {
      const { loading, resolved, workflowMode } = useWorkflowMode();
      return (
        <div>
          <span data-testid="loading">{String(loading)}</span>
          <span data-testid="resolved">{String(resolved)}</span>
          <span data-testid="mode">{workflowMode}</span>
        </div>
      );
    };
    window.history.replaceState({}, '', '/dashboard');
    browserSessionMock.getAccessToken.mockReturnValue('token');
    settingsServiceMock.getAllSettings.mockRejectedValueOnce(new Error('settings unavailable'));

    render(
      <WorkflowModeProvider>
        <Probe />
      </WorkflowModeProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('resolved').textContent).toBe('false');
    expect(screen.getByTestId('mode').textContent).toBe('food_manufacturing');
  });
});
