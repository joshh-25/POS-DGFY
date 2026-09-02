// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAddressPinEditorRenderer } from './addressPinEditorRenderer.jsx';

const renderPinEditor = (isMobileViewport, renderFormRow = () => null) => {
  const DeliveryPinMap = ({ height }) => <div data-testid="delivery-pin-map" data-height={height} />;
  const renderer = createAddressPinEditorRenderer({
    DeliveryPinMap,
    accountAddressPinAction: { loading: false, mode: '', error: '' },
    applyAccountAddressPin: vi.fn(),
    handleAccountAddressCurrentLocation: vi.fn(),
    isMobileViewport,
    normalizeCoordinatePair: () => null
  });

  render(renderer({ renderFormRow }));
  return screen.getByTestId('delivery-pin-map');
};

afterEach(() => cleanup());

describe('AddressPinEditorRenderer map sizing', () => {
  it('uses a compact map height on mobile', () => {
    expect(renderPinEditor(true).getAttribute('data-height')).toBe('clamp(220px, 40svh, 320px)');
  });

  it('uses a compact map height for tablet and desktop layouts', () => {
    expect(renderPinEditor(false).getAttribute('data-height')).toBe('clamp(260px, 38vh, 380px)');
  });

  it('renders the map before the address fields', () => {
    renderPinEditor(false, () => <div data-testid="address-fields">Address fields</div>);

    const map = screen.getByTestId('delivery-pin-map');
    const fields = screen.getByTestId('address-fields');
    expect(Boolean(map.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
