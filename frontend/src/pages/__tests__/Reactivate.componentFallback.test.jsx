import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Reactivate from '../../../Pages/Reactivate.jsx';

const renderPage = ({ entry }) => {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reactivate" element={<Reactivate />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Reactivate page (subscriptions disabled)', () => {
  it('shows subscriptions-disabled message', () => {
    const html = renderPage({
      entry: '/reactivate?token=company-token&plan=standard'
    });

    expect(html).toContain('Subscription Reactivation Unavailable');
    expect(html).toContain('Payment subscription workflows are currently disabled');
    expect(html).toContain('Back to Login');
  });
});

