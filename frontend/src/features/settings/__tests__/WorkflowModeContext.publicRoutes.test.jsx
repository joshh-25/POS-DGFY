// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { WorkflowModeProvider } from '../WorkflowModeContext.jsx';

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
});
