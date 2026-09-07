/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StorefrontTrackingTimeline } from './StorefrontTrackingTimeline.jsx';

afterEach(cleanup);

const steps = [
  { id: 'placed', label: 'Order placed' },
  { id: 'confirmed', label: 'Order confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'delivered', label: 'Delivered' },
];

describe('StorefrontTrackingTimeline', () => {
  it('stacks mobile steps with readable rows and connectors', () => {
    render(<StorefrontTrackingTimeline steps={steps} activeStepIndex={1} isMobileViewport />);

    const timeline = screen.getByRole('region', { name: 'Order progress' });
    expect(timeline.dataset.orientation).toBe('vertical');
    expect(timeline.style.gridTemplateColumns).toBe('1fr');
    expect(screen.getAllByTestId('storefront-tracking-step')).toHaveLength(4);
    expect(timeline.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect(timeline.querySelector('[aria-current="step"]').textContent).toContain('Order confirmed');
  });

  it('retains the horizontal desktop grid and active progress semantics', () => {
    render(<StorefrontTrackingTimeline steps={steps} activeStepIndex={2} isMobileViewport={false} />);

    const timeline = screen.getByRole('region', { name: 'Order progress' });
    expect(timeline.dataset.orientation).toBe('horizontal');
    expect(timeline.style.display).toBe('grid');
    expect(timeline.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
    expect(timeline.style.overflowX).toBe('hidden');
    expect(timeline.querySelector('[aria-current="step"]').textContent).toContain('Preparing');
  });

  it('respects explicit step states supplied by service tracking flows', () => {
    render(
      <StorefrontTrackingTimeline
        steps={steps.map((step, index) => ({ ...step, state: index === 0 ? 'done' : index === 1 ? 'active' : 'pending' }))}
        activeStepIndex={0}
        isMobileViewport
      />
    );

    expect(screen.getByRole('region', { name: 'Order progress' }).querySelector('[aria-current="step"]').textContent).toContain('Order confirmed');
  });
});
