/* @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StorefrontTrackingStatusCard } from './StorefrontTrackingStatusCard.jsx';

afterEach(cleanup);

describe('StorefrontTrackingStatusCard', () => {
  it('renders compact shared status copy with the supplied palette', () => {
    const { getByRole, getByText } = render(
      <StorefrontTrackingStatusCard
        title="Order placed"
        description="We received your order."
        icon={<span>icon</span>}
        accentColor="#176b3a"
        background="#fff8e7"
        borderColor="#e4c98e"
        bodyFont="Arial"
        displayFont="Georgia"
      />
    );

    const card = getByRole('region', { name: 'Current order status' });
    expect(getByText('Order placed')).toBeTruthy();
    expect(getByText('We received your order.')).toBeTruthy();
    expect(card.style.padding).toBe('18px');
    expect(card.style.border).toContain('1px solid');
    expect(getByText('Order placed').style.fontSize).toBe('20px');
  });

  it('tightens typography and padding on mobile', () => {
    const { getByRole } = render(
      <StorefrontTrackingStatusCard
        title="Ready for pickup"
        icon={<span>icon</span>}
        accentColor="#176b3a"
        background="#fff8e7"
        borderColor="#e4c98e"
        isMobileViewport
      />
    );

    const card = getByRole('region', { name: 'Current order status' });
    expect(card.style.padding).toBe('16px');
    expect(card.querySelector('h2').style.fontSize).toBe('18px');
  });
});
