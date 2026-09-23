/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsAdjustmentKpiCards from '../components/PosReportsAdjustmentKpiCards.jsx';

describe('POS reports adjustment KPI cards', () => {
  afterEach(() => cleanup());

  it('omits all adjustment KPI cards when there are no events or rows', () => {
    const { container } = render(<PosReportsAdjustmentKpiCards summary={{ adjustment_count: 0 }} rows={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('keeps the shared KPI cards when the summary reports adjustment activity', () => {
    render(
      <PosReportsAdjustmentKpiCards
        summary={{
          adjustment_count: 2,
          succeeded_amount: 25,
          pending_amount: 10,
          manual_review_amount: 5
        }}
      />
    );

    expect(screen.getByRole('group', { name: 'Adjustment summary' }).className).toContain('grid-cols-2');
    expect(screen.getByText('Adjustment events').closest('article').className).toContain('rounded-xl');
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('₱25.00')).toBeTruthy();
    expect(screen.getByText('₱10.00')).toBeTruthy();
    expect(screen.getByText('₱5.00')).toBeTruthy();
  });

  it('keeps the cards if adjustment rows exist even when the summary count is zero', () => {
    render(<PosReportsAdjustmentKpiCards summary={{ adjustment_count: 0 }} rows={[{ id: 1 }]} />);

    expect(screen.getByText('Adjustment events')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });
});
