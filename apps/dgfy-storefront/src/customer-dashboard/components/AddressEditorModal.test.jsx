// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  info: '#1d4ed8',
  orange: '#b91c1c',
  orangeBg: '#fef2f2'
};

const baseDraft = { label: '', address_line: 'Ibarra Street, Iloilo City', is_default: true };

const renderModal = (overrides = {}) => {
  const props = {
    isMobileViewport: false,
    theme,
    addressModalMode: 'create',
    addressDraft: baseDraft,
    setAddressDraft: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    renderAddressPinEditor: ({ renderFormRow, showDefaultAddressNote }) => (
      <div data-testid="address-pin-editor">
        {showDefaultAddressNote ? <div>Saved as default</div> : null}
        {renderFormRow({ isExpanded: false })}
        <div data-testid="map-placeholder">Map</div>
      </div>
    ),
    accountAddressActionId: '',
    fieldStyle: {}
  };
  const result = render(<AddressEditorModal {...props} {...overrides} />);
  return { ...result, props: { ...props, ...overrides } };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AddressEditorModal responsive layout', () => {
  it('uses a compact centered dialog with a scrollable body and sticky actions on desktop', () => {
    renderModal();

    const modal = screen.getByRole('dialog');
    const formRow = screen.getByTestId('address-editor-fields');
    const actions = screen.getByTestId('address-editor-actions');

    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.style.maxWidth).toBe('min(820px, calc(100vw - 32px))');
    expect(modal.style.height).toBe('auto');
    expect(modal.style.maxHeight).toBe('90dvh');
    expect(modal.style.overflow).toBe('hidden');
    expect(screen.getByTestId('address-editor-scroll-region').style.overflowY).toBe('auto');
    expect(formRow.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(actions.style.justifyContent).toBe('flex-end');
    expect(actions.style.flexWrap).toBe('nowrap');
    expect(screen.getByText('Saved as default')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' }).style.minWidth).toBe('112px');
    expect(screen.getByRole('button', { name: 'Save Address' }).style.minWidth).toBe('148px');
  });

  it('uses a full-width bottom sheet with equal-width actions on mobile', () => {
    renderModal({ isMobileViewport: true });

    const modal = screen.getByRole('dialog');
    const formRow = screen.getByTestId('address-editor-fields');
    const actions = screen.getByTestId('address-editor-actions');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save Address' });

    expect(modal.style.width).toBe('100%');
    expect(modal.style.height).toBe('auto');
    expect(modal.style.maxHeight).toBe('92dvh');
    expect(modal.style.borderRadius).toBe('20px 20px 0 0');
    expect(formRow.style.gridTemplateColumns).toBe('1fr');
    expect(actions.style.flexWrap).toBe('nowrap');
    expect(cancel.style.flex).toBe('1 1 0%');
    expect(save.style.flex).toBe('1 1 0%');
    expect(cancel.style.minWidth).toBe('0px');
    expect(save.style.minWidth).toBe('0px');
  });

  it('prefills edit mode and keeps the default control visible', () => {
    renderModal({
      addressModalMode: 'edit-10',
      addressDraft: { label: 'Home', address_line: 'Ibarra Street, Iloilo City', is_default: true }
    });

    expect(screen.getByRole('heading', { name: 'Edit Address' })).toBeTruthy();
    expect(screen.getByDisplayValue('Home')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Set as default address' }).checked).toBe(true);
    expect(screen.queryByText('Saved as default')).toBeNull();
    expect(screen.getByText('Update this saved location.')).toBeTruthy();
  });

  it('disables close and save controls while an address save is in progress', () => {
    renderModal({ accountAddressActionId: 'save:10' });

    expect(screen.getByRole('button', { name: 'Close address editor' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Saving...' }).disabled).toBe(true);
  });

  it('shows an inline error when the save callback reports failure', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    renderModal({ onSubmit });

    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('We could not save this address.'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape when the draft is unchanged', () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('protects a dirty draft before closing', () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    function ControlledModal() {
      const [draft, setDraft] = useState(baseDraft);
      return <AddressEditorModal {...{
        isMobileViewport: true,
        theme,
        addressModalMode: 'create',
        addressDraft: draft,
        setAddressDraft: setDraft,
        onClose,
        onSubmit: vi.fn(),
        renderAddressPinEditor: ({ renderFormRow }) => renderFormRow({}),
        accountAddressActionId: '',
        fieldStyle: {}
      }} />;
    }

    render(<ControlledModal />);
    fireEvent.change(screen.getByLabelText(/Full Delivery Address/), { target: { value: 'New address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirm).toHaveBeenCalledWith('Discard your unsaved address changes?');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks background scrolling and focuses the primary field', async () => {
    renderModal();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Full Delivery Address/)));
  });
});
