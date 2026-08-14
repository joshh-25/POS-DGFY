// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressEditorModal } from './AddressEditorModal.jsx';

const theme = {
  surface: '#ffffff',
  bg: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#1a4e8d',
  infoBg: '#eff6ff',
  info: '#1d4ed8'
};

const renderModal = (isMobileViewport) => render(
  <AddressEditorModal
    isMobileViewport={isMobileViewport}
    theme={theme}
    addressModalMode="create"
    addressDraft={{ label: '', address_line: '', is_default: true }}
    setAddressDraft={vi.fn()}
    onClose={vi.fn()}
    onSubmit={vi.fn()}
    renderAddressPinEditor={({ renderFormRow, showDefaultAddressNote }) => (
      <div data-testid="address-pin-editor">
        {showDefaultAddressNote && <div>This will be set as your default address automatically.</div>}
        {renderFormRow({ isExpanded: false })}
      </div>
    )}
    accountAddressActionId=""
    fieldStyle={{}}
  />
);

afterEach(() => {
  cleanup();
});

describe('AddressEditorModal responsive layout', () => {
  it('gives the desktop map and address fields a wider layout', () => {
    renderModal(false);

    const heading = screen.getByRole('heading', { name: 'Add New Address' });
    const modal = heading.parentElement.parentElement;
    const formRow = screen.getByLabelText('Full Delivery Address').parentElement.parentElement;

    expect(modal.style.maxWidth).toBe('min(1440px, calc(100vw - 32px))');
    expect(modal.style.height).toBe('calc(100dvh - 32px)');
    expect(modal.style.maxHeight).toBe('calc(100dvh - 32px)');
    expect(modal.style.overflowY).toBe('hidden');
    expect(formRow.style.gridTemplateColumns).toBe('1fr 1fr');
    expect(screen.getByTestId('address-editor-actions').style.justifyContent).toBe('flex-end');
    expect(screen.getByRole('button', { name: 'Cancel' }).style.minWidth).toBe('112px');
    expect(screen.getByRole('button', { name: 'Save Address' }).style.minWidth).toBe('148px');
    expect(screen.getByText('This will be set as your default address automatically.')).toBeTruthy();
  });

  it('uses the bottom-drawer layout and hides the create-address helper on mobile', () => {
    renderModal(true);

    const heading = screen.getByRole('heading', { name: 'Add New Address' });
    const modal = heading.parentElement.parentElement;
    const formRow = screen.getByLabelText('Full Delivery Address').parentElement.parentElement;

    expect(modal.style.maxHeight).toBe('calc(100dvh - 8px)');
    expect(modal.style.height).toBe('auto');
    expect(modal.style.overflowY).toBe('auto');
    expect(formRow.style.gridTemplateColumns).toBe('1fr');
    expect(screen.getByTestId('address-editor-actions').style.flexWrap).toBe('wrap');
    expect(screen.getByRole('button', { name: 'Cancel' }).style.minWidth).toBe('104px');
    expect(screen.getByRole('button', { name: 'Save Address' }).style.minWidth).toBe('136px');
    expect(screen.queryByText('This will be set as your default address automatically.')).toBeNull();
  });
});
