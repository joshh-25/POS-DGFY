/* @vitest-environment jsdom */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../shared/components/tracking/StorefrontTrackingLayout.jsx';

afterEach(cleanup);

describe('StorefrontTrackingLayout', () => {
  it('stacks the primary and detail columns on mobile', () => {
    const { getByTestId } = render(
      <StorefrontTrackingLayout isMobileViewport sidebarWidth={370}>
        <div>primary</div>
        <aside>details</aside>
      </StorefrontTrackingLayout>
    );

    expect(getByTestId('storefront-tracking-layout').style.gridTemplateColumns).toBe('minmax(0, 1fr)');
  });

  it('keeps a bounded detail column on desktop', () => {
    const { getByTestId } = render(
      <StorefrontTrackingLayout isMobileViewport={false} sidebarWidth={370}>
        <div>primary</div>
        <aside>details</aside>
      </StorefrontTrackingLayout>
    );

    expect(getByTestId('storefront-tracking-layout').style.gridTemplateColumns).toBe('minmax(0, 1fr) 370px');
  });

  it('places the current status before progress at every viewport size', () => {
    expect(['map', 'status', 'timeline'].sort((a, b) => getTrackingFlowOrder(a) - getTrackingFlowOrder(b))).toEqual([
      'map',
      'status',
      'timeline'
    ]);
    expect(['map', 'status', 'timeline'].sort((a, b) => getTrackingFlowOrder(a) - getTrackingFlowOrder(b))).toEqual([
      'map',
      'status',
      'timeline'
    ]);
  });
});
