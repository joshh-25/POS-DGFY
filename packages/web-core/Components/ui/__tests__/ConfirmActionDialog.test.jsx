/** @vitest-environment jsdom */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmActionDialog from '../ConfirmActionDialog.jsx';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Pages/ (other than the 4 DGFY pages) did not move into this package -- see
// docs/architecture/frontend-split-sync.md.
const appRoot = path.resolve(frontendRoot, '../../apps/dgfy-ims');
const adminRoot = path.resolve(frontendRoot, '../../apps/dgfy-admin');

afterEach(cleanup);

describe('ConfirmActionDialog', () => {
  it('closes only after a successful async action', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Confirm action"
        description="This action changes saved data."
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the dialog open and exposes mutation errors', async () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmActionDialog
        open
        onOpenChange={onOpenChange}
        title="Delete pin"
        description="This cannot be undone."
        variant="destructive"
        onConfirm={vi.fn().mockResolvedValue({ success: false, message: 'Location still has references.' })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Location still has references.');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('requires and forwards a governed action reason', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Reject order"
        description="A refund will be requested."
        reasonLabel="Rejection reason"
        reasonRequired
        reasonMinLength={3}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Rejection reason must be at least 3 characters.'
    );
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Rejection reason/), {
      target: { value: 'Item unavailable' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Item unavailable'));
  });

  it('supports a compact horizontal mobile action row when requested', () => {
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Pause voucher"
        description="This changes the voucher status immediately."
        confirmLabel="Pause"
        mobileHorizontalActions
        onConfirm={vi.fn()}
      />
    );

    const footer = screen.getByRole('button', { name: 'Pause' }).parentElement;
    expect(footer?.className).toContain('max-sm:flex-row');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('flex-none');
  });

  it('supports stacked mobile actions without changing the desktop footer mode', () => {
    render(
      <ConfirmActionDialog
        open
        onOpenChange={vi.fn()}
        title="Pause voucher"
        description="This changes the voucher status immediately."
        confirmLabel="Pause"
        mobileStackedActions
        onConfirm={vi.fn()}
      />
    );

    const footer = screen.getByRole('button', { name: 'Pause' }).parentElement;
    expect(footer?.className).toContain('max-sm:items-stretch');
    const pauseButtonClasses = screen.getByRole('button', { name: 'Pause' }).className.split(/\s+/);
    expect(pauseButtonClasses).toContain('max-sm:w-full');
    expect(pauseButtonClasses).not.toContain('w-full');
  });

  it('removes browser-native confirms from the governed flows', () => {
    [
      [appRoot, 'Pages/Settings.jsx'],
      [adminRoot, 'Pages/PaymentOperations.jsx'],
      [frontendRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx']
    ].forEach(([root, relativePath]) => {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
      expect(source).not.toMatch(/(?:window\.)?confirm\s*\(/);
      expect(source).toContain('ConfirmActionDialog');
    });
  });
});
