/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosDateRangeFilterPanel from '../components/PosDateRangeFilterPanel.jsx';
import PosReportsDateFilterPanel from '../components/PosReportsDateFilterPanel.jsx';

const baseProps = {
  open: true,
  dateRange: { dateFrom: '2026-09-18', dateTo: '2026-09-18' },
  onClose: vi.fn()
};
const defaultViewportHeight = window.innerHeight;
const defaultViewportWidth = window.innerWidth;
const defaultMatchMedia = window.matchMedia;

describe('POS reports date filter modal', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: defaultViewportHeight });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: defaultViewportWidth });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: defaultMatchMedia });
  });

  it('fits the Reports date dialog to its content when a desktop viewport has room', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });

    render(<PosReportsDateFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Select Date' });
    expect(panel.className).toContain('h-auto');
    expect(panel.className).toContain('max-h-[min(90vh,40rem)]');
    expect(panel.style.height).toBe('');
  });

  it('leaves other shared date dialogs on their existing fixed-height layout', () => {
    render(<PosDateRangeFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Select Date' });
    expect(panel.className).toContain('h-[min(90vh,40rem)]');
    expect(panel.className).not.toContain('h-auto');
  });

  it('keeps the Reports calendar scrollable when the available desktop height is short', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });

    render(<PosReportsDateFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Select Date' });
    const content = panel.children[1];
    expect(panel.style.height).toBe('404px');
    expect(panel.style.maxHeight).toBe('404px');
    expect(content.className).toContain('overflow-y-auto');
  });

  it('stages a quick date preset until Apply Filters is selected', () => {
    const onApplyDateRange = vi.fn();
    render(<PosReportsDateFilterPanel {...baseProps} onApplyDateRange={onApplyDateRange} />);

    expect(screen.getByRole('dialog', { name: 'Select Date' })).toBeTruthy();
    const presetGroup = screen.getByRole('group', { name: 'Date presets' });
    expect(presetGroup.className).toContain('grid-cols-2');
    expect(presetGroup.querySelector('button')?.className).toContain('h-8');
    expect(presetGroup.querySelector('button')?.className).toContain('min-w-0');
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 Days' }));
    expect(onApplyDateRange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
    expect(onApplyDateRange).toHaveBeenCalledWith({ dateFrom: expect.any(String), dateTo: expect.any(String) });
  });

  it('supports pointer-dragging from a start date to an end date', () => {
    const onApplyDateRange = vi.fn();
    render(<PosReportsDateFilterPanel {...baseProps} onApplyDateRange={onApplyDateRange} />);

    const start = screen.getByRole('gridcell', { name: 'Sep 10, 2026' });
    const end = screen.getByRole('gridcell', { name: 'Sep 18, 2026' });
    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.pointerEnter(end, { pointerId: 1 });
    fireEvent.pointerUp(end, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));

    expect(onApplyDateRange).toHaveBeenCalledWith({ dateFrom: '2026-09-10', dateTo: '2026-09-18' });
  });

  it('uses the shared History dialog shell and closes on overlay input', () => {
    const onClose = vi.fn();
    render(<PosReportsDateFilterPanel {...baseProps} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Select Date' }).getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('[data-dialog-overlay="true"]')).toBeTruthy();

    fireEvent.click(document.querySelector('[data-dialog-overlay="true"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a bounded, independently scrollable calendar area on a short viewport', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true })
    });

    render(<PosReportsDateFilterPanel {...baseProps} />);

    const panel = screen.getByRole('dialog', { name: 'Select Date' });
    const content = panel.children[1];
    expect(panel.style.maxHeight).toBe('');
    expect(panel.className).toContain('dgfy-pos-history-mobile-sheet');
    expect(content.className).toContain('min-h-0');
    expect(content.className).toContain('overflow-y-auto');
    expect(panel.querySelector('header').className).toContain('shrink-0');
    expect(panel.querySelector('footer').className).toContain('shrink-0');
  });
});
