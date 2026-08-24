/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TenantCapabilityNotice from '../TenantCapabilityNotice.jsx';

describe('TenantCapabilityNotice', () => {
  it('renders platform-admin capability status and dismisses', () => {
    const onDismiss = vi.fn();

    render(
      <TenantCapabilityNotice
        notice={{
          title: 'Platform admin changed your permissions',
          message: 'POS access is disabled for this company. Catalog, checkout, scanning, and POS transactions are unavailable until platform admin enables POS again.',
          code: 'TENANT_CAPABILITY_DISABLED'
        }}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Platform admin changed your permissions')).toBeTruthy();
    expect(screen.getByText(/POS access is disabled for this company/)).toBeTruthy();
    expect(screen.getByText('Reason code: TENANT_CAPABILITY_DISABLED')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render without a message', () => {
    const { container } = render(<TenantCapabilityNotice notice={{ title: 'Hidden' }} />);
    expect(container.innerHTML).toBe('');
  });
});
