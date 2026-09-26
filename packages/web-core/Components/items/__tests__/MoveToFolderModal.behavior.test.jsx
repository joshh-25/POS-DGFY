// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MoveToFolderModal from '../MoveToFolderModal.jsx';

afterEach(() => {
  cleanup();
  document.body.style.overflow = 'unset';
});

const renderMoveModal = (onMove) => {
  const onClose = vi.fn();

  render(
    <MoveToFolderModal
      open
      onClose={onClose}
      folders={['Breakfast', 'Lunch']}
      currentFolder="Breakfast"
      itemName="Iced Tea"
      onMove={onMove}
    />
  );

  return onClose;
};

describe('MoveToFolderModal behavior', () => {
  it('waits for a successful move before closing', async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    const onClose = renderMoveModal(onMove);

    fireEvent.click(screen.getByRole('button', { name: /Lunch/ }));

    expect(onMove).toHaveBeenCalledWith('Lunch');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('prevents duplicate moves while the request is pending', async () => {
    let resolveMove;
    const onMove = vi.fn(() => new Promise((resolve) => {
      resolveMove = resolve;
    }));
    const onClose = renderMoveModal(onMove);
    const destination = screen.getByRole('button', { name: /Lunch/ });

    fireEvent.click(destination);
    await waitFor(() => expect(destination.disabled).toBe(true));
    fireEvent.click(destination);

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Moving…')).toBeTruthy();

    resolveMove(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the modal open when the move reports failure', async () => {
    const onMove = vi.fn().mockResolvedValue(false);
    const onClose = renderMoveModal(onMove);

    fireEvent.click(screen.getByRole('button', { name: /Lunch/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(false));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Lunch/ }).disabled).toBe(false);
  });
});
