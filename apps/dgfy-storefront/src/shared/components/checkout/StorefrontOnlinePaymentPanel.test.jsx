/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../services/storefrontOnlinePaymentSession.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    startStorefrontDirectCardPayment: vi.fn()
  };
});

import { StorefrontOnlinePaymentPanel } from './StorefrontOnlinePaymentPanel.jsx';
import { startStorefrontDirectCardPayment } from '../../services/storefrontOnlinePaymentSession.js';

const paymentSession = {
  payment_session_id: 'CPS-TEST-CARD-UI',
  payment_flow: 'direct_card',
  payment_method: 'card',
  status: 'awaiting_payment',
  provider_payment_intent_id: 'pi_test_card_ui'
};

const renderPanel = () => render(
  <StorefrontOnlinePaymentPanel
    billing={{ email: 'customer@example.com' }}
    paymentEnvironment="test"
    paymentSession={paymentSession}
    paymentType="card"
  />
);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('StorefrontOnlinePaymentPanel card states', () => {
  it('does not show payment processing before card submission and highlights invalid fields after submit', () => {
    renderPanel();

    expect(screen.queryByText('Payment processing')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue securely with card' }));

    expect(screen.queryByText('Payment processing')).toBeNull();
    const cardNumberInput = document.querySelector('input[autocomplete="cc-number"]');
    expect(cardNumberInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a valid card number (13–19 digits).')).not.toBeNull();
    expect(cardNumberInput.style.border).toMatch(/dc2626|220, 38, 38/);
    expect(startStorefrontDirectCardPayment).not.toHaveBeenCalled();
  });

  it('shows payment processing only after valid card submission starts', () => {
    let resolvePayment;
    startStorefrontDirectCardPayment.mockReturnValue(new Promise((resolve) => {
      resolvePayment = resolve;
    }));

    renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'Cardholder name' }), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Card number' }), { target: { value: '4242 4242 4242 4242' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expiry (MM/YY)' }), { target: { value: '12/30' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue securely with card' }));

    expect(startStorefrontDirectCardPayment).toHaveBeenCalledOnce();
    expect(screen.getByText('Payment processing')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Starting secure authorization...' }).disabled).toBe(true);

    resolvePayment({ status: 'awaiting_next_action', redirectUrl: null });
  });

  // #963: the panel is the only thing standing between a caller's `billing` prop and PayMongo.
  // Retail omitted the prop entirely and nothing caught it, so assert the forwarding directly.
  it('forwards the caller billing contact into the card payment call', () => {
    let resolvePayment;
    startStorefrontDirectCardPayment.mockReturnValue(new Promise((resolve) => {
      resolvePayment = resolve;
    }));

    renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'Cardholder name' }), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Card number' }), { target: { value: '4242 4242 4242 4242' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expiry (MM/YY)' }), { target: { value: '12/30' } });
    fireEvent.change(screen.getByLabelText('CVC'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue securely with card' }));

    expect(startStorefrontDirectCardPayment).toHaveBeenCalledWith(expect.objectContaining({
      billing: { email: 'customer@example.com' }
    }));

    resolvePayment({ status: 'awaiting_next_action', redirectUrl: null });
  });
});
