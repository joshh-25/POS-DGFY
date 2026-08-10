/** @vitest-environment jsdom */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmActionDialog from '../ConfirmActionDialog.jsx';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

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

  it('removes browser-native confirms from the governed flows', () => {
    [
      'Pages/Settings.jsx',
      'Pages/admin/PaymentOperations.jsx',
      'src/features/pos/components/TerminalOperationsWorkspace.jsx'
    ].forEach((relativePath) => {
      const source = fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/(?:window\.)?confirm\s*\(/);
      expect(source).toContain('ConfirmActionDialog');
    });
  });
});
