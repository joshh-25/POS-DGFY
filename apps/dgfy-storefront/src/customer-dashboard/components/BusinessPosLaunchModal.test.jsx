// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessPosLaunchModal } from './BusinessPosLaunchModal.jsx';

const theme = {
  border: '#CBD5E1',
  infoBg: '#EFF6FF',
  muted: '#64748B',
  primary: '#1A4E8D',
  surface: '#FFFFFF',
  text: '#0F172A'
};

const company = { tenant_id: 'tenant-1', company_name: 'Masu Cafe' };

afterEach(() => {
  cleanup();
});

describe('BusinessPosLaunchModal global PIN flow', () => {
  it('does not render the removed Day Close PIN UI', () => {
    render(
      <BusinessPosLaunchModal
        company={company}
        intent="day_close"
        onClose={vi.fn()}
        onOpenInNewTab={vi.fn()}
        theme={theme}
      />
    );

    expect(screen.queryByText(/Day Close/i)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Open DGFY POS?' })).toBeTruthy();
  });

  it('keeps the one global PIN form and saves it through the global PIN callback', async () => {
    const onConfigureGlobalPin = vi.fn().mockResolvedValue(undefined);

    render(
      <BusinessPosLaunchModal
        company={company}
        intent="global_pin"
        globalPinStatus={{ canConfigureGlobalPin: true, pinConfigured: false }}
        onConfigureGlobalPin={onConfigureGlobalPin}
        onClose={vi.fn()}
        onOpenInNewTab={vi.fn()}
        theme={theme}
      />
    );

    fireEvent.change(screen.getByLabelText('Current account password'), { target: { value: 'Admin123!' } });
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText('Confirm new PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set PIN' }));

    await waitFor(() => expect(onConfigureGlobalPin).toHaveBeenCalledWith({ currentPassword: 'Admin123!', pin: '1234' }));
    expect(screen.getByRole('status').textContent).toContain('global PIN for permitted POS actions in Masu Cafe');
    expect(screen.queryByText(/Day Close/i)).toBeNull();
  });
});
