import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Reactivate from '../../../Pages/Reactivate.jsx';

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children)
}));

describe('Reactivate page (subscriptions disabled)', () => {
  it('shows subscriptions-disabled message', () => {
    const html = renderToStaticMarkup(<Reactivate />);

    expect(html).toContain('Subscription Reactivation Unavailable');
    expect(html).toContain('Payment subscription workflows are currently disabled');
    expect(html).toContain('Back to Login');
    expect(html).toContain('href="/login"');
  });
});
