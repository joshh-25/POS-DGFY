/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StorefrontTransactionExpiredModal } from './StorefrontTransactionExpiredModal.jsx';

afterEach(cleanup);

describe('StorefrontTransactionExpiredModal', () => {
  it('shows the expiry message and lets the shopper return to Step 1', () => {
    const onClose = vi.fn();

    render(<StorefrontTransactionExpiredModal open onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Transaction expired' })).not.toBeNull();
    expect(screen.getByText(/verification code expired/i)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Step 1' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render while closed', () => {
    render(<StorefrontTransactionExpiredModal onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
