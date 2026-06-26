// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkflowModeRouteGate from '../WorkflowModeRouteGate.jsx';

const workflowModeState = vi.hoisted(() => ({
  current: {
    loading: false,
    resolved: false,
    workflowMode: 'food_manufacturing'
  }
}));

vi.mock('../../WorkflowModeContext.jsx', () => ({
  useWorkflowMode: () => workflowModeState.current
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn()
  }
}));

describe('WorkflowModeRouteGate', () => {
  afterEach(() => {
    cleanup();
    workflowModeState.current = {
      loading: false,
      resolved: false,
      workflowMode: 'food_manufacturing'
    };
  });

  it('does not mount gated content until workflow mode is resolved', () => {
    render(
      <MemoryRouter initialEntries={['/job-orders']}>
        <Routes>
          <Route
            path="/job-orders"
            element={(
              <WorkflowModeRouteGate blockInFnb moduleLabel="Job Orders">
                <div>Job order page mounted</div>
              </WorkflowModeRouteGate>
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Unable to confirm workspace mode. Refresh and try again.')).toBeTruthy();
    expect(screen.queryByText('Job order page mounted')).toBeNull();
  });
});
