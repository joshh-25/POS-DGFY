import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reactivate from '../../../Pages/Reactivate.jsx';

vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  PayPalButtons: () => React.createElement('div', null, 'PayPal Buttons')
}));

vi.mock('../../services/paymentService.js', () => ({
  reactivateWithPayPal: vi.fn(),
  requestReactivationPublic: vi.fn()
}));

const renderPage = ({ entry, envOverrides }) => {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reactivate" element={<Reactivate envOverrides={envOverrides} />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Reactivate page PayPal fallback (component)', () => {
  it('shows explicit fallback and keeps admin reactivation path when PayPal config is missing', () => {
    const html = renderPage({
      entry: '/reactivate?token=company-token&plan=standard',
      envOverrides: {
        VITE_PAYPAL_STANDARD_PLAN_ID: 'P-STANDARD'
      }
    });

    expect(html).toContain('PayPal is temporarily unavailable.');
    expect(html).toContain('missing VITE_PAYPAL_CLIENT_ID');
    expect(html).toContain('Request Admin Reactivation');
  });

  it('shows invalid-link recovery when company token is absent', () => {
    const html = renderPage({
      entry: '/reactivate?plan=premium',
      envOverrides: {
        VITE_PAYPAL_CLIENT_ID: 'client',
        VITE_PAYPAL_PREMIUM_PLAN_ID: 'P-PREMIUM'
      }
    });

    expect(html).toContain('Invalid Link');
    expect(html).toContain('Back to Login');
  });
});
