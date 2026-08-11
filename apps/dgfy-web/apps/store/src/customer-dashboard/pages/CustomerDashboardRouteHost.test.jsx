/** @vitest-environment jsdom */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerDashboardRouteHost } from './CustomerDashboardRouteHost.jsx';

describe('CustomerDashboardRouteHost', () => {
  it('opens customer sign-in when a signed-out user visits the standalone account route', async () => {
    const onOpenAuth = vi.fn();

    render(
      <CustomerDashboardRouteHost
        isStandaloneRoute
        isSignedIn={false}
        isSessionResolved
        guestAuth={{ onOpenAuth }}
      />
    );

    await waitFor(() => expect(onOpenAuth).toHaveBeenCalledTimes(1));
  });
});
